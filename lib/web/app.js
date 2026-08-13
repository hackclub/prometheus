import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { jsxRenderer } from "hono/jsx-renderer";
import { createDashboardAuth, dashboardConfigured } from "./auth.js";
import {
  deleteEmbedRule,
  loadChannelSettings,
  removeAnchor,
  removeWelcome,
  saveAnchorMessage,
  saveAnchorNps,
  saveAnchorPoll,
  saveEmbedRule,
  saveWelcome,
  toggleAnchor,
} from "./channelSettings.js";
import { loadPermissions } from "./permissions.js";
import { DashboardPage, ErrorPage, LandingPage } from "./views.jsx";

const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'none'; style-src 'self'; img-src https: data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function applySecurityHeaders(c) {
  for (const [name, value] of Object.entries(securityHeaders)) c.header(name, value);
}

function redirectFromAuth(response, fallback = "/") {
  const headers = new Headers(response.headers);
  headers.set("Location", headers.get("Location") || fallback);
  headers.delete("Content-Length");
  headers.delete("Content-Type");
  return new Response(null, { headers, status: 302 });
}

function render(c, component, status = 200) {
  c.status(status);
  return c.render(component);
}

function channelRedirect(c, channelId, key, value) {
  const query = new URLSearchParams({ channel: channelId, [key]: value });
  return c.redirect(`/?${query}`, 303);
}

function requestIsSameOrigin(c) {
  const origin = c.req.header("Origin");
  if (!origin) return false;
  const configuredOrigin = process.env.DASHBOARD_BASE_URL
    ? new URL(process.env.DASHBOARD_BASE_URL).origin
    : new URL(c.req.url).origin;
  return origin === configuredOrigin;
}

function channelIdFromInput(input) {
  const value = input?.trim();
  if (!value) return null;
  if (/^[CG][A-Z0-9]+$/i.test(value)) return value.toUpperCase();

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".slack.com")) return null;
    const channelId = url.pathname.split("/").findLast((part) => /^[CG][A-Z0-9]+$/i.test(part));
    return channelId?.toUpperCase() || null;
  } catch {
    return null;
  }
}

export function createWebApp({ client, botClient = client, isHealthy = () => true }) {
  const app = new Hono();
  const dashboardAuth = createDashboardAuth(client);

  app.use("*", jsxRenderer());
  app.use("*", async (c, next) => {
    await next();
    applySecurityHeaders(c);
    if (!c.req.path.startsWith("/assets/")) c.header("Cache-Control", "no-store");
  });

  app.get("/assets/dashboard.css", serveStatic({ path: "./lib/web/dashboard.css" }));

  app.get("/health", async (c) => {
    const healthy = await isHealthy();
    return c.json({ status: healthy ? "ok" : "disconnected" }, healthy ? 200 : 503);
  });

  app.get("/", async (c) => {
    const session = dashboardAuth
      ? await dashboardAuth.auth.api.getSession({
          request: c.req.raw,
          headers: c.req.raw.headers,
          asResponse: false,
        })
      : null;

    if (!session) {
      const ready = dashboardConfigured();
      return render(
        c,
        LandingPage({
          error: ready
            ? c.req.query("auth") === "failed"
              ? "Slack could not complete sign-in for this workspace."
              : null
            : "Dashboard sign-in has not been configured yet.",
        }),
        ready ? 200 : 503,
      );
    }

    const channelInput = c.req.query("channel");
    const requestedChannelId = channelIdFromInput(channelInput);
    const [permissions, teamId] = await Promise.all([
      loadPermissions(client, session.user.slackUserId, botClient, requestedChannelId),
      dashboardAuth.teamId(),
    ]);
    const selectedChannel = requestedChannelId
      ? permissions.channels.find(({ channel_id }) => channel_id === requestedChannelId) || null
      : permissions.channels[0] || null;
    let error = c.req.query("error");
    if (channelInput && !requestedChannelId) {
      error = "Enter a valid Slack channel URL or channel ID.";
    } else if (requestedChannelId && !selectedChannel) {
      error = "That channel was not found or you do not have permission to configure it.";
    }
    const settings = selectedChannel ? await loadChannelSettings(selectedChannel.channel_id) : null;
    return render(
      c,
      DashboardPage({
        error,
        permissions,
        selectedChannel,
        settings,
        status: c.req.query("status"),
        teamId,
        user: session.user,
      }),
    );
  });

  function mutation(path, capability, action, success) {
    app.post(path, async (c) => {
      if (!dashboardAuth) return c.redirect("/");
      if (!requestIsSameOrigin(c)) return c.text("Forbidden", 403);

      const session = await dashboardAuth.auth.api.getSession({
        request: c.req.raw,
        headers: c.req.raw.headers,
        asResponse: false,
      });
      if (!session) return c.redirect("/");

      const channelId = c.req.param("channelId");
      const permissions = await loadPermissions(
        client,
        session.user.slackUserId,
        botClient,
        channelId,
      );
      const channel = permissions.channels.find((item) => item.channel_id === channelId);
      if (!channel || !channel[capability]) return c.text("Forbidden", 403);

      try {
        const form = await c.req.formData();
        await action({ channel, channelId, form, userId: session.user.slackUserId });
        return channelRedirect(c, channelId, "status", success);
      } catch (error) {
        console.error(`[web] ${path} failed in ${channelId}:`, error);
        const message = error instanceof Error ? error.message : "The setting could not be saved.";
        return channelRedirect(c, channelId, "error", message);
      }
    });
  }

  mutation(
    "/channels/:channelId/anchor/message",
    "canAnchor",
    ({ userId, channelId, form }) => saveAnchorMessage(botClient, client, userId, channelId, form),
    "anchor-message-saved",
  );
  mutation(
    "/channels/:channelId/anchor/poll",
    "canAnchor",
    ({ userId, channelId, form }) => saveAnchorPoll(botClient, client, userId, channelId, form),
    "anchor-poll-saved",
  );
  mutation(
    "/channels/:channelId/anchor/nps",
    "canAnchor",
    ({ userId, channelId, form }) => saveAnchorNps(botClient, client, userId, channelId, form),
    "anchor-nps-saved",
  );
  mutation(
    "/channels/:channelId/anchor/toggle",
    "canAnchor",
    ({ userId, channelId, form }) =>
      toggleAnchor(botClient, userId, channelId, form.get("enabled") === "true"),
    "anchor-updated",
  );
  mutation(
    "/channels/:channelId/anchor/delete",
    "canAnchor",
    ({ userId, channelId }) => removeAnchor(botClient, userId, channelId),
    "anchor-removed",
  );
  mutation(
    "/channels/:channelId/welcome",
    "canManage",
    ({ userId, channelId, form }) => saveWelcome(botClient, userId, channelId, form),
    "welcome-saved",
  );
  mutation(
    "/channels/:channelId/welcome/delete",
    "canManage",
    ({ userId, channelId }) => removeWelcome(botClient, userId, channelId),
    "welcome-removed",
  );
  mutation(
    "/channels/:channelId/embeds",
    "canManage",
    ({ userId, channelId, form }) => saveEmbedRule(userId, channelId, form),
    "embed-saved",
  );
  mutation(
    "/channels/:channelId/embeds/delete",
    "canManage",
    ({ channelId, form }) => deleteEmbedRule(channelId, form),
    "embed-removed",
  );

  app.get("/auth/slack", async (c) => {
    if (!dashboardAuth) {
      return render(
        c,
        LandingPage({ error: "Dashboard sign-in has not been configured yet." }),
        503,
      );
    }

    const response = await dashboardAuth.auth.api.signInSocial({
      body: {
        callbackURL: "/",
        errorCallbackURL: "/?auth=failed",
        provider: "slack",
      },
      request: c.req.raw,
      asResponse: true,
    });
    return redirectFromAuth(response);
  });

  app.on(["GET", "POST"], "/api/auth/callback/slack", async (c) => {
    if (!dashboardAuth) return c.notFound();
    const response = await dashboardAuth.auth.handler(c.req.raw);
    return response.status >= 400 ? redirectFromAuth(response, "/?auth=failed") : response;
  });

  app.post("/auth/logout", async (c) => {
    if (!dashboardAuth) return c.redirect("/");
    const response = await dashboardAuth.auth.api.signOut({
      request: c.req.raw,
      asResponse: true,
    });
    return redirectFromAuth(response);
  });

  app.onError((error, c) => {
    console.error("[web]", error);
    applySecurityHeaders(c);
    c.header("Cache-Control", "no-store");
    return render(c, ErrorPage(), 500);
  });

  return app;
}
