import { Hono } from "hono";
import { findChannelApiKeyByHash, isChannelApiKeyActive, touchChannelApiKey } from "../db.js";
import { logDelete, notifyDeletion } from "../logger.js";
import { canManage } from "../perms.js";
import { publicLogDelete } from "../public-logger.js";
import { purge } from "../purge.js";
import { RateLimiter } from "../ratelimiter.js";
import { hashApiKey } from "./apiKeys.js";

const rateLimiter = new RateLimiter(1000, 5);
const logger = console;

const BEARER = /^Bearer\s+(\S+)$/i;

const AUDIT_CONFIGURED = Boolean(process.env.LOG_CHANNEL);

// adjust as needed
const WINDOW_MS = 60 * 1000;
const WINDOW_MAX = 60;
const windows = new Map();

function withinBudget(keyId) {
  const now = Date.now();
  const window = windows.get(keyId);
  if (!window || window.resetAt <= now) {
    windows.set(keyId, { count: 1, resetAt: now + WINDOW_MS });
    if (windows.size > 1000) {
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

const TOO_LARGE = Symbol("too large");

async function readBoundedBody(c) {
  const declared = Number(c.req.header("Content-Length"));
  if (Number.isFinite(declared) && declared > 64 * 1024) return TOO_LARGE;

  const reader = c.req.raw.body?.getReader();
  if (!reader) return "";

  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 64 * 1024) {
      await reader.cancel();
      return TOO_LARGE;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function fail(c, status, error, message) {
  return c.json({ ok: false, error, message }, status);
}

function describe(value) {
  if (typeof value === "string") {
    return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value);
  }
  const kind = Array.isArray(value) ? "array" : typeof value;
  return `${"aeiou".includes(kind[0]) ? "An" : "A"} ${kind} value`;
}

function messageTimestamps(value) {
  const list = Array.isArray(value) ? value : [value];
  if (!list.length) throw new Error("Provide at least one message ts.");
  if (list.length > 50) {
    throw new Error(`Delete at most 50 messages per request.`);
  }

  const timestamps = [];
  for (const entry of list) {
    if (typeof entry !== "string" || !/^\d{10}\.\d{6}$/.test(entry)) {
      throw new Error(`${describe(entry)} is not a Slack message ts, like 1699999999.123456.`);
    }
    if (!timestamps.includes(entry)) timestamps.push(entry);
  }
  return timestamps;
}

function deletionReason(value) {
  if (value !== undefined && typeof value !== "string") {
    throw new Error("Reason must be a string.");
  }

  const reason = String(value ?? "")
    .replace(/[<>]/g, "")
    .trim();
  if (!reason) throw new Error("A reason is required, and is recorded in the audit log.");
  if (reason.length > 500) {
    throw new Error(`Reason must be 500 characters or fewer.`);
  }
  return reason;
}

async function readMessage(client, channel, ts) {
  try {
    const history = await client.conversations.history({
      channel,
      latest: ts,
      oldest: ts,
      inclusive: true,
      limit: 1,
    });
    const message = history.messages?.find((entry) => entry.ts === ts);
    return { ts, user: message?.user || null, text: message?.text || "" };
  } catch (error) {
    logger.warn(`[api] could not read ${channel}/${ts} for the audit log: ${error.message}`);
    return { ts, user: null, text: "" };
  }
}

async function deleteMessage(client, botClient, { channel, ts, deletedBy, reason }) {
  const message = await readMessage(client, channel, ts);

  await Promise.all([
    logDelete(botClient, { channel, message, deletedBy, reason, api: true }),
    publicLogDelete(botClient, { channel, deletedBy }),
  ]);

  await rateLimiter.exec(() => client.chat.delete({ channel, ts }));

  if (message.user && message.user !== deletedBy) {
    rateLimiter
      .exec(() => notifyDeletion(botClient, { channel, message, reason }))
      .catch((error) =>
        logger.warn(`[api] delete notify failed for ${message.user}: ${error.message}`),
      );
  }
}

async function stillAuthorized(client, apiKey) {
  const [active, permitted] = await Promise.all([
    isChannelApiKeyActive(apiKey.id),
    canManage(client, apiKey.user_id, apiKey.channel_id),
  ]);
  return active && permitted;
}

export function createApiRouter({ client, botClient = client }) {
  const api = new Hono();

  api.use("*", async (c, next) => {
    const match = BEARER.exec(c.req.header("Authorization") || "");
    if (!match) {
      c.header("WWW-Authenticate", "Bearer");
      return fail(c, 401, "not_authed", "Pass your key as an Authorization: Bearer header.");
    }

    const apiKey = await findChannelApiKeyByHash(hashApiKey(match[1]));
    if (!apiKey) return fail(c, 401, "invalid_auth", "That API key is not valid.");

    if (!(await canManage(client, apiKey.user_id, apiKey.channel_id))) {
      return fail(
        c,
        403,
        "owner_not_permitted",
        "The user who created this key can no longer manage that channel.",
      );
    }

    const budget = withinBudget(apiKey.id);
    if (!budget.ok) {
      c.header("Retry-After", String(budget.retryAfter));
      return fail(c, 429, "ratelimited", `Slow down, retry in ${budget.retryAfter}s.`);
    }

    c.set("apiKey", apiKey);
    await next();
  });

  api.get("/key", (c) => {
    const apiKey = c.get("apiKey");
    return c.json({
      ok: true,
      key: {
        name: apiKey.name,
        prefix: apiKey.key_prefix,
        channel: apiKey.channel_id,
        owner: apiKey.user_id,
        created_at: apiKey.created_at,
        last_used_at: apiKey.last_used_at,
      },
    });
  });

  api.post("/messages/delete", async (c) => {
    const apiKey = c.get("apiKey");

    if (!AUDIT_CONFIGURED) {
      return fail(
        c,
        503,
        "audit_unavailable",
        "Deletion is disabled because LOG_CHANNEL is not configured.",
      );
    }

    const raw = await readBoundedBody(c);
    if (raw === TOO_LARGE) {
      return fail(c, 413, "body_too_large", `Keep the request body under 65,536 bytes.`);
    }

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return fail(c, 400, "invalid_json", "Send a JSON body.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return fail(c, 400, "invalid_body", "Send a JSON object.");
    }

    // The key names the channel; the caller never gets to pick one.
    const channel = apiKey.channel_id;

    let timestamps;
    let reason;
    try {
      timestamps = messageTimestamps(body.ts);
      reason = deletionReason(body.reason);
    } catch (error) {
      return fail(c, 400, "invalid_request", error.message);
    }

    await touchChannelApiKey(apiKey.id);

    const deleted = [];
    const failed = [];
    for (const ts of timestamps) {
      if (!(await stillAuthorized(client, apiKey))) {
        failed.push({ ts, error: "authorization_revoked" });
        continue;
      }

      try {
        await deleteMessage(client, botClient, {
          channel,
          ts,
          deletedBy: apiKey.user_id,
          reason,
        });
        deleted.push(ts);
      } catch (error) {
        const slackError = error.data?.error || "delete_failed";
        logger.error(`[api] delete failed for ${channel}/${ts}: ${slackError}`);
        failed.push({ ts, error: slackError });
      }
    }

    logger.info(
      `[api] key ${apiKey.key_prefix} deleted ${deleted.length}/${timestamps.length} in ${channel}`,
    );
    return c.json({ ok: failed.length === 0, channel, deleted, failed });
  });

  api.post("/threads/delete", async (c) => {
    const apiKey = c.get("apiKey");

    if (!AUDIT_CONFIGURED) {
      return fail(
        c,
        503,
        "audit_unavailable",
        "Deletion is disabled because LOG_CHANNEL is not configured.",
      );
    }

    const raw = await readBoundedBody(c);
    if (raw === TOO_LARGE) {
      return fail(c, 413, "body_too_large", `Keep the request body under 65,536 bytes.`);
    }

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return fail(c, 400, "invalid_json", "Send a JSON body.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return fail(c, 400, "invalid_body", "Send a JSON object.");
    }

    const channel = apiKey.channel_id;

    let threadTs;
    try {
      [threadTs] = messageTimestamps(body.thread_ts);
      deletionReason(body.reason);
    } catch (error) {
      return fail(c, 400, "invalid_request", error.message);
    }

    if (!(await stillAuthorized(client, apiKey))) {
      return fail(
        c,
        403,
        "authorization_revoked",
        "That API key can no longer manage this channel.",
      );
    }

    await touchChannelApiKey(apiKey.id);

    try {
      await purge(client, logger, channel, threadTs, apiKey.user_id);
    } catch (error) {
      const slackError = error.data?.error || "purge_failed";
      logger.error(`[api] thread purge failed for ${channel}/${threadTs}: ${slackError}`);
      return fail(c, 502, "purge_failed", "The thread could not be fully deleted.");
    }

    logger.info(`[api] key ${apiKey.key_prefix} purged thread ${threadTs} in ${channel}`);
    return c.json({ ok: true, channel, thread_ts: threadTs });
  });

  api.notFound((c) => fail(c, 404, "unknown_endpoint", "No such API endpoint."));

  api.onError((error, c) => {
    logger.error("[api]", error);
    return fail(c, 500, "internal_error", "The request could not be completed.");
  });

  return api;
}
