import { WebClient } from '@slack/web-api';

const LOG_CHANNEL = process.env.LOG_CHANNEL;
const CDN_KEY = process.env.HACKCLUB_CDN_KEY;
const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
let botClient = null;

function getLogClient(client) {
  if (!BOT_TOKEN) return client;

  if (!botClient) {
    botClient = new WebClient(BOT_TOKEN);
  }

  return botClient;
}

export async function logDelete(client, { channel, message, deletedBy }) {
  if (!LOG_CHANNEL) return;

  const sender = message.user || 'unknown';
  const text = message.text || '_no text content_';
  const ts = message.ts;

  await getLogClient(client).chat.postMessage({
    channel: LOG_CHANNEL,
    text: `Message deleted in <#${channel}>`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:wastebasket: <@${deletedBy}> deleted a message from <@${sender}> in <#${channel}> <!date^${Math.floor(parseFloat(ts))}^{date_short_pretty} {time_secs}|${ts}>`, // todo replace with better emoji
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `>>> ${text}`,
        },
      },
    ],
  });
}

export async function logBan(client, { channel, user, bannedBy, reason, expires, unbanned }) {
  if (!LOG_CHANNEL) return;

  const action = unbanned
    ? `:okay-1: <@${bannedBy}> removed timeout for <@${user}> from <#${channel}>`
    : `:bonk: <@${bannedBy}> timed out <@${user}> from <#${channel}>${expires ? ` until <!date^${expires}^{date_short_pretty} at {time}|${new Date(expires * 1000).toUTCString()}>` : ''}`;

  const blocks = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: action },
    },
  ];

  if (reason) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `>>> ${reason}` },
    });
  }

  await getLogClient(client).chat.postMessage({
    channel: LOG_CHANNEL,
    text: unbanned ? `User timeout removed in channel` : `User timed out in channel`,
    blocks,
  });
}

export async function logAdmin(client, { action, adminUser, channel, detail }) {
  if (!LOG_CHANNEL) return;

  await getLogClient(client).chat.postMessage({
    channel: LOG_CHANNEL,
    text: `Admin action in <#${channel}>`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:mhm: <@${adminUser}> ${action} in <#${channel}>${detail ? `\n>>> ${detail}` : ''}`,
        },
      },
    ],
  });
}
export async function logThread(client, logger, { channel, threadTs, messages, deletedBy }) {
  if (!LOG_CHANNEL) return; // ding dong didnt set it up

  let cdnUrl = null;

  const lc = getLogClient(client);
  const names = {};
  await Promise.all(
    [...new Set(messages.map((m) => m.user).filter(Boolean))].map(async (u) => {
      try {
        const { user: info } = await lc.users.info({ user: u });
        names[u] = info?.profile?.display_name || info?.real_name || info?.name || u;
      } catch (err) {
        logger.error(`failed to find user ${u}: ${err.message}`);
        try {
          const { user: info } = await client.users.info({ user: u });
          names[u] = info?.profile?.display_name || info?.real_name || info?.name || u;
        } catch {
          names[u] = u;
        }
      }
    }),
  );

  const lines = messages.map((m) => {
    const u = m.user || 'unknown';
    return `[${new Date(parseFloat(m.ts) * 1000).toISOString()}] <${u}|${names[u] || u}> ${m.text || ''}`;
  });

  const content = lines.join('\n');

  if (CDN_KEY) {
    try {
      const blob = new Blob([content], { type: 'text/plain' });
      const formData = new FormData();
      formData.append('file', blob, `thread-${channel}-${threadTs}.txt`);

      const res = await fetch('https://cdn.hackclub.com/api/v4/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${CDN_KEY}` },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        cdnUrl = data.url;
      } else {
        logger.error(`CDN upload failed: ${res.status} ${await res.text()}`);
      }
    } catch (err) {
      logger.error(`CDN upload error: ${err.message}`);
    }
  }

  const cdnLine = cdnUrl ? `\n*Archive:* ${cdnUrl}` : '\n_CDN upload skipped or failed_';

  await getLogClient(client).chat.postMessage({
    channel: LOG_CHANNEL,
    text: `Thread deleted in <#${channel}>`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:fire: <@${deletedBy}> destroyed a thread in <#${channel}> with ${messages.length} messages.${cdnLine}`, // todo replace with better emoji
        },
      },
    ],
  });
}
