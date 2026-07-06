import { isGlobalAdmin } from "../perms.js";

export default {
  name: "echo",
  description: "Send a message as the bot (global admins only)",
  async execute({ command, args, respond, client }) {
    if (!isGlobalAdmin(command.user_id)) {
      await respond({ response_type: "ephemeral", text: ":loll:" });
      return;
    }

    const text = args.join(" ");
    if (!text) {
      await respond({ response_type: "ephemeral", text: ":red-x: Usage: `/pro echo <message>`" });
      return;
    }

    await client.chat.postMessage({ channel: command.channel_id, text });
    await respond({ response_type: "ephemeral", text: ":okay-1: Done!" });
  },
};
