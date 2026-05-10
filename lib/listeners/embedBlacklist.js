import { parse } from "tldts";
import { listEmbedBlocks } from "../db.js";
import { deleteAttachment } from "../moderation.js";

export const event = "message";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function matchesPath(url, target) {
  const current = `${url.host}${url.pathname}`.replace(/\/+$/, "");
  const normalizedTarget = target.replace(/\/+$/, "");
  return current === normalizedTarget || current.startsWith(`${normalizedTarget}/`);
}

function isBlockedAttachment(attachment, blocks) {
  if (!attachment.id || !attachment.original_url) return false;

  let url;
  try {
    url = new URL(attachment.original_url);
  } catch {
    return false;
  }

  const domain = parse(url.hostname).domain;

  return blocks.some((block) => {
    if (block.type === "domain") return domain === block.target;
    if (block.type === "host") return url.host === block.target;
    if (block.type === "path") return matchesPath(url, block.target);
    return false;
  });
}

export default async function messageSentListener({ event, client }) {
  if (!event?.user) return;

  if (event.subtype) return;

  const blocks = listEmbedBlocks(event.channel);
  if (!blocks.length) return;

  // Check attachments a few times for robustness
  for (const delay of [0, 3000, 5000, 10000]) {
    await sleep(delay);
    // fetch message and check attachments

    const results = await client.conversations.history({
      channel: event.channel,
      latest: event.ts,
      inclusive: true,
      limit: 1,
    });
    const message = results.messages[0];
    // Message could have been deleted
    if (!message) return;

    // If no attachments, skip
    if (!message.attachments) continue;

    const blockedAttachments = message.attachments.filter((attachment) =>
      isBlockedAttachment(attachment, blocks),
    );

    if (!blockedAttachments.length) continue;

    await Promise.all(
      blockedAttachments.map((attachment) =>
        deleteAttachment(event.channel, message.ts, attachment.id),
      ),
    );

    break;
  }
}
