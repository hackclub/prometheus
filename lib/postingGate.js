export const normalizePostingGatePhrase = (text) =>
  (text || "")
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();

export const escapeMrkdwn = (text) =>
  String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export function buildPostingGateMessage(gate, { retry = false, stale = false, welcome } = {}) {
  const blocks = [];

  if (welcome) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `Welcome! ${escapeMrkdwn(welcome)}` },
    });
  }

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `${retry ? "Your message was removed because you haven't acknowledged this channel yet.\n\n" : ""}${stale ? "This posting gate changed since that prompt was sent. Review the current terms below.\n\n" : ""}${escapeMrkdwn(gate.prompt)}`,
    },
  });

  if (gate.mode === "button") {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "posting_gate_agree",
          text: { type: "plain_text", text: "I agree" },
          style: "primary",
          value: JSON.stringify({ channel: gate.channel_id, generation: gate.generation }),
        },
      ],
    });
  } else {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `To continue, type this exact phrase in the channel:\n> ${escapeMrkdwn(gate.phrase)}`,
      },
    });
  }

  return {
    text:
      gate.mode === "button"
        ? "Acknowledge this channel before posting."
        : `Before posting, send this exact phrase: ${gate.phrase}`,
    blocks,
  };
}

export async function postPostingGatePrompt(client, channelId, userId, gate, options) {
  await client.chat.postEphemeral({
    channel: channelId,
    user: userId,
    ...buildPostingGateMessage(gate, options),
  });
}

export async function postPostingGateAccepted(client, channelId, userId) {
  await client.chat.postEphemeral({
    channel: channelId,
    user: userId,
    text: ":white_check_mark: Thanks! You are all set to post in this channel.",
  });
}
