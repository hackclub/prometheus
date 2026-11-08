export const normalizePostingGatePhrase = (text) =>
  (text || "")
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();

export const escapeMrkdwn = (text) =>
  String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const phraseGateIntroduction =
  "Before posting, please confirm that you understand the channel's intended purpose and rules.";
const quoted = (text) =>
  escapeMrkdwn(text)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

function buildDeletedTextBlocks(deletedText) {
  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Here's what you sent (copy it before leaving this channel):*",
      },
    },
  ];
  let remaining = deletedText;
  while (remaining) {
    let end = Math.min(3000, remaining.length);
    if (end < remaining.length && /[\uD800-\uDBFF]/.test(remaining[end - 1])) end--;
    blocks.push({
      type: "section",
      text: { type: "plain_text", text: remaining.slice(0, end), emoji: false },
    });
    remaining = remaining.slice(end);
  }
  return blocks;
}

export function buildPostingGateMessage(
  gate,
  { retry = false, stale = false, welcome, deletedText } = {},
) {
  const blocks = [];

  if (welcome) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `Welcome! ${escapeMrkdwn(welcome)}` },
    });
  }

  const notice = `${retry ? "Your message was removed because you haven't acknowledged this channel yet.\n\n" : ""}${stale ? "This posting gate changed since that prompt was sent. Review the current terms below.\n\n" : ""}`;

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text:
        gate.mode === "phrase"
          ? `${notice}${phraseGateIntroduction}`
          : `${notice}${escapeMrkdwn(gate.prompt)}`,
    },
  });

  if (retry && deletedText) {
    blocks.push(...buildDeletedTextBlocks(deletedText));
  }

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
    if (gate.prompt) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: quoted(gate.prompt) },
      });
    }
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `To continue, type this exact phrase in the channel and hit send:\n${quoted(gate.phrase)}`,
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
