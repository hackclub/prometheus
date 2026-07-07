import { canAnchor } from "../perms.js";
import { getAnchorPollById } from "../db.js";
import { canAddOption, openEditModal, openAddOptionModal } from "../commands/anchor.js";
import { deleteAnchor } from "../anchorCommon.js";

function errorModal(message) {
  return {
    type: "modal",
    title: { type: "plain_text", text: "Aw, Snap!" },
    close: { type: "plain_text", text: "Close" },
    blocks: [{ type: "section", text: { type: "mrkdwn", text: message } }],
  };
}

export default {
  actionId: "anchor_poll_overflow",

  async execute({ ack, body, action, client, context, logger }) {
    await ack();

    const { poll: pollId, action: op } = JSON.parse(action.selected_option.value);
    const userId = body.user.id;

    const poll = getAnchorPollById(pollId);
    if (!poll || !poll.is_current) return;

    if (op === "add_option") {
      if (!canAddOption(poll, userId)) {
        await client.views.open({
          trigger_id: body.trigger_id,
          view: errorModal("You cannot add an option to this poll."),
        });
        return;
      }
      await openAddOptionModal(client, body.trigger_id, poll);
      return;
    }

    if (!(await canAnchor(context.userClient, userId, poll.channel_id))) {
      logger.warn(`${userId} denied for anchor_poll_overflow:${op} in ${poll.channel_id}`);
      await client.views.open({
        trigger_id: body.trigger_id,
        view: errorModal(
          "Only channel managers, prometheans, or workspace admins can manage this anchor poll.",
        ),
      });
      return;
    }

    if (op === "edit") {
      await openEditModal(client, body.trigger_id, poll);
      return;
    }

    if (op === "delete") {
      await deleteAnchor(client, poll, userId, logger);
    }
  },
};
