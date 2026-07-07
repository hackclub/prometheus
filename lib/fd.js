const SHROUD_ID = process.env.SHROUD_ID;

export async function fdReportDelete(client, { channel, message, deletedBy, reason }) {
  if (!SHROUD_ID) return;

  const sender = message.user || "unknown";
  const text = message.text || "_no text content_";
  const ts = message.ts;

  const reportText = [
    `*[Prometheus Report]* <@${deletedBy}> deleted a message from <@${sender}> in <#${channel}> <!date^${Math.floor(parseFloat(ts))}^{date_short_pretty} {time_secs}|${ts}>`,
    `*Reason:* ${reason}`,
    `*Deleted content:*\n>>> ${text}`,
  ].join("\n");

  let targetChannel = SHROUD_ID;
  try {
    const response = await client.conversations.open({ users: SHROUD_ID });
    if (response?.ok && response.channel?.id) {
      targetChannel = response.channel.id;
    }
  } catch (error) {
    console.warn("Failed to open DM with Shroud, falling back to direct ID:", error);
  }

  await client.chat.postMessage({ channel: targetChannel, text: reportText });
}

export async function fdReportNuke(client, { channel, threadTs, mode, destroyedBy, reason }) {
  if (!SHROUD_ID) return;

  const action = mode === "hide" ? "hid" : "destroyed";

  const reportText = [
    `*[Prometheus Report]* <@${destroyedBy}> ${action} a thread in <#${channel}> <!date^${Math.floor(parseFloat(threadTs))}^{date_short_pretty} {time_secs}|${threadTs}>`,
    `*Reason:* ${reason}`,
  ].join("\n");

  let targetChannel = SHROUD_ID;
  try {
    const response = await client.conversations.open({ users: SHROUD_ID });
    if (response?.ok && response.channel?.id) {
      targetChannel = response.channel.id;
    }
  } catch (error) {
    console.warn("Failed to open DM with Shroud, falling back to direct ID:", error);
  }

  await client.chat.postMessage({ channel: targetChannel, text: reportText });
}
