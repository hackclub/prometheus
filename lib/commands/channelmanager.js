import { addAppointedManagers, removeAppointedManagers, listAppointedManagers } from "../db.js";
import { isGlobalAdmin } from "../perms.js";
import { logAdmin } from "../logger.js";

const ADD_USAGE = "Usage: `/pro channelmanager add @user [@user ...] [#channel ...] [manager]`";
const REMOVE_USAGE = "Usage: `/pro channelmanager remove @user [@user ...] [#channel ...]`";
const eph = (text) => ({ response_type: "ephemeral", text });
const unique = (values) => [...new Set(values)];

function parseUser(token) {
  return (
    token?.match(/^<@([UW][A-Z0-9]+)(?:\|[^>]+)?>$/)?.[1] ??
    (token?.match(/^[UW][A-Z0-9]+$/) ? token : null)
  );
}

function parseChannel(token) {
  return (
    token?.match(/^<#([CG][A-Z0-9]+)(?:\|[^>]+)?>$/)?.[1] ??
    (token?.match(/^[CG][A-Z0-9]+$/) ? token : null)
  );
}

function parseTargets(args, currentChannel, allowRole) {
  const users = [];
  const channels = [];
  const invalid = [];
  let role = "moderator";
  let explicitRole = null;

  for (const token of args) {
    const user = parseUser(token);
    const channel = parseChannel(token);
    if (user) users.push(user);
    else if (channel) channels.push(channel);
    else if (allowRole && (token === "manager" || token === "moderator")) {
      if (explicitRole && explicitRole !== token) invalid.push(token);
      explicitRole = token;
      role = token;
    } else invalid.push(token);
  }

  return {
    users: unique(users),
    channels: unique(channels.length ? channels : [currentChannel]),
    role,
    invalid,
  };
}

function mentionList(ids, type) {
  const sigil = type === "user" ? "@" : "#";
  return ids.map((id) => `<${sigil}${id}>`).join(", ");
}

async function logChanges(client, channels, details) {
  await Promise.all(
    channels.map((channel) =>
      logAdmin(client, { ...details, channel }).catch((error) => {
        console.warn(`[channelmanager] audit log failed in ${channel}: ${error.message}`);
      }),
    ),
  );
}

export default {
  name: "channelmanager",
  description: "Manage channel managers",
  async execute({ command, args, respond, client }) {
    const u = command.user_id,
      ch = command.channel_id;
    const [action, ...targetArgs] = args;

    if (!(await isGlobalAdmin(u))) {
      console.log(`[channelmanager] ${u} denied in ${ch}`);
      return respond(eph(":loll: You do not have permission! :P"));
    }

    switch (action) {
      case "add": {
        const { users, channels, role, invalid } = parseTargets(targetArgs, ch, true);
        if (!users.length || invalid.length) return respond(eph(ADD_USAGE));

        await addAppointedManagers(users, channels, u, role);
        console.log(
          `[channelmanager] ${u} added ${users.join(",")} as ${role} in ${channels.join(",")}`,
        );
        await logChanges(client, channels, {
          action: `added ${mentionList(users, "user")} as channel ${role}${users.length > 1 ? "s" : ""}`,
          adminUser: u,
        });
        const assignments = users.length * channels.length;
        return respond(
          eph(
            `:okay-1: Added ${mentionList(users, "user")} as channel ${role}${users.length > 1 ? "s" : ""} for ${mentionList(channels, "channel")} (${assignments} assignment${assignments === 1 ? "" : "s"}).`,
          ),
        );
      }
      case "remove": {
        const { users, channels, invalid } = parseTargets(targetArgs, ch, false);
        if (!users.length || invalid.length) return respond(eph(REMOVE_USAGE));

        await removeAppointedManagers(users, channels);
        console.log(`[channelmanager] ${u} removed ${users.join(",")} from ${channels.join(",")}`);
        await logChanges(client, channels, {
          action: `removed ${mentionList(users, "user")} from channel roles`,
          adminUser: u,
        });
        const assignments = users.length * channels.length;
        return respond(
          eph(
            `:okay-1: Removed ${mentionList(users, "user")} from ${mentionList(channels, "channel")} (${assignments} assignment${assignments === 1 ? "" : "s"}).`,
          ),
        );
      }
      case "list": {
        const mgrs = await listAppointedManagers(ch);
        return respond(
          eph(
            mgrs.length
              ? `*Channel roles for <#${ch}>:*
${mgrs.map((m) => `• <@${m.user_id}> — ${m.role}`).join("\n")}`
              : "No channel roles set for this channel.",
          ),
        );
      }
      default:
        return respond(
          eph(
            "Usage: `/pro channelmanager add|remove @user [@user ...] [#channel ...] [manager]`, or `/pro channelmanager list`",
          ),
        );
    }
  },
};
