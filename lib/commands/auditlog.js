import { WebClient } from "@slack/web-api";
import { getAuditLogChannel, setAuditLogChannel, removeAuditLogChannel } from "../db.js";
import { canManage } from "../perms.js";
import { logAdmin } from "../logger.js";

const eph = (text) => ({ response_type: "ephemeral", text });
const USAGE =
  "Usage: `/pro auditlog set #log-channel`, `/pro auditlog status`, `/pro auditlog off`";

let bot = null;

// The bot can only read a private channel's members (and post to it) once it has been invited,
// so a failure here doubles as the "bot is not in the log channel" check.
async function botAndMemberInChannel(logChannel, userId) {
  bot ??= new WebClient(process.env.SLACK_BOT_TOKEN);
  let cursor;
  do {
    const r = await bot.conversations.members({ channel: logChannel, limit: 1000, cursor });
    if (r.members.includes(userId)) return true;
    cursor = r.response_metadata?.next_cursor;
  } while (cursor);
  return false;
}

export default {
  name: "auditlog",
  description: "Log this channel's moderation actions to another channel",
  async execute({ command, args, respond, client, context }) {
    const u = command.user_id,
      ch = command.channel_id;

    if (!(await canManage(context.userClient, u, ch))) {
      console.log(`[auditlog] ${u} denied in ${ch}`);
      return respond(eph(":loll: You do not have permission! :P"));
    }

    const [action, target] = args;

    switch (action) {
      case "set": {
        const logChannel = target?.match(/^<#([A-Z0-9]+)(?:\|[^>]*)?>$/)?.[1];
        if (!logChannel) return respond(eph(USAGE));
        if (logChannel === ch) return respond(eph(":x: Pick a different channel to hold the log."));

        const inviteHelp = `:x: I'm not in <#${logChannel}>. Run \`/invite @Prometheus\` there, then try again.`;
        let isMember;
        try {
          isMember = await botAndMemberInChannel(logChannel, u);
        } catch (e) {
          if (e.data?.error === "channel_not_found" || e.data?.error === "not_in_channel") {
            // Public channels can be joined directly; private ones need an invite.
            try {
              await bot.conversations.join({ channel: logChannel });
              isMember = await botAndMemberInChannel(logChannel, u);
            } catch {
              return respond(eph(inviteHelp));
            }
          } else {
            throw e;
          }
        }
        if (!isMember)
          return respond(
            eph(`:x: You must be a member of <#${logChannel}> to send audit logs there.`),
          );

        await setAuditLogChannel(ch, logChannel, u);
        console.log(`[auditlog] ${u} set ${ch} -> ${logChannel}`);
        logAdmin(client, {
          action: "enabled a channel audit log",
          adminUser: u,
          channel: ch,
          detail: `Log channel: <#${logChannel}>`,
        });
        return respond(
          eph(
            `:okay-1: Moderation actions in <#${ch}> (deletes, destroyed threads, timeouts, with reasons) will be logged to <#${logChannel}>.`,
          ),
        );
      }
      case "off": {
        if (!(await getAuditLogChannel(ch)))
          return respond(eph("No audit log is set for this channel."));
        await removeAuditLogChannel(ch);
        console.log(`[auditlog] ${u} removed audit log for ${ch}`);
        logAdmin(client, { action: "disabled the channel audit log", adminUser: u, channel: ch });
        return respond(eph(`:okay-1: Audit log disabled for <#${ch}>.`));
      }
      case "status": {
        const cfg = await getAuditLogChannel(ch);
        if (!cfg) return respond(eph("No audit log is set for this channel."));
        return respond(
          eph(`Audit log for <#${ch}> goes to <#${cfg.log_channel_id}> (set by <@${cfg.set_by}>).`),
        );
      }
      default:
        return respond(eph(USAGE));
    }
  },
};
