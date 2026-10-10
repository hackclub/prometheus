import { canBan } from "../perms.js";
import { getChannelBan, setChannelBan } from "../db.js";
import { logBan } from "../logger.js";

const USAGE =
  ":red-x: Usage: `/pro timeout @user [duration] [reason]`, e.g. `/pro timeout @user 1w spamming`. Durations look like `30m`, `12h`, `7d` or `1w`; leave it off for a permanent timeout.";

const UNITS = [
  { seconds: 1, names: ["s", "sec", "secs", "second", "seconds"], label: "second" },
  { seconds: 60, names: ["m", "min", "mins", "minute", "minutes"], label: "minute" },
  { seconds: 3600, names: ["h", "hr", "hrs", "hour", "hours"], label: "hour" },
  { seconds: 86400, names: ["d", "day", "days"], label: "day" },
  { seconds: 604800, names: ["w", "wk", "wks", "week", "weeks"], label: "week" },
];
const UNIT_BY_NAME = new Map(UNITS.flatMap((u) => u.names.map((n) => [n, u])));

const MAX_SECONDS = 10 * 365 * 86400;

const parseId = (t, r) => t?.match(r)?.[1];
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function parseDuration(tokens) {
  const [first, second] = tokens;
  if (!first || !/^\d/.test(first)) return { seconds: null, label: null, used: 0 };

  let match = first.match(/^(\d+)([a-z]+)$/i);
  let used = 1;
  if (!match && /^\d+$/.test(first) && UNIT_BY_NAME.has(second?.toLowerCase())) {
    match = [null, first, second];
    used = 2;
  }

  const unit = match && UNIT_BY_NAME.get(match[2].toLowerCase());
  const n = match ? Number(match[1]) : 0;
  if (!unit || n < 1) return { error: `\`${first}\` isn't a duration I understand.` };
  if (n * unit.seconds > MAX_SECONDS)
    return { error: "That's over 10 years. Leave the duration off for a permanent timeout." };

  return { seconds: n * unit.seconds, label: plural(n, unit.label), used };
}

const untilText = (expires) =>
  `<!date^${expires}^{date_short_pretty} at {time}|${new Date(expires * 1000).toUTCString()}>`;
const lengthText = (expires, label) =>
  expires ? `for ${label} (until ${untilText(expires)})` : "*permanently*";

async function isTimedOut(userId, channelId) {
  const existing = await getChannelBan(userId, channelId);
  return existing && (!existing.expires || existing.expires > Math.floor(Date.now() / 1000));
}

function timeoutModal({ channel, user, seconds, label, reason, responseUrl }) {
  const preview = seconds ? Math.floor(Date.now() / 1000) + seconds : null;
  return {
    type: "modal",
    callback_id: "timeout_confirm",
    private_metadata: JSON.stringify({ channel, user, seconds, label, responseUrl }),
    title: { type: "plain_text", text: "Confirm timeout" },
    submit: { type: "plain_text", text: "Time out" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Time out <@${user}> from <#${channel}> ${lengthText(preview, label)}?\nThey'll be removed from the channel and sent a DM with the reason.`,
        },
      },
      ...(seconds
        ? []
        : [
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: "No duration given, so this lasts until someone runs `/pro untimeout`. Cancel and add one like `1w` if that's not what you meant.",
                },
              ],
            },
          ]),
      {
        type: "input",
        block_id: "reason",
        label: { type: "plain_text", text: "Reason" },
        element: {
          type: "plain_text_input",
          action_id: "reason_input",
          multiline: true,
          ...(reason ? { initial_value: reason } : {}),
          placeholder: { type: "plain_text", text: "Why are you timing them out?" },
        },
        hint: { type: "plain_text", text: "Sent to them and recorded in the audit log." },
      },
    ],
  };
}

async function reply(responseUrl, text, logger) {
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response_type: "ephemeral", text }),
  }).catch((e) => logger.warn(`[timeout] reply failed: ${e.message}`));
}

async function handleView({ view, body, client, context, logger }) {
  const { channel, user, seconds, label, responseUrl } = JSON.parse(view.private_metadata);
  const actor = body.user.id;
  const reason = view.state?.values?.reason?.reason_input?.value?.trim() || "";

  if (!(await canBan(context.userClient, actor, channel))) {
    console.log(`[timeout] ${actor} denied in ${channel}`);
    return reply(responseUrl, ":loll: You do not have permission to use this command.", logger);
  }
  if (await isTimedOut(user, channel))
    return reply(
      responseUrl,
      `:red-x: <@${user}> is already timed out from <#${channel}>.`,
      logger,
    );

  // Measured from submission, not from when the modal opened.
  const expires = seconds ? Math.floor(Date.now() / 1000) + seconds : null;
  await setChannelBan(user, channel, actor, reason, expires);
  console.log(
    `[timeout] ${actor} banned ${user} from ${channel}${expires ? ` until ${expires}` : " permanently"}`,
  );

  const banMsg = `You have been timed out from <#${channel}> ${lengthText(expires, label)} for the following reason: ${reason}`;

  await Promise.all([
    context.userClient.conversations.kick({ channel, user }).catch((e) => {
      console.warn(`[timeout] kick failed: ${e.message}`);
    }),
    client.chat.postMessage({ channel: user, text: banMsg }).catch((e) => {
      console.warn(`[timeout] dm failed: ${e.message}`);
    }),
    logBan(client, { channel, user, bannedBy: actor, reason, expires }),
  ]);

  await reply(
    responseUrl,
    `:bonk: Timed out <@${user}> from <#${channel}> ${lengthText(expires, label)}.`,
    logger,
  );
}

export const views = [{ callbackId: "timeout_confirm", handleView }];

export default {
  name: "timeout",
  description: "Timeout a user from a channel",

  async execute({ command: cmd, args, respond, client, context }) {
    const err = (t) => respond({ response_type: "ephemeral", text: t });

    if (!(await canBan(context.userClient, cmd.user_id, cmd.channel_id))) {
      console.log(`[timeout] ${cmd.user_id} denied in ${cmd.channel_id}`);
      return err(":loll: You do not have permission to use this command.");
    }

    const [rawUser, ...rest] = args;
    const user = parseId(rawUser, /<@([A-Z0-9]+)\|?.*>/);
    if (!user) return err(USAGE);

    const duration = parseDuration(rest);
    if (duration.error) return err(`:red-x: ${duration.error}\n${USAGE}`);

    const channel = cmd.channel_id;
    if (await isTimedOut(user, channel))
      return err(`:red-x: <@${user}> is already timed out from <#${channel}>.`);

    await client.views.open({
      trigger_id: cmd.trigger_id,
      view: timeoutModal({
        channel,
        user,
        seconds: duration.seconds,
        label: duration.label,
        reason: rest.slice(duration.used).join(" ").trim(),
        responseUrl: cmd.response_url,
      }),
    });
  },
};
