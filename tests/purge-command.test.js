import { beforeEach, expect, mock, test } from "bun:test";

const cascade = mock(async () => {});
const deleteBatch = mock(async (_client, _logger, _channel, messages) => ({
  dc: messages.length,
  ec: 0,
}));
const noop = async () => {};

mock.module("../lib/perms.js", () => ({ canManage: async () => true }));
mock.module("../lib/ratelimiter.js", () => ({
  RateLimiter: class {
    deleteBatch = deleteBatch;
  },
}));
mock.module("../lib/logger.js", () => ({ logPurge: noop, notifyPurgeDeletion: noop }));
mock.module("../lib/public-logger.js", () => ({ publicLogPurge: noop }));
mock.module("../lib/purge.js", () => ({ purge: cascade }));

const { views } = await import("../lib/commands/purge.js");
const handleView = views[0].handleView;
const parent = { ts: "1690000000.000001", reply_count: 2 };
const reply = { ts: "1690000000.000002", thread_ts: parent.ts };
const older = { ts: "1689999999.000001" };

beforeEach(() => {
  cascade.mockClear();
  deleteBatch.mockClear();
});

async function submit({
  includeThreads = true,
  exclude = "",
  range = "",
  countRangeInTotal = false,
  historyPages = [{ messages: [parent, older] }],
  repliesPages = [{ messages: [parent, reply] }],
} = {}) {
  let historyPage = 0;
  let repliesPage = 0;
  const userClient = {
    conversations: {
      history: mock(async () => historyPages[historyPage++]),
      replies: mock(async () => repliesPages[repliesPage++]),
    },
  };
  const client = {
    conversations: {
      history: mock(async () => {
        throw new Error("Bot is not a channel member");
      }),
    },
    chat: { postEphemeral: mock(noop) },
  };
  await handleView({
    view: {
      private_metadata: JSON.stringify({ channel: "C123", count: 1, includeThreads }),
      state: {
        values: {
          reason: { reason_input: { value: "Test purge" } },
          exclude: { exclude_input: { value: exclude } },
          range: { range_input: { value: range } },
          range_count: {
            range_count_checkbox: {
              selected_options: countRangeInTotal ? [{ value: "count" }] : [],
            },
          },
        },
      },
    },
    body: { user: { id: "U123" } },
    client,
    context: { userClient },
    logger: { info() {}, warn() {}, error() {} },
  });
  return { client, userClient };
}

function expectOlderDeleted() {
  expect(cascade).not.toHaveBeenCalled();
  expect(deleteBatch).toHaveBeenCalledTimes(1);
  expect(deleteBatch.mock.calls[0][3]).toEqual([older]);
}

test("excluded reply protects its whole thread and does not consume the count", async () => {
  await submit({ exclude: "https://slack.com/archives/C123/p1690000000000002" });
  expectOlderDeleted();
});

test("kept range protects replies even when the parent is outside the range", async () => {
  await submit({ range: "1690000000.000002\n1690000000.000003" });
  expectOlderDeleted();
});

test("reply protection checks every replies page and continues across history pages", async () => {
  const { userClient } = await submit({
    exclude: reply.ts,
    historyPages: [
      { messages: [parent], response_metadata: { next_cursor: "older-history" } },
      { messages: [older] },
    ],
    repliesPages: [
      { messages: [parent], response_metadata: { next_cursor: "more-replies" } },
      { messages: [reply] },
    ],
  });
  expectOlderDeleted();
  expect(userClient.conversations.replies.mock.calls[1][0].cursor).toBe("more-replies");
  expect(userClient.conversations.history.mock.calls[1][0].cursor).toBe("older-history");
});

test("unprotected threads still cascade using the user client", async () => {
  const { userClient } = await submit({ exclude: "1690000001.000001" });
  expect(cascade).toHaveBeenCalledTimes(1);
  expect(cascade.mock.calls[0][0]).toBe(userClient);
  expect(cascade.mock.calls[0][3]).toBe(parent.ts);
  expect(deleteBatch).not.toHaveBeenCalled();
});

test("no protections avoids the extra replies scan and history uses the user token", async () => {
  const { client, userClient } = await submit();
  expect(userClient.conversations.history).toHaveBeenCalledTimes(1);
  expect(client.conversations.history).not.toHaveBeenCalled();
  expect(userClient.conversations.replies).not.toHaveBeenCalled();
  expect(cascade).toHaveBeenCalledTimes(1);
});

test("non-cascading purges do not skip parents of protected replies", async () => {
  const { userClient } = await submit({ includeThreads: false, exclude: reply.ts });
  expect(userClient.conversations.replies).not.toHaveBeenCalled();
  expect(cascade).not.toHaveBeenCalled();
  expect(deleteBatch.mock.calls[0][3]).toEqual([parent]);
});

test("counting a protected parent range still consumes the fixed window", async () => {
  await submit({
    range: `${parent.ts}\n${reply.ts}`,
    countRangeInTotal: true,
  });
  expect(cascade).not.toHaveBeenCalled();
  expect(deleteBatch).not.toHaveBeenCalled();
});

test("a failed replies scan aborts before deleting any messages", async () => {
  await expect(submit({ exclude: reply.ts, repliesPages: [] })).rejects.toThrow();
  expect(cascade).not.toHaveBeenCalled();
  expect(deleteBatch).not.toHaveBeenCalled();
});
