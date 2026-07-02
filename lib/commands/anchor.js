import { canAnchor } from '../perms.js';
import {
  getAnchorPoll,
  getAnchorPollById,
  getAnchorPollChoices,
  getAnchorPollVotes,
  getAnchorNpsResponses,
  listAnchorPolls,
  createAnchorPoll,
  updateAnchorPollQuestion,
  addAnchorPollChoice,
  setAnchorPollMessageTs,
  setAnchorPollEnabled,
} from '../db.js';
import { buildAnchorPollBlocks } from '../blocks/anchorPoll.js';
import { buildAnchorNpsBlocks } from '../blocks/anchorNps.js';
import { joinChannel, unpinAndDeleteOldAnchorMessage, parseChannelMention } from '../anchorCommon.js';
import { runAnchorNpsCommand } from '../anchorNps.js';
import { logAdmin } from '../logger.js';

const txt = (text) => ({ type: 'plain_text', text });
const eph = (text) => ({ response_type: 'ephemeral', text });

function parseChoices(raw) {
  const seen = new Set();
  const choices = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    choices.push(trimmed);
  }
  return choices;
}

const ADD_CHOICE_OPTIONS = [
  { text: txt('No one'), value: 'no_one' },
  { text: txt('You only'), value: 'creator' },
  { text: txt('Anyone'), value: 'anyone' },
];

export function canAddOption(poll, userId) {
  if (poll.add_choice_setting === 'no_one') return false;
  if (poll.add_choice_setting === 'creator') return userId === poll.creator_user_id;
  return true;
}

function buildCreateModalView({ channel, question, choicesText, anonymous, multiSelect, addChoiceSetting, error }) {
  const blocks = [];

  if (error) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Error:* ${error}` } });
  }

  blocks.push({
    type: 'input',
    block_id: 'question',
    label: txt('Question'),
    element: { type: 'plain_text_input', action_id: 'value', initial_value: question || undefined },
  });

  blocks.push({
    type: 'input',
    block_id: 'choices',
    label: txt('Choices (one per line)'),
    element: { type: 'plain_text_input', action_id: 'value', multiline: true, initial_value: choicesText || undefined },
    hint: txt('At least 2 choices, one per line. Replaces any existing choices and resets votes.'),
  });

  const checkboxOptions = [
    { text: txt('Anonymous poll'), value: 'anonymous' },
    { text: txt('Multi-select'), value: 'multi_select' },
  ];
  const initialCheckboxes = checkboxOptions.filter(
    (o) => (o.value === 'anonymous' && anonymous) || (o.value === 'multi_select' && multiSelect),
  );

  blocks.push({
    type: 'input',
    block_id: 'settings',
    label: txt('Options'),
    element: {
      type: 'checkboxes',
      action_id: 'value',
      options: checkboxOptions,
      ...(initialCheckboxes.length ? { initial_options: initialCheckboxes } : {}),
    },
    optional: true,
  });

  blocks.push({
    type: 'input',
    block_id: 'add_choice_setting',
    label: txt('Who can add options'),
    hint: txt('Choose who can add options to this poll after creation.'),
    element: {
      type: 'static_select',
      action_id: 'value',
      options: ADD_CHOICE_OPTIONS,
      initial_option: ADD_CHOICE_OPTIONS.find((o) => o.value === (addChoiceSetting || 'no_one')),
    },
  });

  return {
    type: 'modal',
    callback_id: 'anchor_poll_create_modal',
    private_metadata: JSON.stringify({ channel }),
    title: txt('Anchor a poll'),
    close: txt('Cancel'),
    submit: txt('Create'),
    blocks,
  };
}

async function postAndPinPoll(client, poll) {
  const blocks = buildAnchorPollBlocks(poll, poll.choices, []);
  const msg = await client.chat.postMessage({
    channel: poll.channel_id,
    text: poll.question,
    blocks,
    metadata: { event_type: 'anchor_poll', event_payload: { channel: poll.channel_id } },
  });
  setAnchorPollMessageTs(poll.channel_id, msg.ts);
  await client.pins.add({ channel: poll.channel_id, timestamp: msg.ts });
}

async function handleCreateView({ body, view, client, context, logger }) {
  const { channel } = JSON.parse(view.private_metadata);
  const values = view.state.values;
  const userId = body.user.id;

  const question = values.question.value.value?.trim();
  const rawChoices = values.choices.value.value ?? '';
  const choices = parseChoices(rawChoices);
  const selectedSettings = values.settings.value.selected_options?.map((o) => o.value) ?? [];
  const anonymous = selectedSettings.includes('anonymous');
  const multiSelect = selectedSettings.includes('multi_select');
  const addChoiceSetting = values.add_choice_setting.value.selected_option.value;

  if (choices.length < 2) {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: buildCreateModalView({
        channel,
        question,
        choicesText: rawChoices,
        anonymous,
        multiSelect,
        addChoiceSetting,
        error: "What's a poll without two or more choices?",
      }),
    });
    return;
  }

  if (!(await canAnchor(context.userClient, userId, channel))) {
    logger.warn(`${userId} denied for anchor_poll_create_modal in ${channel}`);
    return;
  }

  const joinError = await joinChannel(client, channel);
  if (joinError) {
    await client.chat.postMessage({ channel: userId, text: `Couldn't set up the anchor poll: ${joinError}` });
    return;
  }

  const existing = getAnchorPoll(channel);
  const poll = createAnchorPoll(channel, { creator: userId, question, choices, anonymous, multiSelect, addChoiceSetting });
  await unpinAndDeleteOldAnchorMessage(client, channel, existing?.message_ts, logger);

  try {
    await postAndPinPoll(client, poll);
    await logAdmin(client, {
      action: existing ? 'replaced the anchor poll' : 'created an anchor poll',
      adminUser: userId,
      channel,
      detail: question,
    });
  } catch (e) {
    logger.error(`anchor poll post failed in ${channel}: ${e.message}`);
    await client.chat.postMessage({
      channel: userId,
      text: `Created the anchor poll but couldn't post/pin it in <#${channel}>: \`${e.data?.error ?? e.message}\``,
    });
  }
}

function buildEditModalView(poll) {
  return {
    type: 'modal',
    callback_id: 'anchor_poll_edit_modal',
    private_metadata: JSON.stringify({ id: poll.id }),
    title: txt('Edit poll question'),
    close: txt('Cancel'),
    submit: txt('Save'),
    blocks: [
      {
        type: 'input',
        block_id: 'question',
        label: txt('Question'),
        element: { type: 'plain_text_input', action_id: 'value', initial_value: poll.question },
      },
    ],
  };
}

export async function openEditModal(client, triggerId, poll) {
  await client.views.open({ trigger_id: triggerId, view: buildEditModalView(poll) });
}

async function handleEditView({ body, view, client, context, logger }) {
  const { id } = JSON.parse(view.private_metadata);
  const question = view.state.values.question.value.value?.trim();
  const userId = body.user.id;

  const poll = getAnchorPollById(id);
  if (!poll || !question) return;

  if (!(await canAnchor(context.userClient, userId, poll.channel_id))) {
    logger.warn(`${userId} denied for anchor_poll_edit_modal in ${poll.channel_id}`);
    return;
  }

  const updated = updateAnchorPollQuestion(id, question);
  const blocks =
    updated.type === 'nps'
      ? buildAnchorNpsBlocks(updated, getAnchorNpsResponses(id))
      : buildAnchorPollBlocks(updated, getAnchorPollChoices(id), getAnchorPollVotes(id));

  if (updated.message_ts) {
    try {
      await client.chat.update({
        channel: updated.channel_id,
        ts: updated.message_ts,
        text: updated.question,
        blocks,
      });
    } catch (e) {
      logger.error(`anchor poll edit re-render failed in ${updated.channel_id}: ${e.message}`);
    }
  }
}

function buildAddOptionModalView(poll) {
  return {
    type: 'modal',
    callback_id: 'anchor_poll_add_option_modal',
    private_metadata: JSON.stringify({ id: poll.id }),
    title: txt('Add an option'),
    close: txt('Cancel'),
    submit: txt('Add'),
    blocks: [
      {
        type: 'input',
        block_id: 'option',
        label: txt('Option'),
        element: { type: 'plain_text_input', action_id: 'value' },
      },
    ],
  };
}

export async function openAddOptionModal(client, triggerId, poll) {
  await client.views.open({ trigger_id: triggerId, view: buildAddOptionModalView(poll) });
}

async function handleAddOptionView({ body, view, client, logger }) {
  const { id } = JSON.parse(view.private_metadata);
  const text = view.state.values.option.value.value?.trim();
  const userId = body.user.id;

  const poll = getAnchorPollById(id);
  if (!poll || !text || !canAddOption(poll, userId)) return;

  addAnchorPollChoice(id, userId, text);

  const choices = getAnchorPollChoices(id);
  const votes = getAnchorPollVotes(id);

  if (poll.message_ts) {
    try {
      await client.chat.update({
        channel: poll.channel_id,
        ts: poll.message_ts,
        text: poll.question,
        blocks: buildAnchorPollBlocks(poll, choices, votes),
      });
    } catch (e) {
      logger.error(`anchor poll add-option re-render failed in ${poll.channel_id}: ${e.message}`);
    }
  }
}

export const views = [
  { callbackId: 'anchor_poll_create_modal', handleView: handleCreateView },
  { callbackId: 'anchor_poll_edit_modal', handleView: handleEditView },
  { callbackId: 'anchor_poll_add_option_modal', handleView: handleAddOptionView },
];

function historyEntrySummary(poll) {
  const kind = poll.type === 'nps' ? 'NPS survey' : 'Poll';
  const count = poll.type === 'nps' ? getAnchorNpsResponses(poll.id).length : getAnchorPollVotes(poll.id).length;
  const status = poll.is_current ? (poll.enabled ? 'Current • Enabled' : 'Current • Disabled') : 'Past';
  return `*${poll.question}* _(${kind})_\n<@${poll.creator_user_id}> • <!date^${poll.created_at}^{date_short} at {time}|created> • ${status} • ${count} response${count === 1 ? '' : 's'}`;
}

function historyEntryBlock(poll) {
  return {
    type: 'section',
    text: { type: 'mrkdwn', text: historyEntrySummary(poll) },
    accessory: {
      type: 'button',
      text: txt('Details'),
      action_id: 'anchor_history_details',
      value: JSON.stringify({ id: poll.id }),
    },
  };
}

export default {
  name: 'anchor',
  description: 'Create and manage an anchored poll for this channel',

  async execute({ command, args, respond, client, context, logger }) {
    const channel = command.channel_id;
    const userId = command.user_id;
    const [action, ...rest] = args;

    if (action === 'nps') {
      return runAnchorNpsCommand({ channel, userId, rest, command, respond, client, context, logger });
    }

    if (action === 'list') {
      const targetChannel = rest[0] ? parseChannelMention(rest[0]) : channel;
      if (rest[0] && !targetChannel) {
        return respond(eph('Usage: `/pro anchor list [#channel]` — pass a valid channel mention.'));
      }

      if (!(await canAnchor(context.userClient, userId, targetChannel))) {
        return respond(eph(':loll: You do not have permission! :P'));
      }

      const history = listAnchorPolls(targetChannel, 5);
      if (!history.length) {
        return respond(eph(`No anchors have been created in <#${targetChannel}> yet.`));
      }

      const blocks = [
        { type: 'section', text: { type: 'mrkdwn', text: `*Last ${history.length} anchor${history.length === 1 ? '' : 's'} in <#${targetChannel}>*` } },
        { type: 'divider' },
        ...history.flatMap((poll, i) => (i === 0 ? [historyEntryBlock(poll)] : [{ type: 'divider' }, historyEntryBlock(poll)])),
      ];

      return respond({ response_type: 'ephemeral', blocks });
    }

    if (action === 'enable' || action === 'disable') {
      if (!(await canAnchor(context.userClient, userId, channel))) {
        return respond(eph(':loll: You do not have permission! :P'));
      }
      const poll = getAnchorPoll(channel);
      if (!poll) return respond(eph('No anchor poll configured for this channel yet. Run `/pro anchor` to create one.'));
      setAnchorPollEnabled(channel, action === 'enable');
      await logAdmin(client, {
        action: action === 'enable' ? 'enabled the anchor poll' : 'disabled the anchor poll',
        adminUser: userId,
        channel,
      });
      return respond(
        eph(
          action === 'enable'
            ? ':okay-1: Anchor poll enabled for this channel.'
            : ':okay-1: Anchor poll disabled for this channel.',
        ),
      );
    }

    if (action === 'status') {
      const poll = getAnchorPoll(channel);
      if (!poll) return respond(eph('No anchor poll configured for this channel.'));

      if (poll.type === 'nps') {
        const responses = getAnchorNpsResponses(poll.id);
        const scored = responses.filter((r) => r.score !== null);
        const avg = scored.length ? (scored.reduce((sum, r) => sum + r.score, 0) / scored.length).toFixed(1) : 'n/a';
        const closeText = poll.closes_at ? `Closes <!date^${poll.closes_at}^{date_short} at {time}|then>` : 'No closing date';
        return respond(eph(`*${poll.question}* (NPS survey)\nResponses: ${responses.length} • Average score: ${avg}\n${poll.enabled ? 'Enabled' : 'Disabled'} • ${closeText}`));
      }

      const choices = getAnchorPollChoices(poll.id);
      const votes = getAnchorPollVotes(poll.id);
      const lines = choices.map((c) => `• ${c.text} — ${votes.filter((v) => v.choice_id === c.id).length} vote(s)`);
      return respond(
        eph(
          `*${poll.question}*\n${lines.join('\n')}\n\n${poll.enabled ? 'Enabled' : 'Disabled'} • ${poll.anonymous ? 'Anonymous' : 'Not anonymous'} • ${poll.multi_select ? 'Multi-select' : 'Single-select'} • Add options: ${poll.add_choice_setting}`,
        ),
      );
    }

    if (!(await canAnchor(context.userClient, userId, channel))) {
      return respond(eph(':loll: You do not have permission! :P'));
    }

    const existing = getAnchorPoll(channel);
    const existingChoices = existing && existing.type !== 'nps' ? getAnchorPollChoices(existing.id) : [];

    await client.views.open({
      trigger_id: command.trigger_id,
      view: buildCreateModalView({
        channel,
        question: existing?.type !== 'nps' ? existing?.question : undefined,
        choicesText: existingChoices.map((c) => c.text).join('\n'),
        anonymous: !!existing?.anonymous,
        multiSelect: !!existing?.multi_select,
        addChoiceSetting: existing?.add_choice_setting,
      }),
    });
  },
};
