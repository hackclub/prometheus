import { acceptPostingGate, getPostingGateForUser } from "../db.js";
import {
  buildPostingGateMessage,
  gateKicksOnJoin,
  inviteAfterPostingGate,
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
  actionId: "posting_gate_agree",

  async execute({ ack, body, action, respond, context, logger }) {
    await ack();

    const binding = buttonBinding(action.value);
    const channelId = binding?.channel || body.channel?.id || body.container?.channel_id;
    const userId = body.user?.id;
    if (!channelId || !userId) return;

    const gate = await getPostingGateForUser(channelId, userId);
    if (!gate) {
      await respond({
        replace_original: true,
        response_type: "ephemeral",
        text: "This acknowledgement is no longer active.",
      });
      return;
    }

    if (gate.accepted) {
      await respond({
        replace_original: true,
        response_type: "ephemeral",
        text: ":white_check_mark: You have already acknowledged this posting gate, you are all set!",
      });
      return;
    }

    if (!binding || binding.generation !== gate.generation || gate.mode !== "button") {
      await respond({
        replace_original: true,
        response_type: "ephemeral",
        ...buildPostingGateMessage(gate, { stale: true, dm: channelId !== body.channel?.id }),
      });
      return;
    }

    if (!(await acceptPostingGate(channelId, userId, gate))) {
      logger.warn(`posting gate ${channelId} changed while ${userId} accepted it`);
      const currentGate = await getPostingGateForUser(channelId, userId);
      await respond(
        currentGate
          ? {
              replace_original: true,
              response_type: "ephemeral",
              ...buildPostingGateMessage(currentGate, {
                stale: true,
                dm: channelId !== body.channel?.id,
              }),
            }
          : {
              replace_original: true,
              response_type: "ephemeral",
              text: "This acknowledgement is no longer active.",
            },
      );
      return;
    }

    let invited = false;
    if (gateKicksOnJoin(gate)) {
      try {
        invited = await inviteAfterPostingGate(context.userClient, channelId, userId);
      } catch (error) {
        logger.warn(`posting gate invite failed: ${error.data?.error ?? error.message}`);
      }
    }

    await respond({
      replace_original: true,
      response_type: "ephemeral",
      text: invited
        ? `:white_check_mark: Thank you! You have been added back to <#${channelId}> and can post there now.`
        : `:white_check_mark: Thank you! You can now post in <#${channelId}>.`,
    });
  },
};
