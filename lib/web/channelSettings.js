import { parse } from "tldts";
import {
  addEmbedBlock,
  createAnchorMessage,
  createAnchorNpsSurvey,
  createAnchorPoll,
  getAnchorNpsResponses,
  getAnchorPoll,
  getAnchorPollById,
  getAnchorPollChoices,
  getAnchorPollVotes,
  getwelcome,
  listEmbedBlocks,
  removeEmbedBlock,
  removewelcome,
  setAnchorPollEnabled,
  setAnchorPollMessageTs,
  setwelcome,
} from "../db.js";
import { buildAnchorMessageBlocks } from "../blocks/anchorMessage.js";
import { buildAnchorNpsBlocks } from "../blocks/anchorNps.js";
import { buildAnchorPollBlocks } from "../blocks/anchorPoll.js";
import { closeOldAnchorMessage, deleteAnchor, joinChannel } from "../anchorCommon.js";
import { logAdmin } from "../logger.js";
import { syncNpsSurvey } from "../airtable.js";

const logger = console;

export async function loadChannelSettings(channelId) {
  const [anchor, welcome, embedRules] = await Promise.all([
    getAnchorPoll(channelId),
    getwelcome(channelId),
    listEmbedBlocks(channelId),
  ]);

  if (!anchor) return { anchor: null, welcome, embedRules };

  const [choices, votes, responses] = await Promise.all([
    anchor.type === "poll" ? getAnchorPollChoices(anchor.id) : [],
    anchor.type === "poll" ? getAnchorPollVotes(anchor.id) : [],
    anchor.type === "nps" ? getAnchorNpsResponses(anchor.id) : [],
  ]);
  return { anchor: { ...anchor, choices, votes, responses }, welcome, embedRules };
}

function cleanText(value, name, maxLength) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${name} is required.`);
  if (text.length > maxLength) throw new Error(`${name} must be ${maxLength} characters or fewer.`);
  return text;
}

function pollChoices(value) {
  const choices = [];
  const seen = new Set();
  for (const line of String(value || "").split("\n")) {
    const choice = line.trim();
    if (!choice || seen.has(choice)) continue;
    if (choice.length > 200) throw new Error("Each poll choice must be 200 characters or fewer.");
    seen.add(choice);
    choices.push(choice);
  }
  if (choices.length < 2) throw new Error("Add at least two different poll choices.");
  if (choices.length > 20) throw new Error("Polls can have up to 20 choices.");
  return choices;
}

async function prepareAnchor(client, channelId) {
  const joinError = await joinChannel(client, channelId);
  if (joinError) throw new Error(joinError);
  return getAnchorPoll(channelId);
}

async function closePrevious(botClient, userClient, channelId, previous) {
  await closeOldAnchorMessage(botClient, { userClient }, channelId, previous, logger);
  if (previous?.type === "nps") {
    try {
      await syncNpsSurvey(await getAnchorPollById(previous.id), botClient);
    } catch (error) {
      logger.warn(`dashboard NPS close sync failed in ${channelId}: ${error.message}`);
    }
  }
}

async function postAnchor(client, poll, blocks) {
  const message = await client.chat.postMessage({
    channel: poll.channel_id,
    text: poll.question,
    blocks,
    unfurl_links: false,
    unfurl_media: false,
    metadata: { event_type: "anchor_poll", event_payload: { channel: poll.channel_id } },
  });
  await setAnchorPollMessageTs(poll.id, message.ts);
  await client.pins.add({ channel: poll.channel_id, timestamp: message.ts });
}

export async function saveAnchorMessage(botClient, userClient, userId, channelId, form) {
  const message = cleanText(form.get("message"), "Message", 3000);
  const previous = await prepareAnchor(botClient, channelId);
  const poll = await createAnchorMessage(channelId, {
    creator: userId,
    question: message,
    content: null,
  });
  await closePrevious(botClient, userClient, channelId, previous);
  await postAnchor(botClient, poll, buildAnchorMessageBlocks(poll));
  await logAdmin(botClient, {
    action: previous ? "replaced the anchor with a message" : "created an anchor message",
    adminUser: userId,
    channel: channelId,
    detail: message,
  });
}

export async function saveAnchorPoll(botClient, userClient, userId, channelId, form) {
  const question = cleanText(form.get("question"), "Question", 250);
  const choices = pollChoices(form.get("choices"));
  const addChoiceSetting = String(form.get("addChoiceSetting") || "no_one");
  if (!["no_one", "creator", "anyone"].includes(addChoiceSetting)) {
    throw new Error("Choose who can add poll options.");
  }

  const previous = await prepareAnchor(botClient, channelId);
  const poll = await createAnchorPoll(channelId, {
    creator: userId,
    question,
    choices,
    anonymous: form.has("anonymous"),
    multiSelect: form.has("multiSelect"),
    addChoiceSetting,
  });
  await closePrevious(botClient, userClient, channelId, previous);
  await postAnchor(
    botClient,
    poll,
    await buildAnchorPollBlocks(userClient, poll, poll.choices, []),
  );
  await logAdmin(botClient, {
    action: previous ? "replaced the anchor poll" : "created an anchor poll",
    adminUser: userId,
    channel: channelId,
    detail: question,
  });
}

export async function saveAnchorNps(botClient, userClient, userId, channelId, form) {
  const question = cleanText(form.get("question"), "Question", 250);
  const days = Number(form.get("days"));
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    throw new Error("Survey length must be between 1 and 365 days.");
  }

  const previous = await prepareAnchor(botClient, channelId);
  const poll = await createAnchorNpsSurvey(channelId, { creator: userId, question, days });
  await closePrevious(botClient, userClient, channelId, previous);
  await postAnchor(botClient, poll, buildAnchorNpsBlocks(poll, []));
  try {
    await syncNpsSurvey(poll, botClient);
  } catch (error) {
    logger.warn(`dashboard NPS Airtable sync failed in ${channelId}: ${error.message}`);
  }
  await logAdmin(botClient, {
    action: previous ? "replaced the anchor with an NPS survey" : "created an anchor NPS survey",
    adminUser: userId,
    channel: channelId,
    detail: `${question} (${days} days)`,
  });
}

export async function toggleAnchor(botClient, userId, channelId, enabled) {
  const anchor = await getAnchorPoll(channelId);
  if (!anchor) throw new Error("This channel does not have an anchor yet.");
  await setAnchorPollEnabled(channelId, enabled);

  if (anchor.type === "message" && anchor.message_ts) {
    try {
      if (enabled) {
        await botClient.pins.add({ channel: channelId, timestamp: anchor.message_ts });
      } else {
        await botClient.pins.remove({ channel: channelId, timestamp: anchor.message_ts });
      }
    } catch (error) {
      logger.warn(`dashboard anchor pin toggle failed in ${channelId}: ${error.message}`);
    }
  }
  if (anchor.type === "nps") {
    try {
      await syncNpsSurvey(await getAnchorPollById(anchor.id), botClient);
    } catch (error) {
      logger.warn(`dashboard NPS toggle sync failed in ${channelId}: ${error.message}`);
    }
  }
  await logAdmin(botClient, {
    action: `${enabled ? "enabled" : "disabled"} the anchor`,
    adminUser: userId,
    channel: channelId,
  });
}

export async function removeAnchor(botClient, userId, channelId) {
  const anchor = await getAnchorPoll(channelId);
  if (!anchor) throw new Error("This channel does not have an anchor yet.");
  await deleteAnchor(botClient, anchor, userId, logger);
}

export async function saveWelcome(botClient, userId, channelId, form) {
  const message = cleanText(form.get("message"), "Welcome message", 3000);
  const mode = String(form.get("mode"));
  if (!["ephemeral", "dm"].includes(mode)) throw new Error("Choose a delivery method.");
  await setwelcome(channelId, message, mode, userId);
  try {
    await botClient.conversations.join({ channel: channelId });
  } catch (error) {
    logger.warn(`dashboard welcome join failed in ${channelId}: ${error.message}`);
  }
  await logAdmin(botClient, {
    action: `set ${mode} welcome message`,
    adminUser: userId,
    channel: channelId,
    detail: message,
  });
}

export async function removeWelcome(botClient, userId, channelId) {
  if (!(await getwelcome(channelId))) throw new Error("This channel has no welcome message.");
  await removewelcome(channelId);
  await logAdmin(botClient, {
    action: "removed welcome message",
    adminUser: userId,
    channel: channelId,
  });
}

function embedTarget(rawUrl, type) {
  let url;
  try {
    url = new URL(String(rawUrl));
  } catch {
    throw new Error("Enter a complete URL, including https://.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Enter a public http or https URL.");
  }
  if (type === "domain") {
    const domain = parse(url.hostname).domain;
    if (!domain) throw new Error("That URL does not have a blockable domain.");
    return domain;
  }
  if (type === "host") return url.host.toLowerCase();
  if (type === "path") {
    const path = url.pathname.split("/").filter(Boolean).join("/");
    if (!path) throw new Error("A path rule needs a URL with a path.");
    return `${url.host.toLowerCase()}/${path}`;
  }
  throw new Error("Choose a rule scope.");
}

export async function saveEmbedRule(userId, channelId, form) {
  const type = String(form.get("type"));
  const target = embedTarget(form.get("url"), type);
  await addEmbedBlock(channelId, type, target, userId);
}

export async function deleteEmbedRule(channelId, form) {
  const type = String(form.get("type"));
  const target = String(form.get("target") || "");
  if (!["domain", "host", "path"].includes(type) || !target) throw new Error("Invalid rule.");
  await removeEmbedBlock(channelId, type, target);
}
