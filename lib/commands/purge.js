import { canManage } from "../perms.js";
import { RateLimiter } from "../ratelimiter.js";
import { logPurge, notifyPurgeDeletion } from "../logger.js";
import { publicLogPurge } from "../public-logger.js";
import { purge as purgeThread } from "../purge.js";

const rateLimiter = new RateLimiter(1000, 5);

const MAX_PURGE = 100;
const HISTORY_PAGE_SIZE = 200;
const MAX_HISTORY_PAGES = 5;

const TRUE_VALUES = new Set(["true", "yes", "y", "1"]);
const FALSE_VALUES = new Set(["false", "no", "n", "0"]);

const SKIP_SUBTYPES = new Set([
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
  "message_changed",
]);

const eph = (text) => ({ response_type: "ephemeral", text });
const usage = () =>
  eph(
    `Usage: \`/pro purge <count> [true|false]\` — count is 1-${MAX_PURGE} top-level messages. Add \`true\` to also delete each matched message's thread replies (default \`false\`, replies are left alone).`,
  );

function isThreaded(message) {
  return Boolean(message.reply_count) || (message.thread_ts && message.thread_ts === message.ts);
}

function isPurgeable(message) {
  return Boolean(message?.ts) && !SKIP_SUBTYPES.has(message.subtype);
}

function inRange(ts, range) {
  if (!range) return false;
  const t = parseFloat(ts);
  return t >= range.start && t <= range.end;
}

// Message permalinks look like .../archives/C123/p1690000000123456 — the 16-digit
// suffix is the ts with the decimal point removed (10s + 6 micros).
function parseTimestampToken(token) {
  const bare = token.match(/^\d{10}\.\d{6}$/);
  if (bare) return token;

  const link = token.match(/\/p(\d{10})(\d{6})(?:[/?].*)?$/);
  if (link) return `${link[1]}.${link[2]}`;

  return null;
}

function parseExcludedTimestamps(raw) {
  const excluded = new Set();
  if (!raw) return excluded;

  for (const line of raw.split(/\r?\n/)) {
    const token = line.trim();
    if (!token) continue;
    const ts = parseTimestampToken(token);
    if (ts) excluded.add(ts);
  }

  return excluded;
}

// Exactly two links/timestamps define an inclusive range to keep. Anything else
// (one link, three links, unparseable text) is a mistake we surface rather than
// guess at — silently keeping the wrong span would be worse than refusing.
function parseRange(raw) {
  if (!raw || !raw.trim()) return { range: null, error: null };

  const parsed = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseTimestampToken)
    .filter(Boolean);

  if (parsed.length !== 2) {
    return {
      range: null,
      error: `"Keep everything between two messages" needs exactly two valid message links or timestamps (found ${parsed.length}).`,
    };
  }

  const [start, end] = parsed.map(parseFloat).sort((a, b) => a - b);
  return { range: { start, end }, error: null };
}

async function hasProtectedReply(client, channel, threadTs, { excluded, range }) {
  if (!excluded.size && !range) return false;

  let cursor;
  do {
    const result = await client.conversations.replies({
      channel,
      ts: threadTs,
      limit: HISTORY_PAGE_SIZE,
      cursor,
    });
    if (
      (result.messages || []).some(
        (message) => excluded.has(message.ts) || inRange(message.ts, range),
      )
    ) {
      return true;
    }
    cursor = result.response_metadata?.next_cursor;
  } while (cursor);

  return false;
}

// conversations.history only returns top-level channel messages; thread replies
// are excluded automatically unless they were broadcast to the channel.
// Individually-excluded messages never count toward `count` — history keeps
// paging until enough deletable messages are found (or pages run out). Messages
// kept by the range only consume a `count` slot when countRangeInTotal is set;
// otherwise they're skipped as if they were never there, same as an exclusion.
async function collectMessages(
  client,
  channel,
  count,
  { excluded, range, countRangeInTotal, includeThreads },
) {
  const toDelete = [];
  let budgetUsed = 0;
  let cursor;

  for (let page = 0; page < MAX_HISTORY_PAGES && budgetUsed < count; page++) {
    const result = await client.conversations.history({
      channel,
      limit: HISTORY_PAGE_SIZE,
      cursor,
    });

    for (const message of result.messages || []) {
      if (budgetUsed >= count) break;
      if (!isPurgeable(message)) continue;
      if (excluded.has(message.ts)) continue;

      if (inRange(message.ts, range)) {
        if (countRangeInTotal) budgetUsed++;
        continue;
      }

      // Keep the whole thread intact if cascading would remove a protected reply.
      // Skipped threads don't consume the budget, so continue looking further back.
      if (
        includeThreads &&
        isThreaded(message) &&
        (await hasProtectedReply(client, channel, message.ts, { excluded, range }))
      ) {
        continue;
      }

      toDelete.push(message);
      budgetUsed++;
    }

    cursor = result.response_metadata?.next_cursor;
    if (!cursor) break;
  }

  return toDelete;
}

function purgeModal(channelId, count, includeThreads) {
  const threadNote = includeThreads
    ? "Thread replies on any matched message will *also* be permanently deleted. Threads containing a kept reply are skipped entirely and don't count toward the total."
    : "Thread replies are left alone — a matched message with replies still gets deleted, its thread left dangling underneath.";

  return {
    type: "modal",
    callback_id: "purge_confirm",
    private_metadata: JSON.stringify({ channel: channelId, count, includeThreads }),
    title: { type: "plain_text", text: "Confirm purge" },
    submit: { type: "plain_text", text: "Delete" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Are you sure?* This will permanently delete up to ${count} of the most recent messages in <#${channelId}>. ${threadNote} This cannot be undone.`,
        },
      },
      {
        type: "input",
        block_id: "reason",
        optional: false,
        label: { type: "plain_text", text: "Reason" },
        element: {
          type: "plain_text_input",
          action_id: "reason_input",
          multiline: true,
          placeholder: { type: "plain_text", text: "Why are you purging these messages?" },
        },
        hint: { type: "plain_text", text: "This will be recorded in the audit log." },
      },
      {
        type: "input",
        block_id: "exclude",
        optional: true,
        label: { type: "plain_text", text: "Keep these messages" },
        element: {
          type: "plain_text_input",
          action_id: "exclude_input",
          multiline: true,
          placeholder: { type: "plain_text", text: "Paste message links, one per line" },
        },
        hint: {
          type: "plain_text",
          text: "Optional. Right-click a message → Copy link. These are skipped entirely and don't count toward the total.",
        },
      },
      {
        type: "input",
        block_id: "range",
        optional: true,
        label: { type: "plain_text", text: "Keep everything between two messages" },
        element: {
          type: "plain_text_input",
          action_id: "range_input",
          multiline: true,
          placeholder: { type: "plain_text", text: "Paste exactly two message links" },
        },
        hint: {
          type: "plain_text",
          text: "Optional. Both messages and everything between them (in either order) are kept.",
        },
      },
      {
        type: "input",
        block_id: "range_count",
        optional: true,
        label: { type: "plain_text", text: "Kept range and the total" },
        element: {
          type: "checkboxes",
          action_id: "range_count_checkbox",
          options: [
            {
              text: { type: "plain_text", text: "Count the kept range toward <count>" },
              description: {
                type: "plain_text",
                text: "Off (default): purge digs further back to still delete <count> messages.",
              },
              value: "count",
            },
          ],
        },
      },
    ],
  };
}

async function handleView({ view, body, client, context, logger }) {
  const { channel, count, includeThreads } = JSON.parse(view.private_metadata);
  const userId = body.user.id;

  if (!(await canManage(context.userClient, userId, channel))) {
    logger.warn(`${userId} denied for purge_confirm`);
    return;
  }

  const reason = view.state?.values?.reason?.reason_input?.value?.trim() || "";
  const excludeRaw = view.state?.values?.exclude?.exclude_input?.value || "";
  const rangeRaw = view.state?.values?.range?.range_input?.value || "";
  const countRangeInTotal = (
    view.state?.values?.range_count?.range_count_checkbox?.selected_options || []
  ).some((o) => o.value === "count");

  const excluded = parseExcludedTimestamps(excludeRaw);
  const { range, error: rangeError } = parseRange(rangeRaw);

  if (rangeError) {
    await client.chat
      .postEphemeral({
        channel,
        user: userId,
        text: `:red-x: ${rangeError} Purge cancelled — nothing was deleted.`,
      })
      .catch((error) => logger.warn(`purge range error notice failed: ${error.message}`));
    return;
  }

  const messages = await collectMessages(context.userClient, channel, count, {
    excluded,
    range,
    countRangeInTotal,
    includeThreads,
  });
  if (!messages.length) {
    await client.chat
      .postEphemeral({ channel, user: userId, text: "No messages found to purge." })
      .catch((error) => logger.warn(`purge empty notice failed: ${error.message}`));
    return;
  }

  // With includeThreads, messages with replies get destroyed via the same
  // full-thread purge used by the Destroy Thread shortcut (parent + all
  // replies, with its own retry loop and logging). Everything else — and
  // every threaded message when includeThreads is off — is a plain batch
  // delete of just the top-level message.
  const toCascade = includeThreads ? messages.filter(isThreaded) : [];
  const toBatchDelete = includeThreads ? messages.filter((m) => !isThreaded(m)) : messages;

  let dc = 0;
  let ec = 0;

  if (toBatchDelete.length) {
    await Promise.all([
      logPurge(client, logger, { channel, messages: toBatchDelete, deletedBy: userId, reason }),
      publicLogPurge(client, { channel, count: toBatchDelete.length, deletedBy: userId }),
    ]);

    const result = await rateLimiter.deleteBatch(
      context.userClient,
      logger,
      channel,
      toBatchDelete,
      5,
      2000,
    );
    dc += result.dc;
    ec += result.ec;

    await notifyPurgeDeletion(client, {
      channel,
      messages: toBatchDelete,
      deletedBy: userId,
      reason,
    }).catch((error) => logger.warn(`purge notify failed: ${error.message}`));
  }

  for (const message of toCascade) {
    try {
      await purgeThread(context.userClient, logger, channel, message.ts, userId, {
        reason,
        notificationClient: client,
      });
      dc++;
    } catch (error) {
      ec++;
      logger.error(`purge: failed to destroy thread ${message.ts} in ${channel}: ${error.message}`);
    }
  }

  await client.chat
    .postEphemeral({
      channel,
      user: userId,
      text: `:okay-1: Purged ${dc} top-level message${dc === 1 ? "" : "s"}${toCascade.length ? `, including full deletion of ${toCascade.length} thread${toCascade.length === 1 ? "" : "s"}` : ""}${ec ? `, ${ec} failed` : ""}.`,
    })
    .catch((error) => logger.warn(`purge confirmation failed: ${error.message}`));

  logger.info(
    `purge done channel=${channel} count=${dc} errors=${ec} threads=${toCascade.length} by=${userId}`,
  );
}

export const views = [{ callbackId: "purge_confirm", handleView }];

export default {
  name: "purge",
  description: "Bulk-delete recent top-level messages in this channel",
  async execute({ command, args, respond, client, context }) {
    const channelId = command.channel_id;
    const userId = command.user_id;

    if (!(await canManage(context.userClient, userId, channelId))) {
      return respond(eph(":loll: You do not have permission to purge this channel."));
    }

    const count = Number(args[0]);
    if (!Number.isInteger(count) || count < 1 || count > MAX_PURGE) {
      return respond(usage());
    }

    let includeThreads = false;
    if (args[1] !== undefined) {
      const flag = args[1].toLowerCase();
      if (TRUE_VALUES.has(flag)) includeThreads = true;
      else if (FALSE_VALUES.has(flag)) includeThreads = false;
      else return respond(usage());
    }

    await client.views.open({
      trigger_id: command.trigger_id,
      view: purgeModal(channelId, count, includeThreads),
    });
  },
};
