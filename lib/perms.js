import { WebClient } from "@slack/web-api";
import {
  isGlobalAdmin,
  hasChannelRole as dbHasChannelRole,
  isAppointedManager as dbIsAppointedManager,
} from "./db.js";

export { isGlobalAdmin };

const ORG_TOKEN = process.env.SLACK_ORG_TOKEN;
const CHANNEL_MANAGER_ROLE_ID = process.env.CHANNEL_MANAGER_ROLE_ID;
export const nativeChannelManagersAvailable = Boolean(ORG_TOKEN && CHANNEL_MANAGER_ROLE_ID);
console.log(
  `[perms] native Slack channel managers: ${nativeChannelManagersAvailable ? "available" : "not configured"}`,
);
const orgClient = ORG_TOKEN ? new WebClient(ORG_TOKEN) : null;

export const isSlackChannelManager = async (userId, channelId) => {
  if (!nativeChannelManagersAvailable) return false;
  try {
    const r = await orgClient.admin.roles.listAssignments({
      role_ids: [CHANNEL_MANAGER_ROLE_ID],
      entity_ids: [channelId],
    });
    return (r.role_assignments || []).some((a) => a.user_id === userId);
  } catch {
    return false;
  }
};

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
  (await isGlobalAdmin(userId)) ||
  (await dbHasChannelRole(userId, channelId)) ||
  (await isSlackChannelManager(userId, channelId));

// delete, destroy thread, welcome
export const canManage = async (client, userId, channelId) =>
  (await isGlobalAdmin(userId)) || (await dbIsAppointedManager(userId, channelId));

// create/edit/delete/enable/disable an anchor poll
export const canAnchor = async (client, userId, channelId) =>
  (await canManage(client, userId, channelId)) || (await isWorkspaceAdmin(client, userId));
