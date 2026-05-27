import { canManage } from '../perms.js';
import { RateLimiter } from '../ratelimiter.js';
import { logDelete } from '../logger.js';
import { publicLogDelete } from '../public-logger.js';

const rateLimiter = new RateLimiter(1000, 5);

const txt = (text) => ({ type: 'plain_text', text, emoji: true });

function noPermsModal() {
  return {
    type: 'modal',
    title: txt('Aw, Snap!'),
    close: txt('Close'),
    blocks: [{
      type: 'section',
      text: { type: 'mrkdwn', text: ':red-x: *You do not have permission to do this!* Only channel managers are able to use this bot. Try it again in a channel you manage.' }
    }]
  };
}

export default {
  callbackId: 'delete_message',

  async execute({ shortcut, client, context, logger }) {
    if (!await canManage(context.userClient, shortcut.user.id, shortcut.channel.id)) {
      logger.warn(`${shortcut.user.id} denied for delete_message`);
      await client.views.open({ trigger_id: shortcut.trigger_id, view: noPermsModal() });
      return;
    }

    try {
      await Promise.all([
        logDelete(client, {
          channel: shortcut.channel.id,
          message: shortcut.message,
          deletedBy: shortcut.user.id,
        }),
        publicLogDelete(client, {
          channel: shortcut.channel.id,
          deletedBy: shortcut.user.id,
        }),
      ]);

      await rateLimiter.exec(async () => {
        await context.userClient.chat.delete({
          channel: shortcut.channel.id,
          ts: shortcut.message.ts
        });
      });
      logger.info(`delete_message done ${shortcut.message.ts}`);
    } catch (error) {
      logger.error(`delete_message error deleting ${shortcut.message.ts}: ${error.message}`);
    }
  }
};
