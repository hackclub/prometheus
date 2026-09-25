import { RateLimiter } from "./ratelimiter.js";
import { logThread, notifyThreadDeletion } from "./logger.js";
import { publicLogThread } from "./public-logger.js";

const rateLimiter = new RateLimiter(1000, 5);

export async function purge(
  client,
  logger,
  channel,
  threadTs,
  deletedBy,
  { api = false, notificationClient = client, reason = "" } = {},
) {
  const result = await client.conversations.replies({
    channel: channel,
    ts: threadTs,
  });

  let messages = result.messages || [];
  const deletedMessages = [...messages];

  logger.info(`Found ${messages.length} messages to delete`);

  await Promise.all([
    logThread(client, logger, {
      channel,
      threadTs,
      messages,
      deletedBy,
      reason,
      api,
    }),
    publicLogThread(client, {
      channel,
      messages,
      deletedBy,
      api,
    }),
  ]);

  await rateLimiter.deleteBatch(client, logger, channel, messages, 5, 2000);

  let remaining;
  do {
    let next;
    try {
      next = await client.conversations.replies({
        channel: channel,
        ts: threadTs,
      });
    } catch (error) {
      if (error.data?.error === "thread_not_found") {
        break;
      }
      throw error;
    }

    remaining = next.messages || [];

    if (remaining.length > 0) {
      deletedMessages.push(...remaining);
      logger.info(`Found ${remaining.length} remaining messages, deleting...`);
      await logThread(client, logger, {
        channel,
        threadTs,
        messages: remaining,
        deletedBy,
        reason,
        api,
      });
      await rateLimiter.deleteBatch(client, logger, channel, remaining, 5, 2000);
    }
  } while (remaining.length > 0);

  const uniqueMessages = [
    ...new Map(deletedMessages.map((message) => [message.ts, message])).values(),
  ];
  await notifyThreadDeletion(notificationClient, {
    channel,
    messages: uniqueMessages,
    deletedBy,
    reason,
  }).catch((error) => logger.warn(`destroy_thread notify failed: ${error.message}`));

  logger.info(`destroy_thread completed`);
}
