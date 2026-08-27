import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const epoch = sql`EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::bigint`;

export const globalAdmins = pgTable("global_admins", {
  userId: text("user_id").primaryKey(),
  addedBy: text("added_by").notNull(),
  addedAt: bigint("added_at", { mode: "number" }).notNull().default(epoch),
});

export const appointedManagers = pgTable(
  "appointed_managers",
  {
    userId: text("user_id").notNull(),
    channelId: text("channel_id").notNull(),
    addedBy: text("added_by").notNull(),
    addedAt: bigint("added_at", { mode: "number" }).notNull().default(epoch),
    role: text("role").notNull().default("moderator"),
  },
  (table) => [
    primaryKey({ name: "appointed_managers_pkey", columns: [table.userId, table.channelId] }),
  ],
);

export const channelBans = pgTable(
  "channel_bans",
  {
    userId: text("user_id").notNull(),
    channelId: text("channel_id").notNull(),
    bannedBy: text("banned_by").notNull(),
    reason: text(),
    expires: bigint({ mode: "number" }),
  },
  (table) => [primaryKey({ name: "channel_bans_pkey", columns: [table.userId, table.channelId] })],
);

export const joinMessages = pgTable("join_messages", {
  channelId: text("channel_id").primaryKey(),
  message: text().notNull(),
  mode: text().notNull().default("ephemeral"),
  setBy: text("set_by").notNull(),
  setAt: bigint("set_at", { mode: "number" }).notNull().default(epoch),
});

export const channelPostingGates = pgTable(
  "channel_posting_gates",
  {
    channelId: text("channel_id").primaryKey(),
    mode: text().notNull(),
    prompt: text().notNull(),
    phrase: text(),
    generation: text().notNull(),
    setBy: text("set_by").notNull(),
    enabled: integer().notNull().default(1),
    kickOnJoin: integer("kick_on_join").notNull().default(0),
    setAt: bigint("set_at", { mode: "number" }).notNull().default(epoch),
  },
  (table) => [
    check("channel_posting_gates_mode_check", sql`${table.mode} IN ('button', 'phrase')`),
    check(
      "channel_posting_gates_phrase_check",
      sql`(${table.mode} = 'button' AND ${table.phrase} IS NULL) OR (${table.mode} = 'phrase' AND ${table.phrase} IS NOT NULL)`,
    ),
  ],
);

export const channelPostingGateAcceptances = pgTable(
  "channel_posting_gate_acceptances",
  {
    channelId: text("channel_id").notNull(),
    userId: text("user_id").notNull(),
    acceptedAt: bigint("accepted_at", { mode: "number" }).notNull().default(epoch),
  },
  (table) => [
    primaryKey({
      name: "channel_posting_gate_acceptances_pkey",
      columns: [table.channelId, table.userId],
    }),
    foreignKey({
      name: "channel_posting_gate_acceptances_channel_id_fkey",
      columns: [table.channelId],
      foreignColumns: [channelPostingGates.channelId],
    }).onDelete("cascade"),
  ],
);

export const embedBlocks = pgTable(
  "embed_blocks",
  {
    channelId: text("channel_id").notNull(),
    type: text().notNull(),
    target: text().notNull(),
    blockedBy: text("blocked_by").notNull(),
    blockedAt: bigint("blocked_at", { mode: "number" }).notNull().default(epoch),
  },
  (table) => [
    primaryKey({
      name: "embed_blocks_pkey",
      columns: [table.channelId, table.type, table.target],
    }),
    check("embed_blocks_type_check", sql`${table.type} IN ('domain', 'host', 'path')`),
  ],
);

export const anchorPolls = pgTable(
  "anchor_polls",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    channelId: text("channel_id").notNull(),
    creatorUserId: text("creator_user_id").notNull(),
    type: text().notNull().default("poll"),
    question: text().notNull(),
    content: text(),
    anonymous: integer().notNull().default(0),
    multiSelect: integer("multi_select").notNull().default(0),
    addChoiceSetting: text("add_choice_setting").notNull().default("no_one"),
    enabled: integer().notNull().default(1),
    messageTs: text("message_ts"),
    closesAt: bigint("closes_at", { mode: "number" }),
    isCurrent: integer("is_current").notNull().default(1),
    createdAt: bigint("created_at", { mode: "number" }).notNull().default(epoch),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull().default(epoch),
  },
  (table) => [
    uniqueIndex("anchor_polls_channel_current")
      .on(table.channelId)
      .where(sql`${table.isCurrent} = 1`),
    index("anchor_polls_channel_history").on(table.channelId, table.createdAt),
  ],
);

export const anchorPollChoices = pgTable(
  "anchor_poll_choices",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    pollId: integer("poll_id").notNull(),
    creatorUserId: text("creator_user_id").notNull(),
    text: text().notNull(),
    position: integer().notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull().default(epoch),
  },
  (table) => [
    foreignKey({
      name: "anchor_poll_choices_poll_id_fkey",
      columns: [table.pollId],
      foreignColumns: [anchorPolls.id],
    }).onDelete("cascade"),
    uniqueIndex("anchor_poll_choices_position").on(table.pollId, table.position),
  ],
);

export const anchorPollVotes = pgTable(
  "anchor_poll_votes",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    pollId: integer("poll_id").notNull(),
    choiceId: integer("choice_id").notNull(),
    userId: text("user_id").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull().default(epoch),
  },
  (table) => [
    foreignKey({
      name: "anchor_poll_votes_poll_id_fkey",
      columns: [table.pollId],
      foreignColumns: [anchorPolls.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "anchor_poll_votes_choice_id_fkey",
      columns: [table.choiceId],
      foreignColumns: [anchorPollChoices.id],
    }).onDelete("cascade"),
    index("anchor_poll_votes_poll").on(table.pollId),
    uniqueIndex("anchor_poll_votes_unique").on(table.pollId, table.choiceId, table.userId),
  ],
);

export const anchorNpsResponses = pgTable(
  "anchor_nps_responses",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    pollId: integer("poll_id").notNull(),
    userId: text("user_id").notNull(),
    score: integer(),
    comment: text(),
    createdAt: bigint("created_at", { mode: "number" }).notNull().default(epoch),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull().default(epoch),
  },
  (table) => [
    foreignKey({
      name: "anchor_nps_responses_poll_id_fkey",
      columns: [table.pollId],
      foreignColumns: [anchorPolls.id],
    }).onDelete("cascade"),
    uniqueIndex("anchor_nps_responses_poll_user").on(table.pollId, table.userId),
  ],
);

export const channelApiKeys = pgTable(
  "channel_api_keys",
  {
    id: integer().primaryKey().generatedByDefaultAsIdentity(),
    channelId: text("channel_id").notNull(),
    userId: text("user_id").notNull(),
    name: text().notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull().default(epoch),
    lastUsedAt: bigint("last_used_at", { mode: "number" }),
    revokedAt: bigint("revoked_at", { mode: "number" }),
  },
  (table) => [
    uniqueIndex("channel_api_keys_hash").on(table.keyHash),
    index("channel_api_keys_owner")
      .on(table.userId, table.channelId)
      .where(sql`${table.revokedAt} IS NULL`),
  ],
);
