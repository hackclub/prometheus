const BROWSER_TOKEN = process.env.SLACK_BROWSER_TOKEN;
const SLACK_COOKIE = process.env.SLACK_COOKIE;

export const areWeEnterprise = Boolean(BROWSER_TOKEN && SLACK_COOKIE);
console.log(
  `[moderation] enterprise moderation APIs: ${areWeEnterprise ? "available" : "not configured"}`,
);

async function moderationAPI(method, params) {
  if (!areWeEnterprise) {
    throw new Error("mod api is not available: SLACK_BROWSER_TOKEN and/or SLACK_COOKIE not set");
  }

  const formData = new FormData();
  formData.set("token", BROWSER_TOKEN);
  for (const [key, value] of Object.entries(params)) {
    formData.set(key, value);
  }

  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    body: formData,
    headers: { Cookie: `d=${encodeURIComponent(SLACK_COOKIE)};` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`mod api ${method} HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (!json.ok) {
    throw new Error(`mod api ${method} failed: ${json.error || JSON.stringify(json)}`);
  }

  return json;
}

export async function listChannelManagers(channelId) {
  const res = await moderationAPI("admin.roles.entity.listAssignments", {
    entity_id: channelId,
    role_id: "Rl0A",
  });
  const assignment = (res.role_assignments || []).find((a) => a.role_id === "Rl0A");
  return assignment?.users || [];
}

export async function hideThread(channel, ts) {
  console.log(`[moderation] hiding thread ${ts} in ${channel}`);
  return moderationAPI("moderation.thread.hide", {
    channel_id: channel,
    thread_ts: ts,
  });
}

export async function lockThread(channel, ts) {
  console.log(`[moderation] locking thread ${ts} in ${channel}`);
  return moderationAPI("moderation.locks.create", {
    channel_id: channel,
    thread_ts: ts,
  });
}

export async function unlockThread(channel, ts) {
  console.log(`[moderation] unlocking thread ${ts} in ${channel}`);
  return moderationAPI("moderation.locks.remove", {
    channel_id: channel,
    thread_ts: ts,
  });
}

export async function deleteAttachment(channel, ts, attachment) {
  console.log(`[moderation] deleting attachment ${attachment} from ${ts} in ${channel}`);
  return moderationAPI("chat.deleteAttachment", {
    channel,
    ts,
    attachment,
  });
}
