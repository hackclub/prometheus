import { canAnchor } from './perms.js';
import { getAnchorPoll, createAnchorNpsSurvey, setAnchorPollMessageTs } from './db.js';
import { buildAnchorNpsBlocks } from './blocks/anchorNps.js';
import { joinChannel, unpinAndDeleteOldAnchorMessage } from './anchorCommon.js';
import { logAdmin } from './logger.js';
import { syncNpsSurvey } from './airtable.js';

const eph = (text) => ({ response_type: 'ephemeral', text });

export async function runAnchorNpsCommand({ channel, userId, rest, respond, client, context, logger }) {
  if (!(await canAnchor(context.userClient, userId, channel))) {
    return respond(eph(':loll: You do not have permission! :P'));
  }

  let days = 7;
  let titleParts = rest;
  if (rest.length && /^\d+$/.test(rest[0])) {
    days = parseInt(rest[0], 10);
    titleParts = rest.slice(1);
  }
  if (days <= 0) {
    return respond(eph('Usage: `/pro anchor nps [days] [title]`, days must be a positive whole number.'));
  }
  const title =
    titleParts.join(' ').trim() ||
    'On a scale of 1-10, how likely are you to recommend this channel to a friend?';

  const joinError = await joinChannel(client, channel);
  if (joinError) {
    return respond(eph(`Couldn't set up the NPS survey: ${joinError}`));
  }

  const existing = getAnchorPoll(channel);
  const poll = createAnchorNpsSurvey(channel, { creator: userId, question: title, days });
  await unpinAndDeleteOldAnchorMessage(client, channel, existing?.message_ts, logger);

  try {
    const msg = await client.chat.postMessage({
      channel,
      text: poll.question,
      blocks: buildAnchorNpsBlocks(poll, []),
      metadata: { event_type: 'anchor_poll', event_payload: { channel } },
    });
    setAnchorPollMessageTs(channel, msg.ts);
    await client.pins.add({ channel, timestamp: msg.ts });
    try {
      await syncNpsSurvey(poll, client);
    } catch (e) {
      logger.warn(`anchor nps airtable sync failed in ${channel}: ${e.message}`);
    }
    await logAdmin(client, {
      action: existing ? 'replaced the anchor with an NPS survey' : 'created an anchor NPS survey',
      adminUser: userId,
      channel,
      detail: `${title} (closes in ${days} day${days === 1 ? '' : 's'})`,
    });
  } catch (e) {
    logger.error(`anchor nps survey post failed in ${channel}: ${e.message}`);
    return respond(eph(`Created the NPS survey but couldn't post/pin it: \`${e.data?.error ?? e.message}\``));
  }

  return respond(eph(`:okay-1: NPS survey created for <#${channel}>.`));
}
