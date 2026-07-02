const BAR_BLOCKS = [' ', '▏', '▎', '▍', '▌', '▋', '▊', '▉', '█'];

function generateProgressBar(percentage, size) {
  const blocks = percentage * size;
  return (
    BAR_BLOCKS[8].repeat(Math.floor(blocks)) +
    (Math.floor(blocks) === blocks ? '' : BAR_BLOCKS[Math.round((blocks - Math.floor(blocks)) * 8)]) +
    BAR_BLOCKS[0].repeat(size - Math.ceil(blocks))
  );
}

function titleSection(poll) {
  const options = [
    { text: { type: 'plain_text', text: 'Edit' }, value: JSON.stringify({ poll: poll.id, action: 'edit' }) },
    { text: { type: 'plain_text', text: 'Delete' }, value: JSON.stringify({ poll: poll.id, action: 'delete' }) },
  ];
  if (poll.add_choice_setting !== 'no_one') {
    options.push({
      text: { type: 'plain_text', text: 'Add option' },
      value: JSON.stringify({ poll: poll.id, action: 'add_option' }),
    });
  }

  return {
    type: 'section',
    block_id: 'anchor_poll_title',
    text: { type: 'mrkdwn', text: `*${poll.question}*` },
    accessory: {
      type: 'overflow',
      action_id: 'anchor_poll_overflow',
      options,
    },
  };
}

function choicesSection(poll, choices, votes) {
  const votesByChoice = new Map(choices.map((c) => [c.id, []]));
  let total = 0;
  for (const vote of votes) {
    votesByChoice.get(vote.choice_id)?.push(vote.user_id);
    total++;
  }
  if (!total) total = 1;

  let text = '';
  for (const [index, choice] of choices.entries()) {
    if (poll.add_choice_setting === 'anyone') {
      text += `<@${choice.creator_user_id}>: `;
    }
    text += `${choice.text}\n`;

    const voters = votesByChoice.get(choice.id) ?? [];
    if (voters.length && !poll.anonymous) {
      text += voters.map((u) => `<@${u}>`).join(', ');
      text += '\n';
    }

    const fraction = voters.length / total;
    text += `\`⁠${generateProgressBar(fraction, 20)}⁠\` ${Math.round(fraction * 100)}% (${voters.length})${index === choices.length - 1 ? '' : '\n'}\n`;
  }

  return { type: 'section', text: { type: 'mrkdwn', text: text.trim() } };
}

function voteActions(poll, choices) {
  const options = [
    {
      text: { type: 'plain_text', text: '--- Clear answers ---' },
      value: JSON.stringify({ poll: poll.id, choice: -1 }),
    },
  ];

  if (poll.add_choice_setting !== 'no_one') {
    options.push({
      text: { type: 'plain_text', text: '--- Add an option ---' },
      value: JSON.stringify({ poll: poll.id, choice: -2 }),
    });
  }

  for (const choice of choices) {
    options.push({
      text: { type: 'plain_text', text: choice.text },
      value: JSON.stringify({ poll: poll.id, choice: choice.id }),
    });
  }

  return {
    type: 'actions',
    elements: [
      {
        type: 'static_select',
        action_id: 'anchor_poll_vote',
        placeholder: { type: 'plain_text', text: 'Choose your answer' },
        options,
      },
    ],
  };
}

function contextBlock(poll) {
  const elements = [{ type: 'mrkdwn', text: `Asked by <@${poll.creator_user_id}>` }];

  if (poll.anonymous) elements.push({ type: 'plain_text', text: 'Anonymous poll' });
  if (poll.multi_select) elements.push({ type: 'plain_text', text: 'Multi-select' });

  if (poll.add_choice_setting !== 'no_one') {
    elements.push({
      type: 'plain_text',
      text: poll.add_choice_setting === 'anyone' ? 'Anyone can add options' : 'Only the creator can add options',
    });
  }

  if (poll.updated_at !== poll.created_at) {
    elements.push({
      type: 'mrkdwn',
      text: `Edited <!date^${poll.updated_at}^{date_short} at {time}|edited>`,
    });
  }

  elements.push({ type: 'plain_text', text: ':pushpin: Anchored to this channel' });

  return { type: 'context', elements };
}

export function buildAnchorPollBlocks(poll, choices, votes) {
  return [titleSection(poll), { type: 'divider' }, choicesSection(poll, choices, votes), voteActions(poll, choices), contextBlock(poll)];
}
