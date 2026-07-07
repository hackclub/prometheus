import { canAnchor } from '../perms.js';
import { getAnchorPollById, getAnchorPollChoices, getAnchorPollVotes, getAnchorNpsResponses } from '../db.js';

const txt = (text) => ({ type: 'plain_text', text });

function pollDetailBlocks(poll) {
  const choices = getAnchorPollChoices(poll.id);
  const votes = getAnchorPollVotes(poll.id);

  return choices.map((choice) => {
    const choiceVotes = votes.filter((v) => v.choice_id === choice.id);
    const voters = poll.anonymous ? '' : choiceVotes.map((v) => `<@${v.user_id}>`).join(', ');
    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${choice.text}* — ${choiceVotes.length} vote${choiceVotes.length === 1 ? '' : 's'}${voters ? `\n${voters}` : ''}`,
      },
    };
  });
}

function npsDetailBlocks(poll) {
  const responses = getAnchorNpsResponses(poll.id);
  if (!responses.length) return [{ type: 'section', text: { type: 'mrkdwn', text: '_No responses yet._' } }];

  const scored = responses.filter((r) => r.score !== null);
  const avg = scored.length ? (scored.reduce((sum, r) => sum + r.score, 0) / scored.length).toFixed(1) : 'n/a';
  const header = {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Average score: ${avg}* (${scored.length} scored, ${responses.length} response${responses.length === 1 ? '' : 's'} total)`,
    },
  };
  const entries = responses.map((r) => ({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `<@${r.user_id}> scored *${r.score ?? 'no score'}*${r.comment ? `\n>${r.comment}` : ''}`,
    },
  }));

  return [header, { type: 'divider' }, ...entries];
}

export default {
  actionId: 'anchor_history_details',

  async execute({ ack, body, action, client, context, logger }) {
    await ack();

    const { id } = JSON.parse(action.value);
    const poll = getAnchorPollById(id);
    if (!poll) return;

    if (!(await canAnchor(context.userClient, body.user.id, poll.channel_id))) {
      logger.warn(`${body.user.id} denied for anchor_history_details on poll ${id}`);
      return;
    }

    const blocks =
      poll.type === 'nps'
        ? npsDetailBlocks(poll)
        : poll.type === 'message'
          ? [{ type: 'section', text: { type: 'mrkdwn', text: poll.question || '_(empty)_' } }]
          : pollDetailBlocks(poll);
    const title = poll.question.length > 24 ? `${poll.question.slice(0, 21)}...` : poll.question;

    try {
      await client.views.open({
        trigger_id: body.trigger_id,
        view: {
          type: 'modal',
          title: txt(title),
          close: txt('Close'),
          blocks: blocks.length ? blocks : [{ type: 'section', text: { type: 'mrkdwn', text: '_No data._' } }],
        },
      });
    } catch (e) {
      logger.error(`anchor history details modal failed for poll ${id}: ${e.message}`);
    }
  },
};
