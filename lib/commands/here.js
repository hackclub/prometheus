import { WebClient } from "@slack/web-api";
import { canBan } from "../perms.js";

const bot = new WebClient(process.env.SLACK_BOT_TOKEN);

export default {
  name: "here",
  description: "Send a message with @here",

  async execute({ command: cmd, args, respond, context, logger }) {
    const msg = args.join(" ");
    const err = (t) => respond({ response_type: "ephemeral", text: t });

    if (!(await canBan(context.userClient, cmd.user_id, cmd.channel_id))) {
      console.log(`[here] ${cmd.user_id} denied in ${cmd.channel_id}`);
      return err(":loll: You do not have permission to use this command.");
    }

    if (!msg) return err(":red-x: Usage: `/pro here <message>`");

    try {
      const u = (await context.userClient.users.info({ user: cmd.user_id })).user;
      const text = `@here ${msg}`;
      const opts = {
        channel: cmd.channel_id,
        text,
        username: u.profile.display_name || u.real_name || u.name,
        icon_url: u.profile.image_192,
        blocks: [{ type: "section", text: { type: "mrkdwn", text } }],
      };

      const post = () => bot.chat.postMessage(opts);
      try {
        await post();
        console.log(`[here] ${cmd.user_id} sent @here in ${cmd.channel_id}`);
      } catch (e) {
        if (e.data?.error !== "not_in_channel") throw e;
        console.log(`[here] not in channel ${cmd.channel_id}, joining...`);
        try {
          await bot.conversations.join({ channel: cmd.channel_id });
          await post();
        } catch {
          return err(":red-x: I need to be in this channel! Use `/invite @Prometheus` to add me.");
        }
      }
    } catch (e) {
      logger.error(`here command error: ${e.message}`);
      await err(`:red-x: Failed to send message: ${e.message}`);
    }
  },
};
