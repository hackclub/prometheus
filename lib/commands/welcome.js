import { getwelcome, setwelcome, removewelcome } from "../db.js";
import { canManage } from "../perms.js";
import { logAdmin } from "../logger.js";

const eph = (text) => ({ response_type: "ephemeral", text });

export default {
  name: "welcome",
  description: "Set a welcome message for users joining this channel",
  async execute({ command, args, respond, client, context }) {
    const u = command.user_id,
      ch = command.channel_id;

    if (!(await canManage(context.userClient, u, ch))) {
      console.log(`[welcome] ${u} denied in ${ch}`);
      return respond(eph(":loll: You do not have permission! :P"));
    }

    const [action, ...rest] = args;

    switch (action) {
      case "set": {
        const mode = rest[0];
        if (!mode || !["ephemeral", "dm"].includes(mode))
          return respond(eph("Usage: `/pro welcome set [ephemeral|dm] <message>`"));
        const message = rest.slice(1).join(" ");
        if (!message) return respond(eph("Usage: `/pro welcome set [ephemeral|dm] <message>`"));
        setwelcome(ch, message, mode, u);
        try {
          await client.conversations.join({ channel: ch });
        } catch (e) {
          console.warn(`[welcome] failed to join ${ch}: ${e.message}`);
        }
        console.log(`[welcome] ${u} set ${mode} welcome for ${ch}`);
        logAdmin(client, {
          action: `set ${mode} welcome message`,
          adminUser: u,
          channel: ch,
          detail: message,
        });
        return respond(eph(`:okay-1: Join message set for <#${ch}> (${mode}):\n> ${message}`));
      }
      case "remove": {
        const existing = getwelcome(ch);
        if (!existing) return respond(eph("No welcome message set for this channel."));
        removewelcome(ch);
        console.log(`[welcome] ${u} removed welcome for ${ch}`);
        logAdmin(client, { action: "removed welcome message", adminUser: u, channel: ch });
        return respond(eph(`:okay-1: Welcome message removed for <#${ch}>.`));
      }
      case "view": {
        const jm = getwelcome(ch);
        if (!jm) return respond(eph("No welcome message set for this channel."));
        return respond(
          eph(
            `*Welcome message for <#${ch}>:*\nMode: \`${jm.mode}\`\nSet by: <@${jm.set_by}>\n> ${jm.message}`,
          ),
        );
      }
      default:
        return respond(eph("Usage: `/pro welcome [set|remove|view] [ephemeral|dm] [message]`"));
    }
  },
};
