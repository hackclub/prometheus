import {
  isGlobalAdmin,
  hasChannelRole as dbHasChannelRole,
  isAppointedManager as dbIsAppointedManager,
} from "./db.js";
import { areWeEnterprise, listChannelManagers } from "./moderation.js";

export { isGlobalAdmin };

export const isWorkspaceAdmin = async (client, userId) => {
  try {
    const r = await client.users.info({ user: userId });
    return r.user?.is_admin || r.user?.is_owner;
  } catch {
    return false;
  }
};

// any channel role (moderator or manager)
export const isChannelModerator = (_client, userId, channelId) =>
  dbHasChannelRole(userId, channelId);

// full manager role only
export const isChannelManager = (_client, userId, channelId) =>
  dbIsAppointedManager(userId, channelId);

// timeout, untimeout, @here, @channel
export const canBan = async (client, userId, channelId) =>
  isGlobalAdmin(userId) || dbHasChannelRole(userId, channelId);

// delete, destroy thread, welcome
export const canManage = async (client, userId, channelId) =>
  isGlobalAdmin(userId) || dbIsAppointedManager(userId, channelId);

// create/edit/delete/enable/disable an anchor poll
export const canAnchor = async (client, userId, channelId) =>
  (await canManage(client, userId, channelId)) || (await isWorkspaceAdmin(client, userId));

export const isSlackChannelManager = async (client, userId, channelId) => {
  if (areWeEnterprise) {
    try {
      const managers = await listChannelManagers(channelId);
      if (managers.length) return managers.includes(userId);
    } catch { }
  }
  try {
    const info = await client.conversations.info({ channel: channelId });
    return info.channel?.creator === userId;
  } catch {
    return false;
  }
};

const canMoveChannel = async (client, userId, channelId) =>
  dbIsAppointedManager(userId, channelId) ||
  (await isSlackChannelManager(client, userId, channelId));

export const canMove = async (client, userId, { source, dest }) => {
  if (isGlobalAdmin(userId)) return true;
  const [okSource, okDest] = await Promise.all([
    canMoveChannel(client, userId, source),
    canMoveChannel(client, userId, dest),
  ]);
  return okSource && okDest;
};
