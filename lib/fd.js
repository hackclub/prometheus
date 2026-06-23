import { WebClient } from '@slack/web-api';

const SHROUD_ID = process.env.SHROUD_ID;
const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
let botClient = null;

function getClient(client) {
  if (!BOT_TOKEN) return client;
  if (!botClient) botClient = new WebClient(BOT_TOKEN);
  return botClient;
}

export async function fdReportDelete(client, { channel, message, deletedBy, reason }) {
  if (!SHROUD_ID) return;

  const sender = message.user || 'unknown';
  const text = message.text || '_no text content_';
  const ts = message.ts;

  let targetChannel = SHROUD_ID;
  try {
    const response = await getClient(client).conversations.open({
      users: SHROUD_ID,
    });
    if (response && response.ok && response.channel && response.channel.id) {
      targetChannel = response.channel.id;
    }
  } catch {
  }

  await getClient(client).chat.postMessage({
    channel: targetChannel,
    text: `Deletion from <#${channel}>`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `<@${deletedBy}> deleted a message from <@${sender}> in <#${channel}> <!date^${Math.floor(parseFloat(ts))}^{date_short_pretty} {time_secs}|${ts}>`,
        },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Reason:* ${reason}` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Deleted content:*\n>>> ${text}` },
      }
    ]
  });
}
