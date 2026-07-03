import { Database } from 'bun:sqlite';

const dbPath = process.env.DATABASE_PATH || 'prometheus.db';
const db = new Database(dbPath);
console.log(`[db] opened database at ${dbPath}`);

db.run('PRAGMA journal_mode = WAL;');
db.run('PRAGMA foreign_keys = ON;');

db.run(`
  CREATE TABLE IF NOT EXISTS global_admins (
    user_id TEXT PRIMARY KEY,
    added_by TEXT NOT NULL,
    added_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS appointed_managers (
    user_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    added_by TEXT NOT NULL,
    added_at INTEGER NOT NULL DEFAULT (unixepoch()),
    role TEXT NOT NULL DEFAULT 'moderator',
    PRIMARY KEY (user_id, channel_id)
  )
`);

// migration: add role column to existing tables, backfill as 'manager'
try {
  db.run(`ALTER TABLE appointed_managers ADD COLUMN role TEXT NOT NULL DEFAULT 'manager'`);
} catch { /* column already exists */ }

db.run(`
  CREATE TABLE IF NOT EXISTS channel_bans (
    user_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    banned_by TEXT NOT NULL,
    reason TEXT,
    expires INTEGER,
    PRIMARY KEY (user_id, channel_id)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS join_messages (
    channel_id TEXT PRIMARY KEY,
    message TEXT NOT NULL,
    mode TEXT NOT NULL DEFAULT 'ephemeral',
    set_by TEXT NOT NULL,
    set_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS embed_blocks (
    channel_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('domain', 'host', 'path')),
    target TEXT NOT NULL,
    blocked_by TEXT NOT NULL,
    blocked_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (channel_id, type, target)
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS anchor_polls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    creator_user_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'poll',
    question TEXT NOT NULL,
    anonymous INTEGER NOT NULL DEFAULT 0,
    multi_select INTEGER NOT NULL DEFAULT 0,
    add_choice_setting TEXT NOT NULL DEFAULT 'no_one',
    enabled INTEGER NOT NULL DEFAULT 1,
    message_ts TEXT,
    closes_at INTEGER,
    is_current INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);

// migration: add type/closes_at/is_current to anchor_polls created before NPS surveys / history existed
try {
  db.run(`ALTER TABLE anchor_polls ADD COLUMN type TEXT NOT NULL DEFAULT 'poll'`);
} catch { /* column already exists */ }
try {
  db.run(`ALTER TABLE anchor_polls ADD COLUMN closes_at INTEGER`);
} catch { /* column already exists */ }
try {
  db.run(`ALTER TABLE anchor_polls ADD COLUMN is_current INTEGER NOT NULL DEFAULT 1`);
} catch { /* column already exists */ }

// history retention replaced the old "one row per channel, ever" model - drop that
// constraint in favor of a partial index that only enforces uniqueness among current anchors
db.run('DROP INDEX IF EXISTS anchor_polls_channel');
db.run('CREATE UNIQUE INDEX IF NOT EXISTS anchor_polls_channel_current ON anchor_polls (channel_id) WHERE is_current = 1');
db.run('CREATE INDEX IF NOT EXISTS anchor_polls_channel_history ON anchor_polls (channel_id, created_at)');

db.run(`
  CREATE TABLE IF NOT EXISTS anchor_poll_choices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_id INTEGER NOT NULL REFERENCES anchor_polls(id) ON DELETE CASCADE,
    creator_user_id TEXT NOT NULL,
    text TEXT NOT NULL,
    position INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);
db.run('CREATE UNIQUE INDEX IF NOT EXISTS anchor_poll_choices_position ON anchor_poll_choices (poll_id, position)');

db.run(`
  CREATE TABLE IF NOT EXISTS anchor_poll_votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_id INTEGER NOT NULL REFERENCES anchor_polls(id) ON DELETE CASCADE,
    choice_id INTEGER NOT NULL REFERENCES anchor_poll_choices(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);
db.run('CREATE INDEX IF NOT EXISTS anchor_poll_votes_poll ON anchor_poll_votes (poll_id)');

db.run(`
  CREATE TABLE IF NOT EXISTS anchor_nps_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_id INTEGER NOT NULL REFERENCES anchor_polls(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    score INTEGER,
    comment TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);
db.run('CREATE UNIQUE INDEX IF NOT EXISTS anchor_nps_responses_poll_user ON anchor_nps_responses (poll_id, user_id)');

// migration: score used to be NOT NULL, but thread-reply feedback can arrive before a score is
// picked - SQLite can't drop a NOT NULL constraint in place, so rebuild the table when needed
{
  const scoreColumn = db.query("SELECT \"notnull\" FROM pragma_table_info('anchor_nps_responses') WHERE name = 'score'").get();
  if (scoreColumn?.notnull) {
    db.run('ALTER TABLE anchor_nps_responses RENAME TO anchor_nps_responses_pre_nullable_score');
    db.run(`
      CREATE TABLE anchor_nps_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        poll_id INTEGER NOT NULL REFERENCES anchor_polls(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        score INTEGER,
        comment TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);
    db.run('INSERT INTO anchor_nps_responses SELECT * FROM anchor_nps_responses_pre_nullable_score');
    db.run('DROP TABLE anchor_nps_responses_pre_nullable_score');
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS anchor_nps_responses_poll_user ON anchor_nps_responses (poll_id, user_id)');
  }
}

const statements = {
  isAdmin: db.query('SELECT 1 FROM global_admins WHERE user_id = $userId'),
  addAdmin: db.query('INSERT OR IGNORE INTO global_admins (user_id, added_by) VALUES ($userId, $addedBy)'),
  removeAdmin: db.query('DELETE FROM global_admins WHERE user_id = $userId'),
  listAdmins: db.query('SELECT user_id, added_by, added_at FROM global_admins'),

  hasChannelRole: db.query('SELECT 1 FROM appointed_managers WHERE user_id = $userId AND channel_id = $channelId'),
  isAppointedManager: db.query('SELECT 1 FROM appointed_managers WHERE user_id = $userId AND channel_id = $channelId AND role = $role'),
  addAppointedManager: db.query('INSERT OR REPLACE INTO appointed_managers (user_id, channel_id, added_by, role) VALUES ($userId, $channelId, $addedBy, $role)'),
  removeAppointedManager: db.query('DELETE FROM appointed_managers WHERE user_id = $userId AND channel_id = $channelId'),
  listAppointedManagers: db.query('SELECT user_id, role, added_by, added_at FROM appointed_managers WHERE channel_id = $channelId'),
  listAllAppointedManagers: db.query('SELECT user_id, channel_id, role, added_by, added_at FROM appointed_managers ORDER BY channel_id'),
  hasAppointedManager: db.query('SELECT 1 FROM appointed_managers WHERE channel_id = $channelId'),

  getChannelBan: db.query('SELECT user_id, channel_id, banned_by, reason, expires FROM channel_bans WHERE user_id = $userId AND channel_id = $channelId'),
  setChannelBan: db.query('INSERT OR REPLACE INTO channel_bans (user_id, channel_id, banned_by, reason, expires) VALUES ($userId, $channelId, $bannedBy, $reason, $expires)'),
  removeChannelBan: db.query('DELETE FROM channel_bans WHERE user_id = $userId AND channel_id = $channelId'),
  listChannelBans: db.query('SELECT user_id, channel_id, banned_by, reason, expires FROM channel_bans WHERE channel_id = $channelId'),
  listUserBans: db.query('SELECT user_id, channel_id, banned_by, reason, expires FROM channel_bans WHERE user_id = $userId'),
  listAllChannelBans: db.query('SELECT user_id, channel_id, banned_by, reason, expires FROM channel_bans ORDER BY channel_id'),

  getwelcome: db.query('SELECT channel_id, message, mode, set_by, set_at FROM join_messages WHERE channel_id = $channelId'),
  setwelcome: db.query('INSERT OR REPLACE INTO join_messages (channel_id, message, mode, set_by) VALUES ($channelId, $message, $mode, $setBy)'),
  removewelcome: db.query('DELETE FROM join_messages WHERE channel_id = $channelId'),

  addEmbedBlock: db.query('INSERT OR REPLACE INTO embed_blocks (channel_id, type, target, blocked_by) VALUES ($channelId, $type, $target, $blockedBy)'),
  removeEmbedBlock: db.query('DELETE FROM embed_blocks WHERE channel_id = $channelId AND type = $type AND target = $target'),
  listEmbedBlocks: db.query('SELECT channel_id, type, target, blocked_by, blocked_at FROM embed_blocks WHERE channel_id = $channelId'),
  listAllEmbedBlocks: db.query('SELECT channel_id, type, target, blocked_by, blocked_at FROM embed_blocks ORDER BY channel_id, type, target'),

  getAnchorPollByChannel: db.query('SELECT * FROM anchor_polls WHERE channel_id = $channelId AND is_current = 1'),
  getAnchorPollById: db.query('SELECT * FROM anchor_polls WHERE id = $id'),
  listAnchorPollsByChannel: db.query('SELECT * FROM anchor_polls WHERE channel_id = $channelId ORDER BY created_at DESC LIMIT $limit'),
  deactivateCurrentAnchorPoll: db.query('UPDATE anchor_polls SET is_current = 0, updated_at = unixepoch() WHERE channel_id = $channelId AND is_current = 1'),
  insertAnchorPoll: db.query(`
    INSERT INTO anchor_polls (channel_id, creator_user_id, question, anonymous, multi_select, add_choice_setting)
    VALUES ($channelId, $creator, $question, $anonymous, $multiSelect, $addChoiceSetting)
    RETURNING *
  `),
  updateAnchorPollQuestion: db.query('UPDATE anchor_polls SET question = $question, updated_at = unixepoch() WHERE id = $id RETURNING *'),
  setAnchorPollMessageTs: db.query('UPDATE anchor_polls SET message_ts = $ts WHERE channel_id = $channelId AND is_current = 1'),
  setAnchorPollEnabled: db.query('UPDATE anchor_polls SET enabled = $enabled, updated_at = unixepoch() WHERE channel_id = $channelId AND is_current = 1'),

  getAnchorPollChoices: db.query('SELECT * FROM anchor_poll_choices WHERE poll_id = $pollId ORDER BY position ASC'),
  insertAnchorPollChoice: db.query(`
    INSERT INTO anchor_poll_choices (poll_id, creator_user_id, text, position)
    SELECT $pollId, $creator, $text, COALESCE(MAX(position), 0) + 1 FROM anchor_poll_choices WHERE poll_id = $pollId
    RETURNING *
  `),

  getAnchorPollVotes: db.query('SELECT * FROM anchor_poll_votes WHERE poll_id = $pollId'),
  findAnchorPollVote: db.query('SELECT * FROM anchor_poll_votes WHERE poll_id = $pollId AND choice_id = $choiceId AND user_id = $userId'),
  insertAnchorPollVote: db.query('INSERT INTO anchor_poll_votes (poll_id, choice_id, user_id) VALUES ($pollId, $choiceId, $userId)'),
  deleteAnchorPollVoteById: db.query('DELETE FROM anchor_poll_votes WHERE id = $id'),
  deleteAnchorPollVotesByUser: db.query('DELETE FROM anchor_poll_votes WHERE poll_id = $pollId AND user_id = $userId'),

  insertAnchorNpsSurvey: db.query(`
    INSERT INTO anchor_polls (channel_id, creator_user_id, question, type, closes_at)
    VALUES ($channelId, $creator, $question, 'nps', CASE WHEN $days IS NOT NULL THEN unixepoch() + $days * 86400 ELSE NULL END)
    RETURNING *
  `),
  getAnchorNpsResponses: db.query('SELECT * FROM anchor_nps_responses WHERE poll_id = $pollId'),
  recordNpsScore: db.query(`
    INSERT INTO anchor_nps_responses (poll_id, user_id, score)
    VALUES ($pollId, $userId, $score)
    ON CONFLICT (poll_id, user_id) DO UPDATE SET score = excluded.score, updated_at = unixepoch()
    RETURNING *
  `),
  recordNpsComment: db.query(`
    INSERT INTO anchor_nps_responses (poll_id, user_id, comment)
    VALUES ($pollId, $userId, $comment)
    ON CONFLICT (poll_id, user_id) DO UPDATE SET comment = excluded.comment, updated_at = unixepoch()
    RETURNING *
  `),
};

export function isGlobalAdmin(userId) {
  return !!statements.isAdmin.get({ $userId: userId });
}

export function addGlobalAdmin(userId, addedBy) {
  statements.addAdmin.run({ $userId: userId, $addedBy: addedBy });
}

export function removeGlobalAdmin(userId) {
  statements.removeAdmin.run({ $userId: userId });
}

export function listGlobalAdmins() {
  return statements.listAdmins.all();
}

export function hasChannelRole(userId, channelId) {
  return !!statements.hasChannelRole.get({ $userId: userId, $channelId: channelId });
}

export function isAppointedManager(userId, channelId) {
  return !!statements.isAppointedManager.get({ $userId: userId, $channelId: channelId, $role: 'manager' });
}

export function addAppointedManager(userId, channelId, addedBy, role = 'moderator') {
  statements.addAppointedManager.run({ $userId: userId, $channelId: channelId, $addedBy: addedBy, $role: role });
}

export function removeAppointedManager(userId, channelId) {
  statements.removeAppointedManager.run({ $userId: userId, $channelId: channelId });
}

export function listAppointedManagers(channelId) {
  return statements.listAppointedManagers.all({ $channelId: channelId });
}

export function listAllAppointedManagers() {
  return statements.listAllAppointedManagers.all();
}

export function hasAppointedManager(channelId) {
  return !!statements.hasAppointedManager.get({ $channelId: channelId });
}

export function getChannelBan(userId, channelId) {
  return statements.getChannelBan.get({ $userId: userId, $channelId: channelId });
}

export function setChannelBan(userId, channelId, bannedBy, reason, expires) {
  statements.setChannelBan.run({
    $userId: userId,
    $channelId: channelId,
    $bannedBy: bannedBy,
    $reason: reason,
    $expires: expires ?? null,
  });
}

export function removeChannelBan(userId, channelId) {
  statements.removeChannelBan.run({ $userId: userId, $channelId: channelId });
}

export function listChannelBans(channelId) {
  return statements.listChannelBans.all({ $channelId: channelId });
}

export function listUserBans(userId) {
  return statements.listUserBans.all({ $userId: userId });
}

export function listAllChannelBans() {
  return statements.listAllChannelBans.all();
}

export function getwelcome(channelId) {
  return statements.getwelcome.get({ $channelId: channelId });
}

export function setwelcome(channelId, message, mode, setBy) {
  statements.setwelcome.run({ $channelId: channelId, $message: message, $mode: mode, $setBy: setBy });
}

export function removewelcome(channelId) {
  statements.removewelcome.run({ $channelId: channelId });
}

export function addEmbedBlock(channelId, type, target, blockedBy) {
  statements.addEmbedBlock.run({
    $channelId: channelId,
    $type: type,
    $target: target,
    $blockedBy: blockedBy,
  });
}

export function removeEmbedBlock(channelId, type, target) {
  statements.removeEmbedBlock.run({ $channelId: channelId, $type: type, $target: target });
}

export function listEmbedBlocks(channelId) {
  return statements.listEmbedBlocks.all({ $channelId: channelId });
}

export function listAllEmbedBlocks() {
  return statements.listAllEmbedBlocks.all();
}

export function getAnchorPoll(channelId) {
  return statements.getAnchorPollByChannel.get({ $channelId: channelId });
}

export function getAnchorPollById(id) {
  return statements.getAnchorPollById.get({ $id: id });
}

export function getAnchorPollChoices(pollId) {
  return statements.getAnchorPollChoices.all({ $pollId: pollId });
}

export function getAnchorPollVotes(pollId) {
  return statements.getAnchorPollVotes.all({ $pollId: pollId });
}

export function listAnchorPolls(channelId, limit = 5) {
  return statements.listAnchorPollsByChannel.all({ $channelId: channelId, $limit: limit });
}

export const createAnchorPoll = db.transaction((channelId, { creator, question, choices, anonymous, multiSelect, addChoiceSetting }) => {
  statements.deactivateCurrentAnchorPoll.run({ $channelId: channelId });
  const poll = statements.insertAnchorPoll.get({
    $channelId: channelId,
    $creator: creator,
    $question: question,
    $anonymous: anonymous ? 1 : 0,
    $multiSelect: multiSelect ? 1 : 0,
    $addChoiceSetting: addChoiceSetting,
  });
  const insertedChoices = choices.map((text) =>
    statements.insertAnchorPollChoice.get({ $pollId: poll.id, $creator: creator, $text: text }),
  );
  return { ...poll, choices: insertedChoices };
});

export function addAnchorPollChoice(pollId, creator, text) {
  return statements.insertAnchorPollChoice.get({ $pollId: pollId, $creator: creator, $text: text });
}

export function updateAnchorPollQuestion(id, question) {
  return statements.updateAnchorPollQuestion.get({ $id: id, $question: question });
}

export function setAnchorPollMessageTs(channelId, ts) {
  statements.setAnchorPollMessageTs.run({ $channelId: channelId, $ts: ts });
}

export function setAnchorPollEnabled(channelId, enabled) {
  statements.setAnchorPollEnabled.run({ $channelId: channelId, $enabled: enabled ? 1 : 0 });
}

export function deleteAnchorPoll(channelId) {
  statements.deactivateCurrentAnchorPoll.run({ $channelId: channelId });
}

export function toggleAnchorPollVote(pollId, choiceId, userId, single) {
  const existing = statements.findAnchorPollVote.get({ $pollId: pollId, $choiceId: choiceId, $userId: userId });
  if (existing) {
    statements.deleteAnchorPollVoteById.run({ $id: existing.id });
    return 'cleared';
  }
  if (single) {
    statements.deleteAnchorPollVotesByUser.run({ $pollId: pollId, $userId: userId });
  }
  statements.insertAnchorPollVote.run({ $pollId: pollId, $choiceId: choiceId, $userId: userId });
  return 'voted';
}

export function clearAnchorPollVotes(pollId, userId) {
  statements.deleteAnchorPollVotesByUser.run({ $pollId: pollId, $userId: userId });
}

export const createAnchorNpsSurvey = db.transaction((channelId, { creator, question, days }) => {
  statements.deactivateCurrentAnchorPoll.run({ $channelId: channelId });
  return statements.insertAnchorNpsSurvey.get({
    $channelId: channelId,
    $creator: creator,
    $question: question,
    $days: days ?? null,
  });
});

export function getAnchorNpsResponses(pollId) {
  return statements.getAnchorNpsResponses.all({ $pollId: pollId });
}

export function recordNpsScore(pollId, userId, score) {
  return statements.recordNpsScore.get({ $pollId: pollId, $userId: userId, $score: score });
}

export function recordNpsComment(pollId, userId, comment) {
  return statements.recordNpsComment.get({ $pollId: pollId, $userId: userId, $comment: comment });
}

export default db;
