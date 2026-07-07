import { canManage } from "../perms.js";
import { planMove } from "../move.js";
import { parseChannelMention } from "../anchorCommon.js";

const txt = (text) => ({ type: "plain_text", text });
const eph = (text) => ({ response_type: "ephemeral", text });

function parseUserMention(token) {
  const m = token.match(/^<@([A-Z0-9]+)(\|[^>]+)?>$/);
  if (m) return m[1];
  if (/^[UW][A-Z0-9]+$/.test(token)) return token;
  return null;
}

function parseArgs(args) {
  let dest = null;
  let kick = false;
  const exclude = [];
  let collectingExclude = false;

  for (const token of args) {
    if (token === "--kick") {
      kick = true;
      collectingExclude = false;
    } else if (token === "--exclude") {
      collectingExclude = true;
    } else if (!dest && parseChannelMention(token)) {
      dest = parseChannelMention(token);
    } else if (collectingExclude) {
      const id = parseUserMention(token);
      if (id) exclude.push(id);
    }
  }

  return { dest, kick, exclude };
}

function skipSummary(skipped) {
  const parts = [];
  if (skipped.excluded.length) parts.push(`${skipped.excluded.length} excluded`);
  if (skipped.banned.length) parts.push(`${skipped.banned.length} banned from destination`);
  if (skipped.optedOut.length) parts.push(`${skipped.optedOut.length} opted out`);
  return parts;
}

function buildReviewMessage({ source, dest, kick, exclude, plan }) {
  const lines = [
    `*Move review*: <#${source}> -> <#${dest}>`,
    `> *${plan.toInvite.length}* member${plan.toInvite.length === 1 ? "" : "s"} will be invited`,
  ];
  if (plan.alreadyIn.length) lines.push(`> _${plan.alreadyIn.length} already in <#${dest}>_`);
  const skips = skipSummary(plan.skipped);
  if (skips.length) lines.push(`> _Skipping: ${skips.join(", ")}_`);
  if (kick) {
    lines.push(
      `> \`--kick\`: members will be *removed from <#${source}>* afterwards`,
    );
  }

  const value = JSON.stringify({ source, dest, kick, exclude });

  return {
    text: `Move review for <#${dest}>`,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            action_id: "move_confirm",
            style: "primary",
            text: txt(kick ? "Confirm move" : "Confirm copy"),
            value,
          },
          {
            type: "button",
            action_id: "move_cancel",
            text: txt("Cancel"),
            value,
          },
        ],
      },
    ],
  };
}

function buildMoveModalView(source) {
  const channelSelect = {
    type: "conversations_select",
    action_id: "value",
    filter: { include: ["public", "private"], exclude_bot_users: true },
  };
  return {
    type: "modal",
    callback_id: "move_setup_modal",
    title: txt("Move members"),
    submit: txt("Review"),
    close: txt("Cancel"),
    blocks: [
      {
        type: "input",
        block_id: "source",
        label: txt("Source channel"),
        element: { ...channelSelect, ...(source ? { initial_conversation: source } : {}) },
      },
      {
        type: "input",
        block_id: "dest",
        label: txt("Destination channel"),
        element: { ...channelSelect },
      },
      {
        type: "input",
        block_id: "exclude",
        optional: true,
        label: txt("Exclude people (optional)"),
        element: { type: "multi_users_select", action_id: "value" },
      },
      {
        type: "input",
        block_id: "options",
        optional: true,
        label: txt("Options"),
        element: {
          type: "checkboxes",
          action_id: "value",
          options: [
            {
              text: txt("Also remove them from the source channel"),
              description: txt("Kick instead of copy"),
              value: "kick",
            },
          ],
        },
      },
    ],
  };
}

async function dm(client, userId, text) {
  try {
    await client.chat.postMessage({ channel: userId, text });
  } catch { }
}

async function reviewMove({
  source,
  dest,
  kick,
  exclude,
  userId,
  client,
  context,
  logger,
  deliver,
  warn,
}) {
  if (source === dest) return warn("The destination has to be a different channel.");

  const canSource = await canManage(context.userClient, userId, source);
  const canDest = await canManage(context.userClient, userId, dest);
  if (!canSource || !canDest) {
    logger.info(`[move] ${userId} denied moving ${source} -> ${dest}`);
    return warn("You need to manage *both* the source channel and the destination.");
  }

  let plan;
  try {
    plan = await planMove(client, logger, { source, dest, exclude });
  } catch (error) {
    logger.error(`[move] plan failed ${source} -> ${dest}: ${error.data?.error ?? error.message}`);
    return warn(`Couldn't read the channels: \`${error.data?.error ?? error.message}\``);
  }

  if (!plan.toInvite.length && !plan.alreadyIn.length) {
    return warn(`Nobody in <#${source}> to move to <#${dest}>.`);
  }

  await deliver(buildReviewMessage({ source, dest, kick, exclude, plan }));
}

async function handleMoveView({ view, body, client, context, logger }) {
  const userId = body.user.id;
  const v = view.state.values;
  const source = v.source?.value?.selected_conversation;
  const dest = v.dest?.value?.selected_conversation;
  const exclude = v.exclude?.value?.selected_users ?? [];
  const kick = (v.options?.value?.selected_options ?? []).some((o) => o.value === "kick");

  if (!source || !dest) return dm(client, userId, "Pick both a source and a destination channel.");

  await reviewMove({
    source,
    dest,
    kick,
    exclude,
    userId,
    client,
    context,
    logger,
    deliver: (msg) => client.chat.postEphemeral({ channel: source, user: userId, ...msg }),
    warn: (text) => dm(client, userId, text),
  });
}

export default {
  name: "move",
  description: "Copy members from this channel to another (add --kick for a true move)",

  async execute({ command: cmd, args, respond, client, context, logger }) {
    if (!args.length) {
      await client.views.open({
        trigger_id: cmd.trigger_id,
        view: buildMoveModalView(cmd.channel_id),
      });
      return;
    }

    const source = cmd.channel_id;
    const { dest, kick, exclude } = parseArgs(args);

    if (!dest) {
      return respond(eph("Usage: `/pro move #destination [--kick] [--exclude @user @user]`"));
    }

    await reviewMove({
      source,
      dest,
      kick,
      exclude,
      userId: cmd.user_id,
      client,
      context,
      logger,
      deliver: (msg) => respond({ response_type: "ephemeral", ...msg }),
      warn: (text) => respond(eph(text)),
    });
  },
};

export const views = [{ callbackId: "move_setup_modal", handleView: handleMoveView }];
