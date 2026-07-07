import { RateLimiter } from "./ratelimiter.js";
import { listMoveOptOuts, listChannelBans } from "./db.js";

const rateLimiter = new RateLimiter(1000, 5);

const INVITE_BATCH = 100;

let cachedBotUserId = null;
let cachedUserTokenId = null;

async function getBotUserId(botClient) {
  if (!cachedBotUserId) {
    const auth = await botClient.auth.test();
    cachedBotUserId = auth.user_id;
  }
  return cachedBotUserId;
}

async function getUserTokenId(userClient) {
  if (!cachedUserTokenId) {
    const auth = await userClient.auth.test();
    cachedUserTokenId = auth.user_id;
  }
  return cachedUserTokenId;
}

async function ensureBotPresent(botClient, channel, logger) {
  try {
    await rateLimiter.exec(() => botClient.conversations.join({ channel }));
    return true;
  } catch (error) {
    const err = error.data?.error;
    if (err === "already_in_channel") return true;
    if (err !== "method_not_supported_for_channel_type") {
      logger.info(`move: bot could not join ${channel}: ${err ?? error.message}`);
    }
    return false;
  }
}

async function ensureUserTokenPresent(botClient, userClient, channel, logger) {
  const present = await ensureBotPresent(botClient, channel, logger);
  if (!present) return false;
  try {
    const userId = await getUserTokenId(userClient);
    await rateLimiter.exec(() => botClient.conversations.invite({ channel, users: userId }));
    return true;
  } catch (error) {
    const err = error.data?.error;
    if (err === "already_in_channel") return true;
    logger.info(`move: bot could not add user token to ${channel}: ${err ?? error.message}`);
    return false;
  }
}

async function fetchMembers(botClient, channel) {
  const members = [];
  let cursor;
  do {
    const res = await rateLimiter.exec(() =>
      botClient.conversations.members({ channel, cursor, limit: 200 }),
    );
    members.push(...(res.members ?? []));
    cursor = res.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return members;
}

export async function planMove(botClient, logger, { source, dest, exclude = [] }) {
  await Promise.all([
    ensureBotPresent(botClient, source, logger),
    ensureBotPresent(botClient, dest, logger),
  ]);

  const [sourceMembers, destMembers, selfId] = await Promise.all([
    fetchMembers(botClient, source),
    fetchMembers(botClient, dest),
    getBotUserId(botClient),
  ]);

  const destSet = new Set(destMembers);
  const excludeSet = new Set(exclude);
  const banned = new Set(listChannelBans(dest).map((b) => b.user_id));
  const optedOut = new Set(listMoveOptOuts());

  const toInvite = [];
  const alreadyIn = [];
  const skipped = { excluded: [], banned: [], optedOut: [], self: [] };

  for (const user of sourceMembers) {
    if (user === selfId) skipped.self.push(user);
    else if (excludeSet.has(user)) skipped.excluded.push(user);
    else if (banned.has(user)) skipped.banned.push(user);
    else if (optedOut.has(user)) skipped.optedOut.push(user);
    else if (destSet.has(user)) alreadyIn.push(user);
    else toInvite.push(user);
  }

  return { sourceCount: sourceMembers.length, toInvite, alreadyIn, skipped };
}

async function inviteBatch(userClient, logger, dest, users) {
  const invited = [];
  const failed = [];
  for (let i = 0; i < users.length; i += INVITE_BATCH) {
    const batch = users.slice(i, i + INVITE_BATCH);
    try {
      await rateLimiter.exec(() =>
        userClient.conversations.invite({ channel: dest, users: batch.join(","), force: true }),
      );
      invited.push(...batch);
    } catch (error) {
      failed.push(...batch);
      logger.error(`move: invite batch to ${dest} failed: ${error.data?.error ?? error.message}`);
    }
  }
  return { invited, failed };
}

async function kickUsers(userClient, logger, source, users) {
  const kicked = [];
  const kickFailed = [];
  for (const user of users) {
    try {
      await rateLimiter.exec(() => userClient.conversations.kick({ channel: source, user }));
      kicked.push(user);
    } catch (error) {
      if (error.data?.error === "not_in_channel") {
        kicked.push(user);
      } else {
        kickFailed.push(user);
        logger.error(
          `move: failed to kick ${user} from ${source}: ${error.data?.error ?? error.message}`,
        );
      }
    }
  }
  return { kicked, kickFailed };
}

export async function executeMove(
  botClient,
  userClient,
  logger,
  { source, dest, exclude = [], kick = false },
) {
  const plan = await planMove(botClient, logger, { source, dest, exclude });

  await ensureUserTokenPresent(botClient, userClient, dest, logger);

  const { invited, failed } = await inviteBatch(userClient, logger, dest, plan.toInvite);

  let kicked = [];
  let kickFailed = [];
  if (kick) {
    await ensureUserTokenPresent(botClient, userClient, source, logger);
    const result = await kickUsers(userClient, logger, source, [...invited, ...plan.alreadyIn]);
    kicked = result.kicked;
    kickFailed = result.kickFailed;
  }

  return {
    source,
    dest,
    kick,
    sourceCount: plan.sourceCount,
    invited,
    failed,
    alreadyIn: plan.alreadyIn,
    skipped: plan.skipped,
    kicked,
    kickFailed,
  };
}
