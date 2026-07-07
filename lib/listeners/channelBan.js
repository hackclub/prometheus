import { WebClient } from "@slack/web-api";
import { getChannelBan, removeChannelBan } from "../db.js";

const bot = new WebClient(process.env.SLACK_BOT_TOKEN);
const expired = (b) => b?.expires && b.expires <= Math.floor(Date.now() / 1000);

export default async function channelBanListener({ event, context, logger }) {
  if (!event || event.type !== "message" || !event.user) return;
  if (
    event.subtype &&
    ["bot_message", "message_changed", "message_deleted"].includes(event.subtype)
  )
    return;

  const ban = getChannelBan(event.user, event.channel);
  if (!ban) return;
  if (expired(ban)) {
    console.log(`[channelban] expired ban for ${event.user} in ${event.channel}, removing`);
    removeChannelBan(event.user, event.channel);
    return;
  }

  console.log(`[channelban] enforcing ban on ${event.user} in ${event.channel}`);
  const msg = `Your message has been deleted because you're timed out from this channel${ban.reason ? ` for the following reason: ${ban.reason}` : "."}`;

  await Promise.all([
    context.userClient.chat.delete({ channel: event.channel, ts: event.ts }).catch((e) => {
      logger.warn(`channel ban delete failed: ${e.message}`);
    }),
    context.userClient.conversations
      .kick({ channel: event.channel, user: event.user })
      .catch((e) => {
        logger.warn(`channel ban kick failed: ${e.message}`);
      }),
    bot.chat.postMessage({ channel: event.user, text: msg }).catch((e) => {
      logger.warn(`channel ban notify failed: ${e.message}`);
    }),
  ]);
}
