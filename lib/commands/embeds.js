import { listEmbedBlocks } from "../db.js";
import { canManage } from "../perms.js";

function ruleText(rule) {
  if (rule.type === "domain") return `*.${rule.target}/*`;
  if (rule.type === "host") return `${rule.target}/*`;
  if (rule.type === "path") return `${rule.target}/*`;
  return rule.target;
}

export default {
  name: "embeds",
  description: "Manage blacklisted embeds",
  async execute({ command, respond, context }) {
    const u = command.user_id,
      ch = command.channel_id;

    if (!(await canManage(context.userClient, u, ch))) {
      console.log(`[embeds] ${u} denied in ${ch}`);
      return respond({
        response_type: "ephemeral",
        text: ":loll: You do not have permission! :P",
      });
    }

    const rules = listEmbedBlocks(ch);

    if (!rules.length) {
      await respond({
        response_type: "ephemeral",
        text: "No blacklisted embeds in this channel.",
      });
      return;
    }

    await respond({
      response_type: "ephemeral",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Blacklisted embeds in <#${ch}>*\n`,
          },
        },
        ...rules.map((rule) => ({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `\`${ruleText(rule)}\` blocked by <@${rule.blocked_by}>`,
          },
          accessory: {
            type: "button",
            text: {
              type: "plain_text",
              text: "Remove",
              emoji: true,
            },
            value: `${rule.channel_id}:${rule.type}:${rule.target}`,
            action_id: "remove_embed_block",
          },
        })),
      ],
      text: `Blacklisted embeds: ${rules.map(ruleText).join(", ")}`,
    });
  },
};
