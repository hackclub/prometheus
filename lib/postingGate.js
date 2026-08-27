export const normalizePostingGatePhrase = (text) =>
  (text || "")
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();

export const escapeMrkdwn = (text) =>
  String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const phraseGateIntroduction = (channelId) =>
  `Before posting${channelId ? ` in <#${channelId}>` : ""}, please confirm that you understand the channel's intended purpose and rules.`;
const quoted = (text) =>
  escapeMrkdwn(text)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

export const gateKicksOnJoin = (gate) => Boolean(gate?.kick_on_join);

export function buildPostingGateMessage(
  gate,
  { retry = false, stale = false, welcome, dm = false, kicked = false } = {},
) {
  const blocks = [];

  if (welcome) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `Welcome! ${escapeMrkdwn(welcome)}` },
    });
  }

  const notice = [
    kicked
      ? `You were removed from <#${gate.channel_id}> because it requires an acknowledgement before you can take part. Complete it below and Prometheus will add you straight back.`
      : "",
    retry ? "Your message was removed because you haven't acknowledged this channel yet." : "",
    stale
      ? "This posting gate changed since that prompt was sent. Review the current terms below."
      : "",
  ]
    .filter(Boolean)
    .map((line) => `${line}\n\n`)
    .join("");

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text:
        gate.mode === "phrase"
          ? `${notice}${phraseGateIntroduction(dm ? gate.channel_id : null)}`
          : `${notice}${escapeMrkdwn(gate.prompt)}`,
    },
  });

  const value = JSON.stringify({ channel: gate.channel_id, generation: gate.generation });

  if (gate.mode === "button") {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "posting_gate_agree",
          text: { type: "plain_text", text: "I agree" },
          style: "primary",
          value,
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
        text: dm
          ? `To continue, tap *Type the phrase* and enter this exactly:\n${quoted(gate.phrase)}`
          : `To continue, type this exact phrase in the channel and hit send:\n${quoted(gate.phrase)}`,
      },
    });
    if (dm) {
      blocks.push({
        type: "actions",
        elements: [
          {
            type: "button",
            action_id: "posting_gate_phrase",
            text: { type: "plain_text", text: "Type the phrase" },
            style: "primary",
            value,
          },
        ],
      });
    }
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

export async function postPostingGateDm(client, userId, gate, options) {
  const dm = await client.conversations.open({ users: userId });
  await client.chat.postMessage({
    channel: dm.channel.id,
    ...buildPostingGateMessage(gate, { ...options, dm: true }),
  });
}

export async function postPostingGateAccepted(client, channelId, userId) {
  await client.chat.postEphemeral({
    channel: channelId,
    user: userId,
    text: ":white_check_mark: Thanks! You are all set to post in this channel.",
  });
}

export async function kickForPostingGate(userClient, channelId, userId) {
  try {
    await userClient.conversations.kick({ channel: channelId, user: userId });
    return true;
  } catch (error) {
    const code = error.data?.error ?? error.message;
    if (code === "not_in_channel" || code === "user_not_in_channel") return true;
    throw error;
  }
}

export async function inviteAfterPostingGate(client, channelId, userId) {
  try {
    await client.conversations.invite({ channel: channelId, users: userId });
    return true;
  } catch (error) {
    const code = error.data?.error ?? error.message;
    if (code === "already_in_channel" || code === "cant_invite_self") return true;
    throw error;
  }
}

export function postingGatePhraseModal(gate) {
  return {
    type: "modal",
    callback_id: "posting_gate_phrase_entry",
    private_metadata: JSON.stringify({
      channel: gate.channel_id,
      generation: gate.generation,
    }),
    title: { type: "plain_text", text: "Acknowledge channel" },
    submit: { type: "plain_text", text: "Submit" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      ...(gate.prompt
        ? [{ type: "section", text: { type: "mrkdwn", text: quoted(gate.prompt) } }]
        : []),
      {
        type: "section",
        text: { type: "mrkdwn", text: `Type this exact phrase:\n${quoted(gate.phrase)}` },
      },
      {
        type: "input",
        block_id: "posting_gate_entry",
        label: { type: "plain_text", text: "Phrase" },
        element: {
          type: "plain_text_input",
          action_id: "phrase",
          max_length: 500,
        },
      },
    ],
  };
}
