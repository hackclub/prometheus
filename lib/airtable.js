import Airtable from "airtable";

const base =
  process.env.AIRTABLE_PAT && process.env.AIRTABLE_BASE_ID
    ? new Airtable({ apiKey: process.env.AIRTABLE_PAT }).base(process.env.AIRTABLE_BASE_ID)
    : null;

const SURVEYS_TABLE = "NPS Surveys";
const RESPONSES_TABLE = "NPS Responses";

async function resolveChannelName(client, channelId) {
  try {
    const { channel } = await client.conversations.info({ channel: channelId });
    return channel?.name ? `#${channel.name}` : channelId;
  } catch {
    return channelId;
  }
}

async function resolveDisplayName(client, userId) {
  try {
    const { user } = await client.users.info({ user: userId });
    return user?.profile?.display_name || user?.real_name || user?.name || userId;
  } catch {
    return userId;
  }
}

function computeClosedAt(poll) {
  const now = Math.floor(Date.now() / 1000);
  const expiredOnSchedule = poll.closes_at && poll.closes_at <= now ? poll.closes_at : null;
  if (!poll.is_current || !poll.enabled) return expiredOnSchedule ?? poll.updated_at;
  return expiredOnSchedule;
}

async function upsertByKey(table, keyField, keyValue, fields, createOnlyFields = {}) {
  const escaped = String(keyValue).replace(/'/g, "\\'");
  const existing = await base(table)
    .select({ maxRecords: 1, filterByFormula: `{${keyField}} = '${escaped}'` })
    .firstPage();

  if (existing.length) {
    await base(table).update([{ id: existing[0].id, fields }]);
    return { id: existing[0].id, created: false };
  }

  const [record] = await base(table).create([
    { fields: { [keyField]: keyValue, ...createOnlyFields, ...fields } },
  ]);
  return { id: record.id, created: true };
}

export async function syncNpsSurvey(poll, client) {
  if (!base) return null;

  const surveyKey = `${poll.channel_id}-${poll.id}`;
  const channelName = await resolveChannelName(client, poll.channel_id);

  const closedAt = computeClosedAt(poll);

  const { id } = await upsertByKey(SURVEYS_TABLE, "Survey Key", surveyKey, {
    "Poll ID": poll.id,
    "Channel ID": poll.channel_id,
    "Channel Name": channelName,
    Question: poll.question,
    "Created By": poll.creator_user_id,
    "Created At": new Date(poll.created_at * 1000).toISOString(),
    "Closed At": closedAt ? new Date(closedAt * 1000).toISOString() : null,
  });

  return id;
}

export async function syncNpsResponse(poll, userId, patch, client, context) {
  if (!base) return;

  const surveyRecordId = await syncNpsSurvey(poll, client);
  if (!surveyRecordId) return;

  const displayName = await resolveDisplayName(context.userClient, userId);
  const now = new Date().toISOString();

  const fields = {
    "User ID": userId,
    "Display Name": displayName,
    "Survey Key": [surveyRecordId],
    "Last Updated": now,
    ...("score" in patch ? { Score: patch.score } : {}),
    ...("comment" in patch ? { Comment: patch.comment } : {}),
  };

  await upsertByKey(RESPONSES_TABLE, "Response Key", `${poll.id}-${userId}`, fields, {
    "Submitted At": now,
  });
}
