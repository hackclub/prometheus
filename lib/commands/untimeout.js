import { canBan } from "../perms.js";
import { getChannelBan, removeChannelBan } from "../db.js";
import { logBan } from "../logger.js";

const parseId = (t, r) => t?.match(r)?.[1];

export default {
  name: "untimeout",
  description: "Remove a channel timeout",

  async execute({ command: cmd, args, respond, client, context }) {
    const err = (t) => respond({ response_type: "ephemeral", text: t });

    if (!(await canBan(context.userClient, cmd.user_id, cmd.channel_id))) {
      console.log(`[untimeout] ${cmd.user_id} denied in ${cmd.channel_id}`);
      return err(":loll: You do not have permission to use this command.");
    }

    const [rawUser] = args;
    const userId = parseId(rawUser, /<@([A-Z0-9]+)\|?.*>/);
    const channelId = cmd.channel_id;

    if (!userId) return err(":red-x: Usage: `/pro untimeout @user`");

    const existing = getChannelBan(userId, channelId);
    if (!existing || (existing.expires && existing.expires <= Math.floor(Date.now() / 1000)))
      return err(`:red-x: <@${userId}> is not timed out from <#${channelId}>.`);

    removeChannelBan(userId, channelId);
    console.log(`[untimeout] ${cmd.user_id} removed timeout for ${userId} from ${channelId}`);

    await logBan(client, {
      channel: channelId,
      user: userId,
      bannedBy: cmd.user_id,
      unbanned: true,
    });

    await respond({
      response_type: "ephemeral",
      text: `:okay-1: Removed timeout for <@${userId}> from <#${channelId}>.`,
    });
  },
};
