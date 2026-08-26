import { acceptPostingGate, getPostingGateForUser } from "../db.js";
import { canManage } from "../perms.js";
import {
  normalizePostingGatePhrase,
  postPostingGateAccepted,
  postPostingGatePrompt,
} from "../postingGate.js";

export const event = "message";
export const priority = -100;

const SYSTEM_SUBTYPES = new Set([
  "bot_message",
  "channel_archive",
  "channel_join",
  "channel_leave",
  "channel_name",
  "channel_purpose",
  "channel_topic",
  "channel_unarchive",
  "group_join",
  "group_leave",
  "group_name",
  "group_purpose",
  "group_topic",
  "group_unarchive",
  "message_deleted",
]);

function authoredMessage(event) {
  if (!event || SYSTEM_SUBTYPES.has(event.subtype)) return null;
  const message = event.subtype === "message_changed" ? event.message : event;
  if (!message?.user || message.bot_id) return null;
  return { ...message, channel: event.channel };
}

async function deleteMessage(context, logger, message) {
  try {
    await context.userClient.chat.delete({ channel: message.channel, ts: message.ts });
  } catch (error) {
    if (error.data?.error !== "message_not_found") {
      logger.warn(
        `posting gate delete failed in ${message.channel}: ${error.data?.error ?? error.message}`,
      );
    }
  }
}

export default async function postingGateListener({ event, client, context, logger }) {
  const message = authoredMessage(event);
  if (!message) return;

  const gate = await getPostingGateForUser(message.channel, message.user);
  if (!gate || gate.accepted) return;
  if (await canManage(context.userClient, message.user, message.channel)) return;

  if (
    gate.mode === "phrase" &&
    normalizePostingGatePhrase(message.text) === normalizePostingGatePhrase(gate.phrase)
  ) {
    const accepted = await acceptPostingGate(message.channel, message.user, gate);
    if (!accepted) return;

    await deleteMessage(context, logger, message);
    try {
      await postPostingGateAccepted(client, message.channel, message.user);
    } catch (error) {
      logger.warn(`posting gate confirmation failed: ${error.data?.error ?? error.message}`);
    }
    return false;
  }

  await deleteMessage(context, logger, message);
  try {
    await postPostingGatePrompt(client, message.channel, message.user, gate, { retry: true });
  } catch (error) {
    logger.warn(`posting gate retry prompt failed: ${error.data?.error ?? error.message}`);
  }
  return false;
}
