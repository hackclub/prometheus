import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { jsxRenderer } from "hono/jsx-renderer";
import { createApiRouter } from "./api.js";
import { createApiKey, loadApiKeys, revokeApiKey } from "./apiKeys.js";
import { createDashboardAuth, dashboardConfigured } from "./auth.js";
import { loadPermissions } from "./permissions.js";
import { sectionBySlug, sectionPath } from "./sections.js";
import { DashboardPage, ErrorPage, LandingPage, NoChannelsPage } from "./views.jsx";

const CHANNEL_ID = /^[CG][A-Z0-9]+$/i;

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

function sectionRedirect(c, channelId, slug, key, value) {
  const path = sectionPath(channelId, slug);
  if (!key) return c.redirect(path, 303);
  return c.redirect(`${path}?${new URLSearchParams({ [key]: value })}`, 303);
}

function publicBaseUrl(c) {
  if (process.env.DASHBOARD_BASE_URL) {
    return new URL(process.env.DASHBOARD_BASE_URL).origin;
  }
  return new URL(c.req.url).origin;
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
  if (CHANNEL_ID.test(value)) return value.toUpperCase();

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".slack.com")) return null;
    const channelId = url.pathname.split("/").findLast((part) => CHANNEL_ID.test(part));
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

  app.route("/api/v1", createApiRouter({ botClient, client }));

  function currentSession(c) {
    if (!dashboardAuth) return null;
    return dashboardAuth.auth.api.getSession({
      request: c.req.raw,
      headers: c.req.raw.headers,
      asResponse: false,
    });
  }

  function signInPage(c) {
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

  app.get("/", async (c) => {
    const session = await currentSession(c);
    if (!session) return signInPage(c);

    const channelInput = c.req.query("channel");
    const requestedChannelId = channelIdFromInput(channelInput);
    if (requestedChannelId) return sectionRedirect(c, requestedChannelId, "");

    const permissions = await loadPermissions(client, session.user.slackUserId, botClient);
    const error = channelInput
      ? "Enter a Slack channel link or a channel ID like C0123ABCD."
      : c.req.query("error");
    const [firstChannel] = permissions.channels;
    if (firstChannel) {
      return sectionRedirect(c, firstChannel.channel_id, "", error && "error", error);
    }
    return render(c, NoChannelsPage({ error, permissions, user: session.user }));
  });

  async function renderSection(c, session, channelId, slug, extra = {}) {
    const section = sectionBySlug(slug);
    if (!section) {
      return sectionRedirect(c, channelId, "", "error", "That settings page does not exist.");
    }

    const [permissions, teamId] = await Promise.all([
      loadPermissions(client, session.user.slackUserId, botClient, channelId),
      dashboardAuth.teamId(),
    ]);
    const channel = permissions.channels.find((item) => item.channel_id === channelId);
    if (!channel) {
      const error = "That channel was not found, or you cannot configure it.";
      const [firstChannel] = permissions.channels;
      if (firstChannel) return sectionRedirect(c, firstChannel.channel_id, "", "error", error);
      return render(c, NoChannelsPage({ error, permissions, user: session.user }));
    }

    if (section.capability && !channel[section.capability]) {
      return sectionRedirect(
        c,
        channelId,
        "",
        "error",
        `Your role cannot change ${section.title.toLowerCase()} in this channel.`,
      );
    }

    const apiKeys = await loadApiKeys(channelId, session.user.slackUserId);
    return render(
      c,
      DashboardPage({
        baseUrl: publicBaseUrl(c),
        error: c.req.query("error"),
        permissions,
        section,
        selectedChannel: channel,
        settings: { apiKeys },
        status: c.req.query("status"),
        teamId,
        user: session.user,
        ...extra,
      }),
    );
  }

  app.get("/c/:channelId/:section?", async (c) => {
    const session = await currentSession(c);
    if (!session) return c.redirect("/");

    const rawChannelId = c.req.param("channelId");
    if (!CHANNEL_ID.test(rawChannelId)) return c.redirect("/", 303);
    const channelId = rawChannelId.toUpperCase();
    const slug = c.req.param("section") || "";
    if (rawChannelId !== channelId) return sectionRedirect(c, channelId, slug);

    return renderSection(c, session, channelId, slug);
  });

  async function authorize(c, capability) {
    if (!dashboardAuth) return { response: c.redirect("/") };
    if (!requestIsSameOrigin(c)) return { response: c.text("Forbidden", 403) };

    const session = await currentSession(c);
    if (!session) return { response: c.redirect("/") };

    const rawChannelId = c.req.param("channelId");
    if (!CHANNEL_ID.test(rawChannelId)) return { response: c.text("Forbidden", 403) };
    const channelId = rawChannelId.toUpperCase();

    const permissions = await loadPermissions(
      client,
      session.user.slackUserId,
      botClient,
      channelId,
    );
    const channel = permissions.channels.find((item) => item.channel_id === channelId);
    if (!channel || !channel[capability]) return { response: c.text("Forbidden", 403) };

    return { channel, channelId, session, userId: session.user.slackUserId };
  }

  app.post("/channels/:channelId/keys", async (c) => {
    const auth = await authorize(c, "canManage");
    if (auth.response) return auth.response;

    try {
      const form = await c.req.formData();
      const { key } = await createApiKey(botClient, auth.userId, auth.channelId, form);
      return renderSection(c, auth.session, auth.channelId, "", { createdKey: key });
    } catch (error) {
      console.error(`[web] key creation failed in ${auth.channelId}:`, error);
      const message = error instanceof Error ? error.message : "The key could not be created.";
      return sectionRedirect(c, auth.channelId, "", "error", message);
    }
  });

  app.post("/channels/:channelId/keys/revoke", async (c) => {
    const auth = await authorize(c, "canManage");
    if (auth.response) return auth.response;

    try {
      const form = await c.req.formData();
      await revokeApiKey(botClient, auth.userId, auth.channelId, form);
      return sectionRedirect(c, auth.channelId, "", "status", "key-revoked");
    } catch (error) {
      console.error(`[web] key revocation failed in ${auth.channelId}:`, error);
      const message = error instanceof Error ? error.message : "The key could not be revoked.";
      return sectionRedirect(c, auth.channelId, "", "error", message);
    }
  });

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
