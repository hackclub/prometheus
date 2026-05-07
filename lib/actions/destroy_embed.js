import { canManage } from "../perms.js";
import { deleteAttachment } from "../moderation.js";

const noEmbeds = {
  type: "section",
  text: { type: "mrkdwn", text: "All embeds destroyed" },
};

function blocksWithoutAttachment(blocks, attachmentId) {
  const actionIndex = blocks.findIndex(
    (block) =>
      block.type === "actions" &&
      block.elements?.some(
        (element) =>
          element.action_id === "destroy_embed" &&
          element.value === attachmentId,
      ),
  );

  if (actionIndex === -1) return blocks;

  const from = Math.max(actionIndex - 1, 0);
  const count = blocks[actionIndex + 1]?.type === "divider" ? 3 : 2;
  return blocks.toSpliced(from, count);
}

export default {
  actionId: "destroy_embed",

  async execute({ ack, body, action, client, context, logger }) {
    await ack();

    const { channel, ts } = JSON.parse(body.view.private_metadata);
    const attachmentId = action.value;

    if (!(await canManage(context.userClient, body.user.id, channel))) {
      logger.warn(`${body.user.id} denied for manage_embed_destroy`);
      return;
    }

    await deleteAttachment(channel, ts, attachmentId);

    const blocks = blocksWithoutAttachment(body.view.blocks, attachmentId);

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
