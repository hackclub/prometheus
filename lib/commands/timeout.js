import { canBan } from "../perms.js";
import { getChannelBan, setChannelBan } from "../db.js";
import { logBan } from "../logger.js";

const parseId = (t, r) => t?.match(r)?.[1];
const parseDuration = (t) => {
  if (!t) return null;
  const m = t.match(/^(\d+)([smhdw])$/i);
  if (!m) return null;
  const n = Number(m[1]);
  const mult = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  return Math.floor(Date.now() / 1000) + n * mult[m[2].toLowerCase()];
};

export default {
  name: "timeout",
  description: "Timeout a user from a channel",

  async execute({ command: cmd, args, respond, client, context }) {
    const err = (t) => respond({ response_type: "ephemeral", text: t });

    if (!(await canBan(context.userClient, cmd.user_id, cmd.channel_id))) {
      console.log(`[timeout] ${cmd.user_id} denied in ${cmd.channel_id}`);
      return err(":loll: You do not have permission to use this command.");
    }

    const [rawUser, ...rest] = args;
    const userId = parseId(rawUser, /<@([A-Z0-9]+)\|?.*>/);
    const channelId = cmd.channel_id;
    const expires = parseDuration(rest[0]);
    const reason = (expires ? rest.slice(1) : rest).join(" ").trim();

    if (!userId || !reason) return err(":red-x: Usage: `/pro timeout @user [duration] reason`");

    const existing = getChannelBan(userId, channelId);
    if (existing && (!existing.expires || existing.expires > Math.floor(Date.now() / 1000)))
      return err(`:red-x: <@${userId}> is already timed out from <#${channelId}>.`);

    setChannelBan(userId, channelId, cmd.user_id, reason, expires);
    console.log(
      `[timeout] ${cmd.user_id} banned ${userId} from ${channelId}${expires ? ` until ${expires}` : ""}`,
    );

    const dateFallback = expires ? new Date(expires * 1000).toUTCString() : "";
    const banMsg = `You have been timed out from <#${channelId}>${expires ? ` until <!date^${expires}^{date_short_pretty} at {time}|${dateFallback}>` : ""}${reason ? ` for the following reason: ${reason}` : "."}`;

    await Promise.all([
      context.userClient.conversations.kick({ channel: channelId, user: userId }).catch((e) => {
        console.warn(`[timeout] kick failed: ${e.message}`);
      }),
      client.chat.postMessage({ channel: userId, text: banMsg }).catch((e) => {
        console.warn(`[timeout] dm failed: ${e.message}`);
      }),
      logBan(client, { channel: channelId, user: userId, bannedBy: cmd.user_id, reason, expires }),
    ]);

    await respond({
      response_type: "ephemeral",
      text: `:bonk: Timed out <@${userId}> from <#${channelId}>${expires ? ` until <!date^${expires}^{date_short_pretty} at {time}|${dateFallback}>` : ""}.`,
    });
  },
};
