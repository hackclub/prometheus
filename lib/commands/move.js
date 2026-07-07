import { canManage } from "../perms.js";
import { planMove } from "../move.js";
import { parseChannelMention } from "../anchorCommon.js";

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

export default {
  name: "move",
  description: "Copy members from this channel to another (add --kick for a true move)",

  async execute({ command: cmd, args, respond, client, context, logger }) {
    const source = cmd.channel_id;
    const { dest, kick, exclude } = parseArgs(args);

    if (!dest) {
      return respond(
        eph("Usage: `/pro move #destination [--kick] [--exclude @user @user]`"),
      );
    }
    if (dest === source) {
      return respond(eph("The destination has to be a different channel."));
    }

    const canSource = await canManage(context.userClient, cmd.user_id, source);
    const canDest = await canManage(context.userClient, cmd.user_id, dest);
    if (!canSource || !canDest) {
      logger.info(`[move] ${cmd.user_id} denied moving ${source} -> ${dest}`);
      return respond(eph("You need to manage *both* this channel and the destination."));
    }

    let plan;
    try {
      plan = await planMove(client, logger, { source, dest, exclude });
    } catch (error) {
      logger.error(
        `[move] plan failed ${source} -> ${dest}: ${error.data?.error ?? error.message}`,
      );
      return respond(
        eph(`Couldn't read the channels: \`${error.data?.error ?? error.message}\``),
      );
    }

    if (!plan.toInvite.length && !plan.alreadyIn.length) {
      return respond(eph("Nobody here to move to <#" + dest + ">."));
    }

    const lines = [
      `*Move review*: <#${source}> -> <#${dest}>`,
      `> *${plan.toInvite.length}* member${plan.toInvite.length === 1 ? "" : "s"} will be invited`,
    ];
    if (plan.alreadyIn.length) lines.push(`> _${plan.alreadyIn.length} already in <#${dest}>_`);
    const skips = skipSummary(plan.skipped);
    if (skips.length) lines.push(`> _Skipping: ${skips.join(", ")}_`);
    if (kick) {
      const kickCount = plan.toInvite.length + plan.alreadyIn.length;
      const mins = Math.max(1, Math.ceil(kickCount / 50));
      lines.push(
        `> \`--kick\`: members will be *removed from <#${source}>* afterwards (~${mins} min)`,
      );
    }

    const value = JSON.stringify({ source, dest, kick, exclude });

    await respond({
      response_type: "ephemeral",
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
              text: { type: "plain_text", text: kick ? "Confirm move" : "Confirm copy" },
              value,
            },
            {
              type: "button",
              action_id: "move_cancel",
              text: { type: "plain_text", text: "Cancel" },
              value,
            },
          ],
        },
      ],
    });
  },
};
