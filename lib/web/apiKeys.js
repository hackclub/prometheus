import { createHash, randomBytes } from "node:crypto";
import {
  MAX_API_KEYS_PER_USER,
  countUserApiKeys,
  createChannelApiKey,
  listChannelApiKeys,
  revokeChannelApiKey,
} from "../db.js";
import { logAdmin } from "../logger.js";

const KEY_PREFIX = "prom_";
const PREFIX_LENGTH = KEY_PREFIX.length + 8;

export function hashApiKey(key) {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey() {
  const key = `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { key, keyHash: hashApiKey(key), keyPrefix: key.slice(0, PREFIX_LENGTH) };
}

export { MAX_API_KEYS_PER_USER };

export async function loadApiKeys(channelId, userId) {
  const [keys, total] = await Promise.all([
    listChannelApiKeys(channelId, userId),
    countUserApiKeys(userId),
  ]);
  return {
    keys,
    total,
    max: MAX_API_KEYS_PER_USER,
    remaining: Math.max(0, MAX_API_KEYS_PER_USER - total),
  };
}

function keyName(value) {
  const name = String(value || "").trim();
  if (!name) throw new Error("Give the key a name so you can tell it apart later.");
  if (name.length > 60) throw new Error(`Key names must be 60 characters or fewer.`);
  return name;
}

export async function createApiKey(botClient, userId, channelId, form) {
  const name = keyName(form.get("name"));
  const { key, keyHash, keyPrefix } = generateApiKey();
  const record = await createChannelApiKey(channelId, userId, name, keyPrefix, keyHash);
  if (!record) {
    throw new Error(
      `You can hold ${MAX_API_KEYS_PER_USER} API keys at a time, across every channel. Revoke one first.`,
    );
  }

  try {
    await logAdmin(botClient, {
      action: "created an API key",
      adminUser: userId,
      channel: channelId,
      detail: `${name} (\`${keyPrefix}…\`)`,
    });
  } catch (error) {
    console.error(`[web] created key ${keyPrefix} in ${channelId} but could not log it:`, error);
  }

  return { key, record };
}

export async function revokeApiKey(botClient, userId, channelId, form) {
  const id = Number.parseInt(String(form.get("id") || ""), 10);
  if (!Number.isInteger(id)) throw new Error("That key does not exist.");

  if (!(await revokeChannelApiKey(id, channelId, userId))) {
    throw new Error("That key does not exist, or it is not yours to revoke.");
  }

  await logAdmin(botClient, {
    action: "revoked an API key",
    adminUser: userId,
    channel: channelId,
  });
}
