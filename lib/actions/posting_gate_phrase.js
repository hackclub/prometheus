import { acceptPostingGate, getPostingGateForUser } from "../db.js";
import {
  buildPostingGateMessage,
  gateKicksOnJoin,
  inviteAfterPostingGate,
  normalizePostingGatePhrase,
  postingGatePhraseModal,
} from "../postingGate.js";

function buttonBinding(value) {
  try {
    const binding = JSON.parse(value);
    if (typeof binding.channel !== "string" || typeof binding.generation !== "string") return null;
    return binding;
  } catch {
    return null;
  }
}

export default {
  actionId: "posting_gate_phrase",

  async execute({ ack, body, action, respond, client, logger }) {
    await ack();

    const binding = buttonBinding(action.value);
    const userId = body.user?.id;
    if (!binding || !userId) return;

    const gate = await getPostingGateForUser(binding.channel, userId);
    if (!gate) {
      await respond({
        replace_original: true,
        text: "This acknowledgement is no longer active.",
      });
      return;
    }

    if (gate.accepted) {
      await respond({
        replace_original: true,
        text: ":white_check_mark: You have already acknowledged this posting gate, you are all set!",
      });
      return;
    }

    if (binding.generation !== gate.generation || gate.mode !== "phrase") {
      await respond({
        replace_original: true,
        ...buildPostingGateMessage(gate, { stale: true, dm: true }),
      });
      return;
    }

    try {
      await client.views.open({ trigger_id: body.trigger_id, view: postingGatePhraseModal(gate) });
    } catch (error) {
      logger.warn(`posting gate phrase modal failed: ${error.data?.error ?? error.message}`);
    }
  },
};

async function submitPhrase({ ack, body, view, client, context, logger }) {
  const { channel, generation } = JSON.parse(view.private_metadata);
  const userId = body.user.id;

  const gate = await getPostingGateForUser(channel, userId);
  if (!gate || gate.accepted || gate.generation !== generation || gate.mode !== "phrase") {
    await ack({
      response_action: "update",
      view: {
        type: "modal",
        title: { type: "plain_text", text: "Acknowledge channel" },
        close: { type: "plain_text", text: "Close" },
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: gate?.accepted
                ? `:white_check_mark: You have already acknowledged <#${channel}>.`
                : "This acknowledgement is no longer active. Check your DMs for the current terms.",
            },
          },
        ],
      },
    });

    if (gate && !gate.accepted) {
      try {
        const dm = await client.conversations.open({ users: userId });
        await client.chat.postMessage({
          channel: dm.channel.id,
          ...buildPostingGateMessage(gate, { stale: true, dm: true }),
        });
      } catch (error) {
        logger.warn(`posting gate refresh dm failed: ${error.data?.error ?? error.message}`);
      }
    }
    return;
  }

  const entered = view.state.values.posting_gate_entry.phrase.value;
  if (normalizePostingGatePhrase(entered) !== normalizePostingGatePhrase(gate.phrase)) {
    await ack({
      response_action: "errors",
      errors: { posting_gate_entry: "That does not match the required phrase exactly." },
    });
    return;
  }

  if (!(await acceptPostingGate(channel, userId, gate))) {
    await ack({
      response_action: "errors",
      errors: { posting_gate_entry: "This gate just changed. Check your DMs for the new terms." },
    });
    return;
  }

  let invited = false;
  if (gateKicksOnJoin(gate)) {
    try {
      invited = await inviteAfterPostingGate(context.userClient, channel, userId);
    } catch (error) {
      logger.warn(`posting gate invite failed: ${error.data?.error ?? error.message}`);
    }
  }

  await ack({
    response_action: "update",
    view: {
      type: "modal",
      title: { type: "plain_text", text: "Acknowledge channel" },
      close: { type: "plain_text", text: "Done" },
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: invited
              ? `:white_check_mark: Thank you! You have been added back to <#${channel}> and can post there now.`
              : `:white_check_mark: Thank you! You can now post in <#${channel}>.`,
          },
        },
      ],
    },
  });
}

export const views = [{ callbackId: "posting_gate_phrase_entry", handleView: submitPhrase }];
