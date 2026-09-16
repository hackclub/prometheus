import { Hono } from "hono";
import {
  listAppointedManagers,
  listAppointedManagersPage,
  listUserAppointedManagers,
} from "../db.js";

const logger = console;

const USER_ID = /^[UW][A-Z0-9]{8,}$/i;
const CHANNEL_ID = /^[CG][A-Z0-9]{8,}$/i;
const ROLES = ["manager", "moderator"];

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

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

function refuse(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
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
    throw refuse("invalid_role", `Filter by ${ROLES.map((role) => `"${role}"`).join(" or ")}.`);
  }
  return value;
}

function askedLimit(value) {
  if (value === undefined) return DEFAULT_LIMIT;

  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) {
    throw refuse("invalid_limit", `${describe(value)} is not a whole number of at least 1.`);
  }
  return Math.min(limit, MAX_LIMIT);
}

function encodeCursor(row) {
  return Buffer.from(`${row.user_id}|${row.channel_id}`).toString("base64url");
}

function decodeCursor(value) {
  if (value === undefined) return null;

  const [userId, channelId, ...rest] = Buffer.from(value, "base64url").toString().split("|");
  if (rest.length > 0 || !USER_ID.test(userId || "") || !CHANNEL_ID.test(channelId || "")) {
    throw refuse("invalid_cursor", "That cursor did not come from this endpoint.");
  }
  return { channelId, userId };
}

function channelRole(row) {
  return { channel_id: row.channel_id, role: row.role };
}

function userRole(row) {
  return { user_id: row.user_id, role: row.role };
}

function appointment(row) {
  return { user_id: row.user_id, channel_id: row.channel_id, role: row.role };
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
      return fail(c, 400, error.code, error.message);
    }

    const userId = asked.toUpperCase();
    const rows = await listUserAppointedManagers(userId);
    const channels = rows.filter((row) => !role || row.role === role).map(channelRole);

    return c.json({ ok: true, user: userId, channels });
  });

  api.get("/channels/:channelId/managers", async (c) => {
    const asked = c.req.param("channelId");
    if (!CHANNEL_ID.test(asked)) {
      return fail(
        c,
        400,
        "invalid_channel",
        `${describe(asked)} is not a Slack channel id, like C01ABCDEFGH.`,
      );
    }

    let role;
    try {
      role = askedRole(c.req.query("role"));
    } catch (error) {
      return fail(c, 400, error.code, error.message);
    }

    const channelId = asked.toUpperCase();
    const rows = await listAppointedManagers(channelId);
    const managers = rows
      .filter((row) => !role || row.role === role)
      .map(userRole)
      .sort((one, two) => one.user_id.localeCompare(two.user_id));

    return c.json({ ok: true, channel: channelId, managers });
  });

  api.get("/appointments", async (c) => {
    let limit;
    let after;
    let role;
    try {
      limit = askedLimit(c.req.query("limit"));
      after = decodeCursor(c.req.query("cursor"));
      role = askedRole(c.req.query("role"));
    } catch (error) {
      return fail(c, 400, error.code, error.message);
    }

    const rows = await listAppointedManagersPage(limit + 1, after, role);
    const more = rows.length > limit;
    const page = more ? rows.slice(0, limit) : rows;

    return c.json({
      ok: true,
      appointments: page.map(appointment),
      next_cursor: more ? encodeCursor(page[page.length - 1]) : null,
    });
  });

  api.notFound((c) => fail(c, 404, "unknown_endpoint", "No such endpoint."));

  api.onError((error, c) => {
    logger.error("[appointments]", error);
    return fail(c, 500, "internal_error", "The request could not be completed.");
  });

  return api;
}
