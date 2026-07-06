import {
  getAnchorPoll,
  getAnchorPollChoices,
  getAnchorPollVotes,
  getAnchorNpsResponses,
  recordNpsComment,
  setAnchorPollMessageTs,
} from "../db.js";
import { buildAnchorPollBlocks } from "../blocks/anchorPoll.js";
import { buildAnchorNpsBlocks } from "../blocks/anchorNps.js";
import { syncNpsResponse } from "../airtable.js";

export const event = "message";

const RESURFACE_SUBTYPES = new Set([
  undefined,
  "bot_message",
  "file_share",
  "me_message",
  "thread_broadcast",
  "channel_convert_to_private",
  "channel_convert_to_public",
  "channel_join",
  "channel_leave",
  "channel_name",
  "channel_purpose",
  "channel_posting_permissions",
  "channel_topic",
  "channel_unarchive",
  "group_join",
  "group_leave",
  "group_name",
  "group_purpose",
  "group_topic",
  "group_unarchive",
]);

async function isMessagePinned(client, channel, ts) {
  try {
    const result = await client.conversations.history({
      channel,
      latest: ts,
      inclusive: true,
      limit: 1,
    });
    return Boolean(result.messages?.[0]?.pinned_to?.length);
  } catch {
    return false;
  }
}

async function repost(client, logger, poll) {
  if (poll.message_ts) {
    try {
      await client.chat.delete({ channel: poll.channel_id, ts: poll.message_ts });
    } catch (e) {
      logger.warn(
        `anchor poll repost-delete failed in ${poll.channel_id}: ${e.data?.error ?? e.message}`,
      );
    }
  }

  const blocks =
    poll.type === "nps"
      ? buildAnchorNpsBlocks(poll, getAnchorNpsResponses(poll.id))
      : buildAnchorPollBlocks(poll, getAnchorPollChoices(poll.id), getAnchorPollVotes(poll.id));

  try {
    const msg = await client.chat.postMessage({
      channel: poll.channel_id,
      text: poll.question,
      blocks,
      metadata: { event_type: "anchor_poll", event_payload: { channel: poll.channel_id } },
    });
    setAnchorPollMessageTs(poll.channel_id, msg.ts);
    await client.pins.add({ channel: poll.channel_id, timestamp: msg.ts });
  } catch (e) {
    const error = e.data?.error;
    logger.error(`anchor poll repost failed in ${poll.channel_id}: ${error ?? e.message}`);
    if (error === "not_in_channel") {
      try {
        await client.conversations.join({ channel: poll.channel_id });
      } catch {
        /* best effort */
      }
    }
  }
}

async function captureNpsThreadFeedback({ client, context, logger, channel, poll, event }) {
  const userId = event.user;
  const text = event.text?.trim();
  if (!userId || !text) return;

  recordNpsComment(poll.id, userId, text);

  try {
    await syncNpsResponse(poll, userId, { comment: text }, client, context);
  } catch (e) {
    logger.warn(`anchor nps comment airtable sync failed in ${channel}: ${e.message}`);
  }

  try {
    await context.userClient.chat.delete({ channel, ts: event.ts });
    await client.chat.postEphemeral({
      channel,
      user: userId,
      text: "Thanks! Recorded your feedback.",
      thread_ts: poll.message_ts,
    });
  } catch (e) {
    logger.warn(`anchor nps feedback capture failed in ${channel}: ${e.data?.error ?? e.message}`);
  }

  if (poll.message_ts) {
    try {
      await client.chat.update({
        channel,
        ts: poll.message_ts,
        text: poll.question,
        blocks: buildAnchorNpsBlocks(poll, getAnchorNpsResponses(poll.id)),
      });
    } catch (e) {
      logger.error(`anchor nps feedback re-render failed in ${channel}: ${e.message}`);
    }
  }
}

export default async function anchorPollListener({ event, client, context, logger }) {
  if (!RESURFACE_SUBTYPES.has(event.subtype)) return;
  if (event.metadata?.event_type === "anchor_poll") return;

  const channel = event.channel;
  const poll = getAnchorPoll(channel);
  if (!poll || !poll.enabled) return;
  if (event.ts === poll.message_ts) return;

  const threadTs = event.thread_ts;

  if (threadTs === poll.message_ts) {
    if (poll.type === "nps") {
      await captureNpsThreadFeedback({ client, context, logger, channel, poll, event });
    } else {
      try {
        await context.userClient.chat.delete({ channel, ts: event.ts });
        await client.chat.postEphemeral({
          channel,
          user: event.user,
          text: "Hey! Please don't reply directly to the anchor poll. Instead, start a new thread.",
          thread_ts: poll.message_ts,
        });
      } catch (e) {
        logger.warn(
          `anchor poll thread redirect failed in ${channel}: ${e.data?.error ?? e.message}`,
        );
      }
    }
  }

  if (threadTs && event.subtype !== "thread_broadcast") return;

  if (await isMessagePinned(client, channel, event.ts)) return;

  await repost(client, logger, poll);
}
