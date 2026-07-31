import { isGlobalAdmin, getChannelRole } from "./db.js";

export { isGlobalAdmin };

export const isWorkspaceAdmin = async (client, userId) => {
  try {
    const r = await client.users.info({ user: userId });
    return r.user?.is_admin || r.user?.is_owner;
  } catch {
    return false;
  }
};

// channel role tiers, lowest to highest - each one inherits everything below it
const TIERS = { pinger: 1, moderator: 2, manager: 3 };

export const CHANNEL_ROLES = Object.keys(TIERS);

const hasTier = (userId, channelId, tier) =>
  (TIERS[getChannelRole(userId, channelId)] ?? 0) >= TIERS[tier];

// any channel role (pinger, moderator or manager)
export const isChannelPinger = (_client, userId, channelId) => hasTier(userId, channelId, "pinger");

// moderator or manager
export const isChannelModerator = (_client, userId, channelId) =>
  hasTier(userId, channelId, "moderator");

// full manager role only
export const isChannelManager = (_client, userId, channelId) =>
  hasTier(userId, channelId, "manager");

// @here, @channel
export const canPing = async (client, userId, channelId) =>
  isGlobalAdmin(userId) || hasTier(userId, channelId, "pinger");

// timeout, untimeout
export const canBan = async (client, userId, channelId) =>
  isGlobalAdmin(userId) || hasTier(userId, channelId, "moderator");

// delete, destroy thread, welcome
export const canManage = async (client, userId, channelId) =>
  isGlobalAdmin(userId) || hasTier(userId, channelId, "manager");

// create/edit/delete/enable/disable an anchor poll
export const canAnchor = async (client, userId, channelId) =>
  (await canManage(client, userId, channelId)) || (await isWorkspaceAdmin(client, userId));
