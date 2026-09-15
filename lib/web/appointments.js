import { Hono } from "hono";
import { listUserAppointedManagers } from "../db.js";

const logger = console;

const USER_ID = /^[UW][A-Z0-9]+$/i;
const ROLES = ["manager", "moderator"];

const WINDOW_MS = 60 * 1000;
const WINDOW_MAX = 120;
const windows = new Map();

function withinBudget(ip) {
  const now = Date.now();
  const window = windows.get(ip);
  if (!window || window.resetAt <= now) {
    windows.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    if (windows.size > 10000) {
      for (const [id, entry] of windows) if (entry.resetAt <= now) windows.delete(id);
    }
    return { ok: true };
  }
  if (window.count >= WINDOW_MAX) {
    return { ok: false, retryAfter: Math.ceil((window.resetAt - now) / 1000) };
  }
  window.count += 1;
  return { ok: true };
}

function fail(c, status, error, message) {
  return c.json({ ok: false, error, message }, status);
}

function clientIp(c) {
  const cloudflare = c.req.header("cf-connecting-ip");
  if (cloudflare) return cloudflare.trim();

  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  return c.req.header("x-real-ip")?.trim() || "unknown";
}

function describe(value) {
  const said = String(value ?? "");
  return JSON.stringify(said.length > 40 ? `${said.slice(0, 40)}…` : said);
}

function askedRole(value) {
  if (value === undefined) return null;
  if (!ROLES.includes(value)) {
    throw new Error(`Filter by ${ROLES.map((role) => `"${role}"`).join(" or ")}.`);
  }
  return value;
}

function appointment(row) {
  return { channel_id: row.channel_id, role: row.role };
}

export function createAppointmentsRouter() {
  const api = new Hono();

  api.use("*", async (c, next) => {
    const budget = withinBudget(clientIp(c));
    if (!budget.ok) {
      c.header("Retry-After", String(budget.retryAfter));
      return fail(c, 429, "ratelimited", `Slow down! Retry in ${budget.retryAfter}s.`);
    }
    await next();
  });

  api.get("/users/:userId/channels", async (c) => {
    const asked = c.req.param("userId");
    if (!USER_ID.test(asked)) {
      return fail(
        c,
        400,
        "invalid_user",
        `${describe(asked)} is not a Slack user id, like U01ABCDEFGH.`,
      );
    }

    let role;
    try {
      role = askedRole(c.req.query("role"));
    } catch (error) {
      return fail(c, 400, "invalid_role", error.message);
    }

    const userId = asked.toUpperCase();
    const rows = await listUserAppointedManagers(userId);
    const channels = rows.filter((row) => !role || row.role === role).map(appointment);

    return c.json({ ok: true, user: userId, channels });
  });

  api.notFound((c) => fail(c, 404, "unknown_endpoint", "No such endpoint."));

  api.onError((error, c) => {
    logger.error("[appointments]", error);
    return fail(c, 500, "internal_error", "The request could not be completed.");
  });

  return api;
}
