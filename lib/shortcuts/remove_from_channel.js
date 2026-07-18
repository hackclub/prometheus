import { canManage } from "../perms.js";
import { RateLimiter } from "../ratelimiter.js";

const rateLimiter = new RateLimiter(1000, 5);

const txt = (text) => ({ type: "plain_text", text, emoji: true });

function noPermsModal() {
  return {
    type: "modal",
    title: txt("Aw, Snap!"),
    close: txt("Close"),
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: ":red-x: *You do not have permission to do this!* Only channel managers are able to use this bot. Try it again in a channel you manage.",
        },
      },
    ],
  };
}

export default {
  callbackId: "remove_from_channel",

  async execute({ shortcut, client, context, logger }) {
    if (!(await canManage(context.userClient, shortcut.user.id, shortcut.channel.id))) {
      logger.warn(`${shortcut.user.id} denied for remove_from_channel`);
      await client.views.open({ trigger_id: shortcut.trigger_id, view: noPermsModal() });
      return;
    }

    try {
      await rateLimiter.exec(async () => {
        // Slack shouldn't do anything if the message is not a thread broadcast, but just being safe
        if (
          // in thread
          shortcut.message.thread_ts &&
          // not top level message
          shortcut.message.ts !== shortcut.message.thread_ts &&
          // is sent to channel
          shortcut.message.subtype === "thread_broadcast"
        ) {
          await context.userClient.chat.delete({
            channel: shortcut.channel.id,
            ts: shortcut.message.ts,
            broadcast_delete: true,
          });
          logger.info(`remove_from_channel done ${shortcut.message.ts}`);
        } else {
          logger.error(
            `remove_from_channel error removing ${shortcut.message.ts}: not a thread broadcast`,
          );
        }
      });
    } catch (error) {
      logger.error(`remove_from_channel error removing ${shortcut.message.ts}: ${error.message}`);
    }
  },
};
