const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class RateLimiter {
  constructor(baseDelay = 1000, maxRetries = 5) {
    this.baseDelay = baseDelay;
    this.maxRetries = maxRetries;
    this.queue = [];
    this.processing = false;
  }

  async exec(fn, retries = 0) {
    try {
      return await fn();
    } catch (error) {
      if (error.data?.error === "ratelimited" || error.message?.includes("rate limit")) {
        const retryAfterMs = error.data?.retry_after
          ? error.data.retry_after * 1000
          : Math.pow(2, retries) * this.baseDelay;

        if (retries < this.maxRetries) {
          await sleep(retryAfterMs);
          return this.exec(fn, retries + 1);
        }
      }
      throw error;
    }
  }

  async deleteBatch(client, logger, channel, messages, batchSize = 5, delay = 2000) {
    const batches = [];
    for (let i = 0; i < messages.length; i += batchSize) {
      batches.push(messages.slice(i, i + batchSize));
    }

    let dc = 0;
    let ec = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      logger.info(`Processing batch ${i + 1}/${batches.length} (${batch.length} messages)`);

      for (const message of batch) {
        try {
          await this.exec(async () => {
            await client.chat.delete({
              channel: channel,
              ts: message.ts,
            });
          });
          dc++;
        } catch (error) {
          ec++;
          if (error.data?.error === "message_not_found") {
            logger.info(`Message ${message.ts} already deleted`);
          } else {
            logger.error(`Error deleting ${message.ts}: ${error.message}`);
          }
        }
      }

      if (i < batches.length - 1) {
        logger.info(`Pausing for ${delay}ms before next batch`);
        await sleep(delay);
      }
    }

    logger.info(`Deletion complete: ${dc} deleted, ${ec} errors`);
    return { dc, ec };
  }
}
