import {
  isGlobalAdmin as dbIsGlobalAdmin,
  hasChannelRole as dbHasChannelRole,
  isAppointedManager as dbIsAppointedManager,
} from "./db.js";

// Workspace admins inherit global permissions without persistent database grants.
export const isGlobalAdmin = async (userId, client) =>
  (await dbIsGlobalAdmin(userId)) || (await isWorkspaceAdmin(client, userId));

export const isWorkspaceAdmin = async (client, userId) => {
  try {
    const r = await client.users.info({ user: userId });
    return Boolean(r.user?.is_admin || r.user?.is_owner);
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
  (await isGlobalAdmin(userId, client)) || (await dbHasChannelRole(userId, channelId));

// delete, destroy thread, welcome
export const canManage = async (client, userId, channelId) =>
  (await isGlobalAdmin(userId, client)) || (await dbIsAppointedManager(userId, channelId));

// create/edit/delete/enable/disable an anchor poll
export const canAnchor = async (client, userId, channelId) =>
  (await canManage(client, userId, channelId)) || (await isWorkspaceAdmin(client, userId));
