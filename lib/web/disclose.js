import { Hono } from "hono";
import { revokeChannelApiKeyByHash } from "../db.js";
import { logKeyDisclosure } from "../logger.js";
import { hashApiKey } from "./apiKeys.js";

const logger = console;

const windows = new Map();

function withinBudget(ip) {
  const now = Date.now();
  const window = windows.get(ip);
  if (!window || window.resetAt <= now) {
    windows.set(ip, { count: 1, resetAt: now + 60 * 1000 });
    if (windows.size > 10000) {
      for (const [id, entry] of windows) if (entry.resetAt <= now) windows.delete(id);
    }
    return { ok: true };
  }
  if (window.count >= 20) {
    return { ok: false, retryAfter: Math.ceil((window.resetAt - now) / 1000) };
  }
  window.count += 1;
  return { ok: true };
}

const TOO_LARGE = Symbol("too large");

async function readBoundedBody(c, limit = 8 * 1024) {
  const declared = Number(c.req.header("Content-Length"));
  if (Number.isFinite(declared) && declared > limit) return TOO_LARGE;

  const reader = c.req.raw.body?.getReader();
  if (!reader) return "";

  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
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

function clientIp(c) {
  const forwarded = c.req.header("x-forwarded-for");
  return (forwarded ? forwarded.split(",")[0].trim() : "") || "unknown";
}

function disclosureSource(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error("Source must be a string.");
  const source = value.replace(/[<>`*_]/g, "").trim();
  if (!source) return null;
  if (source.length > 300) throw new Error("Source must be 300 characters or fewer.");
  return source;
}

export function createDisclosureRouter({ client, botClient = client }) {
  const api = new Hono();

  api.post("/revoke", async (c) => {
    const budget = withinBudget(clientIp(c));
    if (!budget.ok) {
      c.header("Retry-After", String(budget.retryAfter));
      return fail(c, 429, "ratelimited", `Slow down! Retry in ${budget.retryAfter}s.`);
    }

    const raw = await readBoundedBody(c);
    if (raw === TOO_LARGE) {
      return fail(c, 413, "body_too_large", `Keep the request body under 8,192 bytes.`);
    }

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return fail(c, 400, "invalid_json", "Send a JSON body.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return fail(c, 400, "invalid_body", "Send a JSON object with a `key` field.");
    }

    const key = body.key;
    if (typeof key !== "string" || !/^prom_[A-Za-z0-9_-]{20,120}$/.test(key)) {
      return fail(c, 400, "invalid_key_format", "Provide the leaked key in the `key` field.");
    }

    let source;
    try {
      source = disclosureSource(body.source);
    } catch (error) {
      return fail(c, 400, "invalid_request", error.message);
    }

    const result = await revokeChannelApiKeyByHash(hashApiKey(key));
    if (!result.found) {
      return fail(c, 404, "unknown_key", "That key is not valid, or was never issued.");
    }

    const { key: record, alreadyRevoked } = result;

    if (!alreadyRevoked) {
      try {
        await logKeyDisclosure(botClient, {
          owner: record.user_id,
          channel: record.channel_id,
          keyName: record.name,
          keyPrefix: record.key_prefix,
          source,
        });
      } catch (error) {
        logger.error(`[disclose] revoked ${record.key_prefix} but could not log it:`, error);
      }
    }

    logger.info(
      `[disclose] key ${record.key_prefix} revoked via public disclosure${alreadyRevoked ? " (was already revoked)" : ""}`,
    );

    return c.json({
      ok: true,
      revoked: !alreadyRevoked,
      already_revoked: alreadyRevoked,
      owner: record.user_id,
      channel: record.channel_id,
      key: { name: record.name, prefix: record.key_prefix },
    });
  });

  api.notFound((c) => fail(c, 404, "unknown_endpoint", "No such endpoint."));

  api.onError((error, c) => {
    logger.error("[disclose]", error);
    return fail(c, 500, "internal_error", "The request could not be completed.");
  });

  return api;
}
