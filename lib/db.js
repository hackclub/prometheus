import { createDatabaseClient } from "./db/client.js";

const sql = createDatabaseClient();

const epoch = "EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::bigint";

const first = (rows) => rows[0];

export async function checkDatabaseConnection() {
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function isGlobalAdmin(userId) {
  return Boolean(first(await sql`SELECT 1 FROM global_admins WHERE user_id = ${userId}`));
}

export async function addGlobalAdmin(userId, addedBy) {
  await sql`
    INSERT INTO global_admins (user_id, added_by)
    VALUES (${userId}, ${addedBy})
    ON CONFLICT (user_id) DO NOTHING
  `;
}

export async function removeGlobalAdmin(userId) {
  await sql`DELETE FROM global_admins WHERE user_id = ${userId}`;
}

export async function listGlobalAdmins() {
  return sql`SELECT user_id, added_by, added_at FROM global_admins`;
}

export async function hasChannelRole(userId, channelId) {
  return Boolean(
    first(
      await sql`
        SELECT 1 FROM appointed_managers
        WHERE user_id = ${userId} AND channel_id = ${channelId}
      `,
    ),
  );
}

export async function isAppointedManager(userId, channelId) {
  return Boolean(
    first(
      await sql`
        SELECT 1 FROM appointed_managers
        WHERE user_id = ${userId} AND channel_id = ${channelId} AND role = 'manager'
      `,
    ),
  );
}

export async function addAppointedManager(userId, channelId, addedBy, role = "moderator") {
  await sql`
    INSERT INTO appointed_managers (user_id, channel_id, added_by, role)
    VALUES (${userId}, ${channelId}, ${addedBy}, ${role})
    ON CONFLICT (user_id, channel_id) DO UPDATE
      SET added_by = EXCLUDED.added_by, role = EXCLUDED.role, added_at = ${sql.unsafe(epoch)}
  `;
}

export async function removeAppointedManager(userId, channelId) {
  await sql`
    DELETE FROM appointed_managers WHERE user_id = ${userId} AND channel_id = ${channelId}
  `;
}

export async function listAppointedManagers(channelId) {
  return sql`
    SELECT user_id, role, added_by, added_at FROM appointed_managers
    WHERE channel_id = ${channelId}
  `;
}

export async function listAllAppointedManagers() {
  return sql`
    SELECT user_id, channel_id, role, added_by, added_at
    FROM appointed_managers ORDER BY channel_id
  `;
}

export async function listUserAppointedManagers(userId) {
  return sql`
    SELECT channel_id, role, added_by, added_at
    FROM appointed_managers
    WHERE user_id = ${userId}
    ORDER BY channel_id
  `;
}

export async function hasAppointedManager(channelId) {
  return Boolean(
    first(await sql`SELECT 1 FROM appointed_managers WHERE channel_id = ${channelId}`),
  );
}

export async function getChannelBan(userId, channelId) {
  return first(
    await sql`
      SELECT user_id, channel_id, banned_by, reason, expires FROM channel_bans
      WHERE user_id = ${userId} AND channel_id = ${channelId}
    `,
  );
}

export async function setChannelBan(userId, channelId, bannedBy, reason, expires) {
  await sql`
    INSERT INTO channel_bans (user_id, channel_id, banned_by, reason, expires)
    VALUES (${userId}, ${channelId}, ${bannedBy}, ${reason}, ${expires ?? null})
    ON CONFLICT (user_id, channel_id) DO UPDATE SET
      banned_by = EXCLUDED.banned_by,
      reason = EXCLUDED.reason,
      expires = EXCLUDED.expires
  `;
}

export async function removeChannelBan(userId, channelId) {
  await sql`DELETE FROM channel_bans WHERE user_id = ${userId} AND channel_id = ${channelId}`;
}

export async function listChannelBans(channelId) {
  return sql`
    SELECT user_id, channel_id, banned_by, reason, expires FROM channel_bans
    WHERE channel_id = ${channelId}
  `;
}

export async function listUserBans(userId) {
  return sql`
    SELECT user_id, channel_id, banned_by, reason, expires FROM channel_bans
    WHERE user_id = ${userId}
  `;
}

export async function listAllChannelBans() {
  return sql`
    SELECT user_id, channel_id, banned_by, reason, expires
    FROM channel_bans ORDER BY channel_id
  `;
}

export async function getwelcome(channelId) {
  return first(
    await sql`
      SELECT channel_id, message, mode, set_by, set_at FROM join_messages
      WHERE channel_id = ${channelId}
    `,
  );
}

export async function setwelcome(channelId, message, mode, setBy) {
  await sql`
    INSERT INTO join_messages (channel_id, message, mode, set_by)
    VALUES (${channelId}, ${message}, ${mode}, ${setBy})
    ON CONFLICT (channel_id) DO UPDATE SET
      message = EXCLUDED.message,
      mode = EXCLUDED.mode,
      set_by = EXCLUDED.set_by,
      set_at = ${sql.unsafe(epoch)}
  `;
}

export async function removewelcome(channelId) {
  await sql`DELETE FROM join_messages WHERE channel_id = ${channelId}`;
}

export async function addEmbedBlock(channelId, type, target, blockedBy) {
  await sql`
    INSERT INTO embed_blocks (channel_id, type, target, blocked_by)
    VALUES (${channelId}, ${type}, ${target}, ${blockedBy})
    ON CONFLICT (channel_id, type, target) DO UPDATE SET
      blocked_by = EXCLUDED.blocked_by,
      blocked_at = ${sql.unsafe(epoch)}
  `;
}

export async function removeEmbedBlock(channelId, type, target) {
  await sql`
    DELETE FROM embed_blocks
    WHERE channel_id = ${channelId} AND type = ${type} AND target = ${target}
  `;
}

export async function listEmbedBlocks(channelId) {
  return sql`
    SELECT channel_id, type, target, blocked_by, blocked_at FROM embed_blocks
    WHERE channel_id = ${channelId}
  `;
}

export async function listAllEmbedBlocks() {
  return sql`
    SELECT channel_id, type, target, blocked_by, blocked_at
    FROM embed_blocks ORDER BY channel_id, type, target
  `;
}

export async function getAnchorPoll(channelId) {
  return first(
    await sql`SELECT * FROM anchor_polls WHERE channel_id = ${channelId} AND is_current = 1`,
  );
}

export async function getAnchorPollById(id) {
  return first(await sql`SELECT * FROM anchor_polls WHERE id = ${id}`);
}

export async function getAnchorPollChoices(pollId) {
  return sql`SELECT * FROM anchor_poll_choices WHERE poll_id = ${pollId} ORDER BY position ASC`;
}

export async function getAnchorPollVotes(pollId) {
  return sql`SELECT * FROM anchor_poll_votes WHERE poll_id = ${pollId}`;
}

export async function listAnchorPolls(channelId, limit = 5) {
  return sql`
    SELECT * FROM anchor_polls
    WHERE channel_id = ${channelId}
    ORDER BY created_at DESC LIMIT ${limit}
  `;
}

async function lockChannel(tx, channelId) {
  await tx`SELECT pg_advisory_xact_lock(hashtextextended(${channelId}, 0))`;
}

export async function createAnchorPoll(
  channelId,
  { creator, question, choices, anonymous, multiSelect, addChoiceSetting },
) {
  return sql.begin(async (tx) => {
    await lockChannel(tx, channelId);
    await tx`
      UPDATE anchor_polls SET is_current = 0, updated_at = ${sql.unsafe(epoch)}
      WHERE channel_id = ${channelId} AND is_current = 1
    `;
    const poll = first(
      await tx`
        INSERT INTO anchor_polls
          (channel_id, creator_user_id, question, anonymous, multi_select, add_choice_setting)
        VALUES
          (${channelId}, ${creator}, ${question}, ${anonymous ? 1 : 0}, ${multiSelect ? 1 : 0}, ${addChoiceSetting})
        RETURNING *
      `,
    );
    const insertedChoices = [];
    for (const [index, text] of choices.entries()) {
      insertedChoices.push(
        first(
          await tx`
            INSERT INTO anchor_poll_choices (poll_id, creator_user_id, text, position)
            VALUES (${poll.id}, ${creator}, ${text}, ${index + 1})
            RETURNING *
          `,
        ),
      );
    }
    return { ...poll, choices: insertedChoices };
  });
}

export async function addAnchorPollChoice(pollId, creator, text) {
  return sql.begin(async (tx) => {
    await tx`SELECT id FROM anchor_polls WHERE id = ${pollId} FOR UPDATE`;
    return first(
      await tx`
        INSERT INTO anchor_poll_choices (poll_id, creator_user_id, text, position)
        SELECT ${pollId}, ${creator}, ${text}, COALESCE(MAX(position), 0) + 1
        FROM anchor_poll_choices WHERE poll_id = ${pollId}
        RETURNING *
      `,
    );
  });
}

export async function updateAnchorPollQuestion(id, question) {
  return first(
    await sql`
      UPDATE anchor_polls SET question = ${question}, updated_at = ${sql.unsafe(epoch)}
      WHERE id = ${id} RETURNING *
    `,
  );
}

export async function setAnchorPollMessageTs(pollId, ts) {
  await sql`UPDATE anchor_polls SET message_ts = ${ts} WHERE id = ${pollId}`;
}

export async function setAnchorPollEnabled(channelId, enabled) {
  await sql`
    UPDATE anchor_polls SET enabled = ${enabled ? 1 : 0}, updated_at = ${sql.unsafe(epoch)}
    WHERE channel_id = ${channelId} AND is_current = 1
  `;
}

export async function deleteAnchorPoll(pollId) {
  await sql`
    UPDATE anchor_polls SET is_current = 0, updated_at = ${sql.unsafe(epoch)}
    WHERE id = ${pollId} AND is_current = 1
  `;
}

export async function toggleAnchorPollVote(pollId, choiceId, userId, single) {
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`${pollId}:${userId}`}, 0))`;
    const existing = first(
      await tx`
        SELECT id FROM anchor_poll_votes
        WHERE poll_id = ${pollId} AND choice_id = ${choiceId} AND user_id = ${userId}
      `,
    );
    if (existing) {
      await tx`DELETE FROM anchor_poll_votes WHERE id = ${existing.id}`;
      return "cleared";
    }
    if (single) {
      await tx`DELETE FROM anchor_poll_votes WHERE poll_id = ${pollId} AND user_id = ${userId}`;
    }
    await tx`
      INSERT INTO anchor_poll_votes (poll_id, choice_id, user_id)
      VALUES (${pollId}, ${choiceId}, ${userId})
    `;
    return "voted";
  });
}

export async function clearAnchorPollVotes(pollId, userId) {
  await sql`DELETE FROM anchor_poll_votes WHERE poll_id = ${pollId} AND user_id = ${userId}`;
}

export async function createAnchorNpsSurvey(channelId, { creator, question, days }) {
  return sql.begin(async (tx) => {
    await lockChannel(tx, channelId);
    await tx`
      UPDATE anchor_polls SET is_current = 0, updated_at = ${sql.unsafe(epoch)}
      WHERE channel_id = ${channelId} AND is_current = 1
    `;
    return first(
      await tx`
        INSERT INTO anchor_polls (channel_id, creator_user_id, question, type, closes_at)
        VALUES (
          ${channelId}, ${creator}, ${question}, 'nps',
          CASE WHEN ${days ?? null}::integer IS NOT NULL
            THEN ${sql.unsafe(epoch)} + ${days ?? null}::integer * 86400
            ELSE NULL END
        )
        RETURNING *
      `,
    );
  });
}

export async function createAnchorMessage(channelId, { creator, question, content }) {
  return sql.begin(async (tx) => {
    await lockChannel(tx, channelId);
    await tx`
      UPDATE anchor_polls SET is_current = 0, updated_at = ${sql.unsafe(epoch)}
      WHERE channel_id = ${channelId} AND is_current = 1
    `;
    return first(
      await tx`
        INSERT INTO anchor_polls (channel_id, creator_user_id, question, type, content)
        VALUES (${channelId}, ${creator}, ${question}, 'message', ${content ?? null})
        RETURNING *
      `,
    );
  });
}

export async function updateAnchorMessageContent(id, { question, content }) {
  return first(
    await sql`
      UPDATE anchor_polls
      SET question = ${question}, content = ${content ?? null}, updated_at = ${sql.unsafe(epoch)}
      WHERE id = ${id}
      RETURNING *
    `,
  );
}

export async function getAnchorNpsResponses(pollId) {
  return sql`SELECT * FROM anchor_nps_responses WHERE poll_id = ${pollId}`;
}

export async function recordNpsScore(pollId, userId, score) {
  return first(
    await sql`
      INSERT INTO anchor_nps_responses (poll_id, user_id, score)
      VALUES (${pollId}, ${userId}, ${score})
      ON CONFLICT (poll_id, user_id) DO UPDATE
        SET score = EXCLUDED.score, updated_at = ${sql.unsafe(epoch)}
      RETURNING *
    `,
  );
}

export async function recordNpsComment(pollId, userId, comment) {
  return first(
    await sql`
      INSERT INTO anchor_nps_responses (poll_id, user_id, comment)
      VALUES (${pollId}, ${userId}, ${comment})
      ON CONFLICT (poll_id, user_id) DO UPDATE
        SET comment = EXCLUDED.comment, updated_at = ${sql.unsafe(epoch)}
      RETURNING *
    `,
  );
}

const apiKeyColumns = "id, channel_id, user_id, name, key_prefix, created_at, last_used_at";

// A user may hold this many active keys in total, across every channel.
export const MAX_API_KEYS_PER_USER = 5;

export async function countUserApiKeys(userId) {
  const [row] = await sql`
    SELECT count(*)::int AS count FROM channel_api_keys
    WHERE user_id = ${userId} AND revoked_at IS NULL
  `;
  return row.count;
}

// Returns null when the caller is already at the cap. Counting and inserting share
// a transaction and an advisory lock on the user, so two concurrent creations
// cannot both read a count of four and both insert.
export async function createChannelApiKey(channelId, userId, name, keyPrefix, keyHash) {
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`api_keys:${userId}`}, 0))`;
    const [row] = await tx`
      SELECT count(*)::int AS count FROM channel_api_keys
      WHERE user_id = ${userId} AND revoked_at IS NULL
    `;
    if (row.count >= MAX_API_KEYS_PER_USER) return null;

    return first(
      await tx`
        INSERT INTO channel_api_keys (channel_id, user_id, name, key_prefix, key_hash)
        VALUES (${channelId}, ${userId}, ${name}, ${keyPrefix}, ${keyHash})
        RETURNING ${sql.unsafe(apiKeyColumns)}
      `,
    );
  });
}

export async function listChannelApiKeys(channelId, userId) {
  return sql`
    SELECT ${sql.unsafe(apiKeyColumns)} FROM channel_api_keys
    WHERE channel_id = ${channelId} AND user_id = ${userId} AND revoked_at IS NULL
    ORDER BY created_at DESC, id DESC
  `;
}

export async function findChannelApiKeyByHash(keyHash) {
  return first(
    await sql`
      SELECT ${sql.unsafe(apiKeyColumns)} FROM channel_api_keys
      WHERE key_hash = ${keyHash} AND revoked_at IS NULL
    `,
  );
}

export async function isChannelApiKeyActive(id) {
  return Boolean(
    first(await sql`SELECT 1 FROM channel_api_keys WHERE id = ${id} AND revoked_at IS NULL`),
  );
}

export async function touchChannelApiKey(id) {
  await sql`UPDATE channel_api_keys SET last_used_at = ${sql.unsafe(epoch)} WHERE id = ${id}`;
}

export async function revokeChannelApiKey(id, channelId, userId) {
  return Boolean(
    first(
      await sql`
        UPDATE channel_api_keys SET revoked_at = ${sql.unsafe(epoch)}
        WHERE id = ${id}
          AND channel_id = ${channelId}
          AND user_id = ${userId}
          AND revoked_at IS NULL
        RETURNING id
      `,
    ),
  );
}

export { sql };
export default sql;
