import { removeEmbedBlock } from "../db.js";
import { canManage } from "../perms.js";
import { embedBlocksResponse } from "../commands/embeds.js";

function parseRuleValue(value) {
  const [channelId, type, ...targetParts] = value.split(":");
  return { channelId, type, target: targetParts.join(":") };
}

function isValidRule(channelId, type, target) {
  return Boolean(channelId) && ["domain", "host", "path"].includes(type) && Boolean(target);
}

export default {
  actionId: "remove_embed_block",

  async execute({ ack, body, action, respond, context, logger }) {
    await ack();

    const { channelId, type, target } = parseRuleValue(action.value);
    if (!isValidRule(channelId, type, target)) {
      logger.warn(`invalid embed block removal value: ${action.value}`);
      return;
    }

    if (!(await canManage(context.userClient, body.user.id, channelId))) {
      logger.warn(`${body.user.id} denied for remove_embed_block`);
      return;
    }

    removeEmbedBlock(channelId, type, target);

    await respond({
      ...embedBlocksResponse(channelId),
      replace_original: true,
    });
  },
};
