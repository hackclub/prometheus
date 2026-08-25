import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";

const SESSION_TTL = 8 * 60 * 60;

function configuredBaseUrl() {
  if (!process.env.DASHBOARD_BASE_URL) return null;

  const url = new URL(process.env.DASHBOARD_BASE_URL);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if ((!local && url.protocol !== "https:") || url.username || url.password) {
    throw new Error("DASHBOARD_BASE_URL must be a public HTTPS origin");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("DASHBOARD_BASE_URL must not include a path, query, or fragment");
  }
  return url;
}

export function dashboardConfigured() {
  try {
    configuredBaseUrl();
    return Boolean(
      process.env.SLACK_CLIENT_ID &&
      process.env.SLACK_CLIENT_SECRET &&
      process.env.BETTER_AUTH_SECRET?.length >= 32,
    );
  } catch {
    return false;
  }
}

export function createDashboardAuth(client) {
  if (!dashboardConfigured()) return null;

  const configuredUrl = configuredBaseUrl();
  const baseURL = configuredUrl?.origin || {
    allowedHosts: ["*"],
    protocol: "auto",
  };
  let teamIdPromise;
  const teamId = () => {
    teamIdPromise ||= client.auth.test().then((result) => result.team_id);
    return teamIdPromise;
  };

  const auth = betterAuth({
    appName: "Prometheus",
    baseURL,
    secret: process.env.BETTER_AUTH_SECRET,
    ...(configuredUrl && { trustedOrigins: [configuredUrl.origin] }),
    socialProviders: {
      slack: {
        clientId: process.env.SLACK_CLIENT_ID,
        clientSecret: process.env.SLACK_CLIENT_SECRET,
        async mapProfileToUser(profile) {
          if (profile["https://slack.com/team_id"] !== (await teamId())) {
            throw new APIError("FORBIDDEN", {
              message: "Sign in with the Slack workspace where Prometheus is installed.",
            });
          }
          return { slackUserId: profile["https://slack.com/user_id"] };
        },
      },
    },
    user: {
      additionalFields: {
        slackUserId: {
          input: true,
          required: true,
          returned: true,
          type: "string",
        },
      },
    },
    session: {
      expiresIn: SESSION_TTL,
      cookieCache: {
        enabled: true,
        maxAge: SESSION_TTL,
        strategy: "jwe",
      },
    },
    account: {
      accountLinking: { enabled: false },
      storeAccountCookie: false,
      storeStateStrategy: "cookie",
    },
    advanced: {
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        ...(configuredUrl && { secure: configuredUrl.protocol === "https:" }),
      },
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for", "x-real-ip"],
      },
    },
  });

  return { auth, teamId };
}
