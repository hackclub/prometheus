import { canManage } from "../perms.js";
import { addEmbedBlock } from "../db.js";
import { deleteAttachment } from "../moderation.js";

const noEmbeds = {
  type: "section",
  text: { type: "mrkdwn", text: "All embeds destroyed" },
};

function blocksWithoutActionBlock(blocks, blockId) {
  const actionIndex = blocks.findIndex((block) => block.block_id === blockId);
  if (actionIndex === -1) return blocks;

  const from = Math.max(actionIndex - 1, 0);
  const count = blocks[actionIndex + 1]?.type === "divider" ? 3 : 2;
  return blocks.toSpliced(from, count);
}

function parseBlockValue(value) {
  const [, type, ...targetParts] = value.split(":");
  return { type, target: targetParts.join(":") };
}

function isValidBlock(type, target) {
  return ["domain", "host", "path"].includes(type) && Boolean(target);
}

export default {
  actionId: "block_embed",

  async execute({ ack, body, action, client, context, logger }) {
    await ack();

    const { channel, ts } = JSON.parse(body.view.private_metadata);

    if (!(await canManage(context.userClient, body.user.id, channel))) {
      logger.warn(`${body.user.id} denied for manage_embed_block`);
      return;
    }

    const { type, target } = parseBlockValue(action.selected_option.value);
    if (!isValidBlock(type, target)) {
      logger.warn(`invalid embed block value: ${action.selected_option.value}`);
      return;
    }

    addEmbedBlock(channel, type, target, body.user.id);

    const attachmentId = action.block_id.replace(/^manage_embed_/, "");
    await deleteAttachment(channel, ts, attachmentId);

    const blocks = blocksWithoutActionBlock(body.view.blocks, action.block_id);

    await client.views.update({
      view_id: body.view.id,
      hash: body.view.hash,
      view: {
        type: "modal",
        title: body.view.title,
        close: body.view.close,
        blocks: blocks.length ? blocks : [noEmbeds],
        private_metadata: body.view.private_metadata,
      },
    });
  },
};
