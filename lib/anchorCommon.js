import {
  deleteAnchorPoll,
  getAnchorNpsResponses,
  getAnchorPollById,
  getAnchorPollChoices,
  getAnchorPollVotes,
} from "./db.js";
import { buildAnchorNpsBlocks } from "./blocks/anchorNps.js";
import { buildAnchorPollBlocks } from "./blocks/anchorPoll.js";
import { logAdmin } from "./logger.js";
import { syncNpsSurvey } from "./airtable.js";

export async function joinChannel(client, channel) {
  try {
    await client.conversations.join({ channel });
    return null;
  } catch (e) {
    const error = e.data?.error;
    if (error === "channel_not_found") return "please add me to the channel first, then try again!";
    if (error === "method_not_supported_for_channel_type") {
      try {
        const info = await client.conversations.info({ channel });
        if (info.channel?.is_channel || info.channel?.is_group) return null;
      } catch {
        /* fall through to the DM/MPIM message below */
      }
      return "anchor doesn't support direct messages or multi-person direct messages.";
    }
    if (error === "too_many_members") return "looks like this channel is full D:";
    return `an unexpected error occurred: \`${error ?? e.message}\``;
  }
}

export function parseChannelMention(token) {
  if (!token) return null;
  const mention = token.match(/^<#([A-Z0-9]+)(\|[^>]+)?>$/);
  if (mention) return mention[1];
  if (/^[CG][A-Z0-9]+$/.test(token)) return token;
  return null;
}

export async function unpinAndDeleteOldAnchorMessage(client, channel, ts, logger) {
  if (!ts) return;
  try {
    await client.pins.remove({ channel, timestamp: ts });
  } catch (e) {
    logger.warn(`anchor old message unpin failed in ${channel}: ${e.data?.error ?? e.message}`);
  }
  try {
    await client.chat.delete({ channel, ts });
  } catch (e) {
    logger.warn(`anchor old message delete failed in ${channel}: ${e.data?.error ?? e.message}`);
  }
}

export async function deleteAnchor(client, poll, userId, logger) {
  deleteAnchorPoll(poll.channel_id);
  await unpinAndDeleteOldAnchorMessage(client, poll.channel_id, poll.message_ts, logger);

  if (poll.type === "nps") {
    try {
      await syncNpsSurvey(getAnchorPollById(poll.id), client);
    } catch (e) {
      logger.warn(`anchor nps close-sync failed in ${poll.channel_id}: ${e.message}`);
    }
  }

  const kind = poll.type === "nps" ? "survey" : poll.type === "message" ? "message" : "poll";
  await logAdmin(client, {
    action: `deleted the anchor ${kind}`,
    adminUser: userId,
    channel: poll.channel_id,
    detail: poll.question,
  });
}

export async function closeOldAnchorMessage(client, context, channel, oldPoll, logger) {
  if (!oldPoll?.message_ts) return;

  try {
    await client.pins.remove({ channel, timestamp: oldPoll.message_ts });
  } catch (e) {
    logger.warn(`anchor old message unpin failed in ${channel}: ${e.data?.error ?? e.message}`);
  }

  if (oldPoll.type === "message") return;

  try {
    const blocks =
      oldPoll.type === "nps"
        ? buildAnchorNpsBlocks(oldPoll, getAnchorNpsResponses(oldPoll.id), { closed: true })
        : await buildAnchorPollBlocks(
            context.userClient,
            oldPoll,
            getAnchorPollChoices(oldPoll.id),
            getAnchorPollVotes(oldPoll.id),
            { closed: true },
          );

    await client.chat.update({ channel, ts: oldPoll.message_ts, text: oldPoll.question, blocks });
  } catch (e) {
    logger.warn(`anchor old message close failed in ${channel}: ${e.data?.error ?? e.message}`);
  }
}
