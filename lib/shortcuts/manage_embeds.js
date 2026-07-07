import { canManage } from "../perms.js";
import { areWeEnterprise } from "../moderation.js";
import { parse } from "tldts";

const txt = (text) => ({ type: "plain_text", text, emoji: true });

// Constants to prevent exceding Slack's modal block limits
const MAX_MODAL_BLOCKS = 100;
const BLOCKS_PER_ATTACHMENT = 3;
const MAX_ATTACHMENTS_IN_MODAL = Math.floor(MAX_MODAL_BLOCKS / BLOCKS_PER_ATTACHMENT);
const MAX_SELECT_OPTIONS = 100;
const MAX_OPTION_TEXT_LENGTH = 75;
const MAX_OPTION_VALUE_LENGTH = 2000;

function truncate(text, maxLength) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
}

function optionText(text) {
  return txt(truncate(text, MAX_OPTION_TEXT_LENGTH));
}

function parseAttachmentUrl(attachment) {
  if (!attachment.id || !attachment.original_url) return null;

  try {
    return new URL(attachment.original_url);
  } catch {
    return null;
  }
}

function blockOptionsFor(url) {
  const pathSegments = url.pathname.split("/").filter(Boolean);
  const domain = parse(url.hostname).domain;

  const pathSegmentsBlockOptions = pathSegments.map((_, index) => {
    const path = pathSegments.slice(0, index + 1).join("/");
    const target = `${url.host}/${path}`;

    return {
      text: optionText(`Block ${target}/*`),
      value: `block:path:${target}`,
    };
  });

  const options = [
    domain && {
      text: optionText(`Block *.${domain}/*`),
      value: `block:domain:${domain}`,
    },
    {
      text: optionText(`Block ${url.host}/*`),
      value: `block:host:${url.host}`,
    },
    ...pathSegmentsBlockOptions,
  ];

  return options
    .filter((option) => option && option.value.length <= MAX_OPTION_VALUE_LENGTH)
    .slice(0, MAX_SELECT_OPTIONS);
}

function blocksForAttachment({ attachment, url }) {
  const blockId = `manage_embed_${attachment.id}`;

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
    if (!(await canManage(context.userClient, shortcut.user.id, shortcut.channel.id))) {
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

    const manageableAttachments = msg.attachments
      .map((attachment) => ({ attachment, url: parseAttachmentUrl(attachment) }))
      .filter(({ url }) => url)
      .slice(0, MAX_ATTACHMENTS_IN_MODAL);

    if (!manageableAttachments.length) {
      await client.views.open({
        trigger_id: shortcut.trigger_id,
        view: errorModal("This message has no manageable embeds!"),
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
          blocks: manageableAttachments.flatMap(blocksForAttachment),
          private_metadata: JSON.stringify({
            channel: shortcut.channel.id,
            ts: msg.ts,
          }),
        },
      });
      logger.info(`manage_embeds opened ${msg.ts} by ${shortcut.user.id}`);
    } catch (error) {
      logger.error(`manage_embeds modal error on ${msg.ts}: ${error.message}`);
    }
  },
};
