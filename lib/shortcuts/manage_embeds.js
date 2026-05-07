import { canManage } from "../perms.js";
import { areWeEnterprise } from "../moderation.js";
import { parse } from "tldts";

const txt = (text) => ({ type: "plain_text", text, emoji: true });

function blockOptionsFor(url) {
  const pathSegments = url.pathname.split("/").filter(Boolean);

  const pathSegmentsBlockOptions = pathSegments.map((_, index) => {
    const path = pathSegments.slice(0, index + 1).join("/");
    const target = `${url.host}/${path}`;

    return {
      text: txt(`Block ${target}/*`),
      value: `block:${target}`,
    };
  });

  return [
    {
      text: txt(`Block *.${parse(url.host).domain}/*`),
      value: `block:${parse(url.host).domain}`,
    },
    {
      text: txt(`Block ${url.host}/*`),
      value: `block:${url.host}`,
    },
    ...pathSegmentsBlockOptions,
  ];
}

function blocksForAttachment(attachment, index) {
  const url = new URL(attachment.original_url);
  const blockId = `manage_embed_${attachment.id ?? index}`;

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${attachment.title}* - ${attachment.author_name ?? url.host}`,
      },
    },
    {
      type: "actions",
      block_id: blockId,
      elements: [
        {
          type: "button",
          text: txt("Destroy"),
          style: "danger",
          value: String(attachment.id),
          action_id: `destroy_embed`,
        },
        {
          type: "static_select",
          options: blockOptionsFor(url),
          placeholder: txt("Block"),
          action_id: `block_embed`,
        },
      ],
    },
    {
      type: "divider",
    },
  ];
}

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

export default {
  callbackId: "manage_embeds",

  async execute({ shortcut, client, context, logger }) {
    if (
      !(await canManage(
        context.userClient,
        shortcut.user.id,
        shortcut.channel.id,
      ))
    ) {
      logger.warn(`${shortcut.user.id} denied for manage_embeds`);
      await client.views.open({
        trigger_id: shortcut.trigger_id,
        view: noPermsModal(),
      });
      return;
    }

    if (!areWeEnterprise) {
      logger.warn(
        `${shortcut.user.id} attempted to manage embeds but browser token and cookie are not provided`,
      );
      await client.views.open({
        trigger_id: shortcut.trigger_id,
        view: errorModal(`:x: Slack browser token and cookie not provided`),
      });
      return;
    }

    const msg = shortcut.message;

    if (!msg.attachments?.length) {
      await client.views.open({
        trigger_id: shortcut.trigger_id,
        view: errorModal("This message has no embeds!"),
      });
      return;
    }

    try {
      await client.views.open({
        trigger_id: shortcut.trigger_id,
        view: {
          type: "modal",
          title: txt("Manage embeds"),
          close: txt("Close"),
          blocks: msg.attachments.flatMap(blocksForAttachment),
          private_metadata: JSON.stringify({
            channel: shortcut.channel.id,
            ts: msg.ts,
          }),
        },
      });
      logger.info(`clear_embeds done ${msg.ts} by ${shortcut.user.id}`);
    } catch {
      /* trigger_id may have expired */
    }
  },
};
