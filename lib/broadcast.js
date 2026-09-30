const section = (text) => ({
  type: "section",
  text: { type: "mrkdwn", text },
});

export function buildBroadcastMessage(type, message) {
  const token = `<!${type}>`;
  const plain = `@${type}`;
  const body = `${plain} ${message}`;
  const withToken = body.replaceAll(plain, token);

  return {
    initial: {
      text: body,
      attachments: [{ fallback: withToken, blocks: [section(withToken)] }],
    },
    final: {
      text: body,
      blocks: [section(withToken)],
      attachments: [],
    },
  };
}

export async function postBroadcast(client, channel, type, message, extra = {}) {
  const { initial, final } = buildBroadcastMessage(type, message);
  const posted = await client.chat.postMessage({ channel, ...extra, ...initial });
  if (!posted.ts) throw new Error("Failed to send broadcast");

  await client.chat.update({ channel, ts: posted.ts, ...final });
  return posted.ts;
}
