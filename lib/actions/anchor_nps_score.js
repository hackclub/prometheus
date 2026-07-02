import { getAnchorPollById, getAnchorNpsResponses, recordNpsScore } from '../db.js';
import { buildAnchorNpsBlocks, isNpsSurveyClosed } from '../blocks/anchorNps.js';

const ACTION_ID_PATTERN = /^anchor_nps_score_(\d{1,2})$/;

export default {
  actionId: ACTION_ID_PATTERN,

  async execute({ ack, body, action, client, logger }) {
    await ack();

    const score = parseInt(action.action_id.match(ACTION_ID_PATTERN)[1], 10);
    const { poll: pollId } = JSON.parse(action.value);
    const userId = body.user.id;

    const poll = getAnchorPollById(pollId);
    if (!poll || poll.type !== 'nps' || !poll.enabled) return;

    if (isNpsSurveyClosed(poll)) {
      try {
        await client.chat.postEphemeral({ channel: poll.channel_id, user: userId, text: 'This survey has closed.' });
      } catch { /* best effort */ }
      return;
    }

    recordNpsScore(poll.id, userId, score);

    if (poll.message_ts) {
      try {
        await client.chat.update({
          channel: poll.channel_id,
          ts: poll.message_ts,
          text: poll.question,
          blocks: buildAnchorNpsBlocks(poll, getAnchorNpsResponses(poll.id)),
        });
      } catch (e) {
        logger.error(`anchor nps score re-render failed in ${poll.channel_id}: ${e.message}`);
      }

      try {
        await client.chat.postEphemeral({
          channel: poll.channel_id,
          user: userId,
          thread_ts: poll.message_ts,
          text: `Thanks! Recorded your score: *${score}*. Feel free to reply in this thread with any feedback.`,
        });
      } catch { /* best effort */ }
    }
  },
};
