import { listUserAppointedManagers } from "../db.js";
import { isGlobalAdmin, isWorkspaceAdmin } from "../perms.js";

const SUPERADMINS = (process.env.SUPERADMINS || "").split(",").filter(Boolean);
const CHANNEL_CACHE_TTL_MS = 5 * 60 * 1000;
const channelInfoCache = new WeakMap();

export const roleAbilities = {
  manager: [
    "Delete messages",
    "Destroy threads",
    "Manage embeds",
    "Welcome messages",
    "Timeout members",
    "Use @here and @channel",
    "Manage anchor polls",
  ],
  moderator: ["Timeout members", "Use @here and @channel"],
};

function primaryRole({ globalAdmin, workspaceAdmin, superAdmin, roles }) {
  if (globalAdmin) return "Global admin";
  if (workspaceAdmin) return "Workspace admin";
  if (roles.some(({ role }) => role === "manager")) return "Channel manager";
  if (roles.length) return "Channel moderator";
  if (superAdmin) return "Registry admin";
  return "Member";
}

function inheritedAbilities(globalAdmin, workspaceAdmin, superAdmin) {
  const abilities = [];
  if (globalAdmin) {
    abilities.push(
      "Delete messages in every channel",
      "Destroy threads in every channel",
      "Manage embeds in every channel",
      "Manage welcome messages in every channel",
      "Timeout members in every channel",
      "Use @here and @channel in every channel",
      "Manage anchor polls in every channel",
    );
  } else if (workspaceAdmin) {
    abilities.push("Manage anchor polls in every channel");
  }
  if (globalAdmin || superAdmin) abilities.push("Manage the global admin registry");
  return abilities;
}

function cachedChannelInfo(client, channelId) {
  let clientCache = channelInfoCache.get(client);
  if (!clientCache) {
    clientCache = new Map();
    channelInfoCache.set(client, clientCache);
  }

  const cached = clientCache.get(channelId);
  if (cached?.expiresAt > Date.now()) return cached.promise;

  const promise = client.conversations
    .info({ channel: channelId })
    .then((response) => response.channel || null);
  clientCache.set(channelId, {
    expiresAt: Date.now() + CHANNEL_CACHE_TTL_MS,
    promise,
  });
  promise.catch(() => {
    if (clientCache.get(channelId)?.promise === promise) clientCache.delete(channelId);
  });
  return promise;
}

async function channelInfo(channelId, clients) {
  for (const client of new Set(clients)) {
    try {
      const channel = await cachedChannelInfo(client, channelId);
      if (channel) return channel;
    } catch {
      // Try the next Slack client. Private channels may only be visible to one token.
    }
  }
  return null;
}

export async function loadPermissions(
  client,
  userId,
  discoveryClient = client,
  requestedChannelId,
) {
  const [globalAdmin, workspaceAdmin, roles] = await Promise.all([
    isGlobalAdmin(userId),
    isWorkspaceAdmin(client, userId),
    listUserAppointedManagers(userId),
  ]);
  const superAdmin = SUPERADMINS.includes(userId);
  const grants = new Map(roles.map((grant) => [grant.channel_id, grant]));
  const channelIds = new Set(grants.keys());
  if ((globalAdmin || workspaceAdmin) && requestedChannelId) channelIds.add(requestedChannelId);
  const visibleChannels = (
    await Promise.all(
      [...channelIds].map(async (channelId) => {
        const grant = grants.get(channelId);
        const channel = await channelInfo(channelId, [client, discoveryClient]);
        if (!channel && !grant) return null;
        if (channel?.is_archived && !grant) return null;
        return {
          ...grant,
          is_private: Boolean(channel?.is_private),
          channel_id: channelId,
          name: channel?.name || channelId,
        };
      }),
    )
  ).filter(Boolean);

  const channels = visibleChannels
    .map((channel) => {
      const role = channel.role || grants.get(channel.channel_id)?.role;
      const manager = role === "manager";
      return {
        ...channel,
        role: role || (globalAdmin ? "global" : "workspace"),
        canAnchor: globalAdmin || workspaceAdmin || manager,
        canManage: globalAdmin || manager,
        canModerate: globalAdmin || Boolean(role),
      };
    })
    .filter((channel) => channel.canAnchor || channel.canManage)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    channels,
    globalAdmin,
    inherited: inheritedAbilities(globalAdmin, workspaceAdmin, superAdmin),
    primaryRole: primaryRole({ globalAdmin, workspaceAdmin, superAdmin, roles }),
    workspaceAdmin,
  };
}
