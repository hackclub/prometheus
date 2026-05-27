import { WebClient } from '@slack/web-api';

const c = process.env.PUBLIC_LOG_CHANNEL;
const t = process.env.SLACK_BOT_TOKEN;
let bot = null;

function getLogClient(client) {
  if (!t) return client;

  if (!bot) {
    bot = new WebClient(t);
  }

  return bot;
}

export async function publicLogDelete(client, { channel, deletedBy }) {
  if (!c) return;

  await getLogClient(client).chat.postMessage({
    channel: c,
    text: `Message deleted in <#${channel}>`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:win10-trash: <@${deletedBy}> deleted a message in <#${channel}>.`,
        },
      },
    ],
  });
}

export async function publicLogThread(client, { channel, messages, deletedBy }) {
  if (!c) return;


  await getLogClient(client).chat.postMessage({
    channel: c,
    text: `Thread deleted in <#${channel}>`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:explode: <@${deletedBy}> \`sudo rm -rf\`ed a thread with ${messages.length} messages in <#${channel}>.`,
        },
      },
    ],
  });
}
