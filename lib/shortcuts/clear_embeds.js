import { canManage } from "../perms.js";
import { areWeEnterprise, deleteAttachment } from "../moderation.js";

const txt = (text) => ({ type: "plain_text", text, emoji: true });
let userAuthPromise;
let botAuthPromise;

function noPermsModal() {
  return {
    type: "modal",
    title: txt("Aw, Snap!"),
    close: txt("Close"),
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: ":red-x: *You do not have permission to do this!* Only channel managers are able to use this bot. Try it again in a channel you manage.",
        },
      },
    ],
  };
}

function errorModal(message) {
  return {
    type: "modal",
    title: txt("Error"),
    close: txt("Close"),
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: message },
      },
    ],
  };
}

async function getUserAuth(userClient) {
  userAuthPromise ??= userClient.auth.test();
  return userAuthPromise;
}

async function getBotAuth(botClient) {
  botAuthPromise ??= botClient.auth.test();
  return botAuthPromise;
}

async function getUpdatingClient({ msg, client, context }) {
  const [userAuth, botAuth] = await Promise.all([
    getUserAuth(context.userClient),
    getBotAuth(client),
  ]);

  if (msg.user === userAuth.user_id) {
    return context.userClient;
  }

  if (msg.bot_id && botAuth.bot_id && msg.bot_id === botAuth.bot_id) {
    return client;
  }

  if (msg.user === botAuth.user_id) {
    return client;
  }

  return null;
}

export default {
  callbackId: "clear_embeds",

  async execute({ shortcut, client, context, logger }) {
    if (!(await canManage(context.userClient, shortcut.user.id, shortcut.channel.id))) {
      logger.warn(`${shortcut.user.id} denied for clear_embeds`);
      await client.views.open({ trigger_id: shortcut.trigger_id, view: noPermsModal() });
      return;
    }

    const msg = shortcut.message;

    if (!msg.attachments?.length) {
      await client.views.open({
        trigger_id: shortcut.trigger_id,
        view: errorModal("This message has no embeds to clear!"),
      });
      return;
    }

    try {
      if (areWeEnterprise) {
        for (const attachment of msg.attachments) {
          await deleteAttachment(shortcut.channel.id, msg.ts, attachment.id);
        }
        logger.info(`clear_embeds done ${msg.ts} by ${shortcut.user.id}`);
        return;
      }

      const updatingClient = await getUpdatingClient({ msg, client, context });
      if (!updatingClient) {
        throw new Error(
          "Slack only allows clearing embeds on messages sent by this app or the SLACK_USER_TOKEN account",
        );
      }

      await updatingClient.chat.update({
        channel: shortcut.channel.id,
        ts: msg.ts,
        text: msg.text || "",
        attachments: [],
        unfurl_links: false,
        unfurl_media: false,
      });
      logger.info(`clear_embeds done ${msg.ts} by ${shortcut.user.id}`);
    } catch (error) {
      logger.error(`clear_embeds error on ${msg.ts}: ${error.message}`);
      try {
        await client.views.open({
          trigger_id: shortcut.trigger_id,
          view: errorModal(`:x: Failed to clear embeds: ${error.message}`),
        });
      } catch {
        /* trigger_id may have expired */
      }
    }
  },
};
