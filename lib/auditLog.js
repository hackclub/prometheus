import { WebClient } from "@slack/web-api";
import { getAuditLogChannel } from "./db.js";

const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
let bot = null;

// Strip angle brackets so a reason cannot fire <!channel> or other mentions in the log channel.
const clean = (s) => (s || "").replace(/[<>]/g, "");

const when = (expires) =>
  `<!date^${expires}^{date_short_pretty} at {time}|${new Date(expires * 1000).toUTCString()}>`;

const apiTag = (api) => (api ? " _(via API)_" : "");
const AUTO = ":robot_face: _Automated_ \u2014 ";

const quote = (s) =>
  clean(s)
    .slice(0, 2500)
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");

const contentLine = (text) => (text ? `\n*Content:*\n${quote(text)}` : "");
const list = (items) => items.filter(Boolean).map(clean).join(", ");

const reasonLine = (reason) => `\n*Reason:* ${clean(reason).trim() || "_none given_"}`;

/**
 * Mirror a moderation action in `channel` to that channel's configured audit log channel.
 * Never throws: a missing/removed bot membership must not block the moderation action itself.
 */
export async function auditLog(channel, text) {
  if (!BOT_TOKEN) return;
  try {
    const cfg = await getAuditLogChannel(channel);
    if (!cfg) return;
    bot ??= new WebClient(BOT_TOKEN);
    await bot.chat.postMessage({
      channel: cfg.log_channel_id,
      text: `Moderation action in <#${channel}>`,
      blocks: [{ type: "section", text: { type: "mrkdwn", text } }],
    });
  } catch (e) {
    console.warn(`[auditlog] failed to log for ${channel}: ${e.data?.error || e.message}`);
  }
}

export const auditDelete = (channel, { deletedBy, sender, reason, api, text }) =>
  auditLog(
    channel,
    `:wastebasket: <@${deletedBy}> deleted a message${sender ? ` from <@${sender}>` : ""} in <#${channel}>${apiTag(api)}${reasonLine(reason)}${contentLine(text)}`,
  );

// Deletions made by the bot itself (timeout enforcement, posting gate).
export const auditAutoDelete = (channel, { sender, reason, text, kicked }) =>
  auditLog(
    channel,
    `${AUTO}:wastebasket: deleted a message from <@${sender}> in <#${channel}>${kicked ? " and removed them from the channel" : ""}${reasonLine(reason)}${contentLine(text)}`,
  );

// Embed removed from a message. `by` unset means the embed blacklist did it automatically.
export const auditEmbed = (channel, { by, sender, ts, urls, rule, reason }) =>
  auditLog(
    channel,
    `${by ? "" : AUTO}:link: ${by ? `<@${by}> removed` : "removed"} ${urls?.length > 1 ? "embeds" : "an embed"} from a message${sender ? ` by <@${sender}>` : ""} in <#${channel}> (posted <!date^${Math.floor(parseFloat(ts))}^{date_short_pretty} {time_secs}|${ts}>)${rule ? `\n*Blocked rule:* ${clean(rule)}` : ""}${reason ? reasonLine(reason) : ""}${urls?.length ? `\n*Embed:* ${list(urls)}` : ""}`,
  );

export const auditEmbedRule = (channel, { by, type, target, removed }) =>
  auditLog(
    channel,
    `:link: <@${by}> ${removed ? "removed the embed block for" : "blocked embeds from"} \`${clean(target)}\` (${type}) in <#${channel}>`,
  );

export const auditThread = (channel, { deletedBy, mode, reason, archiveUrl }) =>
  auditLog(
    channel,
    `:fire: <@${deletedBy}> ${mode === "hide" ? "hid" : "destroyed"} a thread in <#${channel}>${reasonLine(reason)}${archiveUrl ? `\n*Archive:* ${archiveUrl}` : ""}`,
  );

export const auditPurge = (channel, { deletedBy, count, threads, reason, archiveUrls }) =>
  auditLog(
    channel,
    `:broom: <@${deletedBy}> purged ${count} message${count === 1 ? "" : "s"}${threads ? `, including ${threads} full thread${threads === 1 ? "" : "s"},` : ""} in <#${channel}>${reasonLine(reason)}${archiveUrls?.length ? `\n*Archive:* ${archiveUrls.join(", ")}` : ""}`,
  );

export const auditThreadBroadcastRemoval = (channel, { by, sender }) =>
  auditLog(
    channel,
    `:wastebasket: <@${by}> removed a thread reply from the channel${sender ? ` (by <@${sender}>)` : ""} in <#${channel}>; the reply itself is still in its thread`,
  );

export const auditKeyDisclosure = (channel, { owner, keyName, keyPrefix, source }) =>
  auditLog(
    channel,
    `:siren1: An API key for <#${channel}> belonging to <@${owner}> was revoked through the public disclosure endpoint, which likely means it was leaked.\n*Key:* ${keyName ? `${clean(keyName)} ` : ""}\`${keyPrefix}…\`${source ? `\n*Reported source:* ${clean(source)}` : ""}`,
  );

export const auditTimeout = (channel, { by, user, reason, expires }) =>
  auditLog(
    channel,
    `:bonk: <@${by}> timed out <@${user}> from <#${channel}>${expires ? ` until ${when(expires)}` : ""}${reasonLine(reason)}`,
  );

export const auditUntimeout = (channel, { by, user }) =>
  auditLog(channel, `:okay-1: <@${by}> removed the timeout for <@${user}> from <#${channel}>`);
