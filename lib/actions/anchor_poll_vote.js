import {
  getAnchorPollById,
  getAnchorPollChoices,
  getAnchorPollVotes,
  toggleAnchorPollVote,
  clearAnchorPollVotes,
} from "../db.js";
import { buildAnchorPollBlocks } from "../blocks/anchorPoll.js";
import { canAddOption, openAddOptionModal } from "../commands/anchor.js";

function errorModal(message) {
  return {
    type: "modal",
    title: { type: "plain_text", text: "Aw, Snap!" },
    close: { type: "plain_text", text: "Close" },
    blocks: [{ type: "section", text: { type: "mrkdwn", text: message } }],
  };
}

export default {
  actionId: "anchor_poll_vote",

  async execute({ ack, body, action, client, context, logger }) {
    await ack();

    const { poll: pollId, choice } = JSON.parse(action.selected_option.value);
    const userId = body.user.id;

    const poll = getAnchorPollById(pollId);
    if (!poll || !poll.enabled || !poll.is_current) return;

    if (choice === -2) {
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

    if (choice === -1) {
      clearAnchorPollVotes(poll.id, userId);
    } else {
      toggleAnchorPollVote(poll.id, choice, userId, !poll.multi_select);
    }

    const choices = getAnchorPollChoices(poll.id);
    const votes = getAnchorPollVotes(poll.id);

    try {
      await client.chat.update({
        channel: body.channel.id,
        ts: body.message.ts,
        text: poll.question,
        blocks: await buildAnchorPollBlocks(context.userClient, poll, choices, votes),
      });
    } catch (e) {
      logger.error(`anchor poll vote re-render failed in ${poll.channel_id}: ${e.message}`);
    }
  },
};
