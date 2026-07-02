export function isNpsSurveyClosed(poll) {
  return !!poll.closes_at && poll.closes_at <= Math.floor(Date.now() / 1000);
}

function describeCloseState(poll) {
  if (!poll.closes_at) return 'No closing date';
  const remaining = poll.closes_at - Math.floor(Date.now() / 1000);
  if (remaining <= 0) return 'Closed';
  const days = Math.ceil(remaining / 86400);
  return `*Closes in* ${days} day${days === 1 ? '' : 's'}`;
}

function titleSection(poll) {
  return {
    type: 'section',
    block_id: 'anchor_poll_title',
    text: { type: 'mrkdwn', text: `*${poll.question}*` },
    accessory: {
      type: 'overflow',
      action_id: 'anchor_poll_overflow',
      options: [
        { text: { type: 'plain_text', text: 'Edit' }, value: JSON.stringify({ poll: poll.id, action: 'edit' }) },
        { text: { type: 'plain_text', text: 'Delete' }, value: JSON.stringify({ poll: poll.id, action: 'delete' }) },
      ],
    },
  };
}

function statsSection(poll, responses) {
  return {
    type: 'section',
    text: { type: 'mrkdwn', text: `*Responses*: ${responses.length}\n${describeCloseState(poll)}` },
  };
}

function scoreButton(poll, score) {
  return {
    type: 'button',
    text: { type: 'plain_text', text: String(score) },
    action_id: `anchor_nps_score_${score}`,
    value: JSON.stringify({ poll: poll.id }),
  };
}

function scoreButtonRows(poll) {
  return [
    { type: 'actions', elements: [1, 2, 3, 4, 5].map((score) => scoreButton(poll, score)) },
    { type: 'actions', elements: [6, 7, 8, 9, 10].map((score) => scoreButton(poll, score)) },
  ];
}

function scaleHint() {
  return {
    type: 'context',
    elements: [
      { type: 'mrkdwn', text: '1 = Not at all likely · 10 = Extremely likely, reply in this thread to add feedback' },
    ],
  };
}

export function buildAnchorNpsBlocks(poll, responses) {
  return [titleSection(poll), statsSection(poll, responses), ...scoreButtonRows(poll), scaleHint()];
}
