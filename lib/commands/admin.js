import {
  addGlobalAdmin,
  removeGlobalAdmin,
  listGlobalAdmins,
  getDeletionDmMode,
  setDeletionDmMode,
  listDeletionDmModes,
} from "../db.js";
import { isGlobalAdmin } from "../perms.js";

const SUPERADMINS = (process.env.SUPERADMINS || "").split(",").filter(Boolean);
const isSuperAdmin = (id) => SUPERADMINS.includes(id);

const DM_MODES = {
  full: "full deletion DMs",
  nofooter: "deletion DMs without the steward footer",
  off: "no deletion DMs",
};
const DMS_USAGE = "Usage: `/pro admin dms [#channel] [full|nofooter|off]` or `/pro admin dms list`";

const parseChannel = (token) =>
  token?.match(/^<#([CG][A-Z0-9]+)(?:\|[^>]+)?>$/)?.[1] ??
  (token?.match(/^[CG][A-Z0-9]+$/) ? token : null);

export default {
  name: "admin",
  description: "Manage global admins",
  async execute({ command, args, respond, client, context }) {
    const userId = command.user_id;
    const [action, targetUser] = args;

    const allowed =
      isSuperAdmin(userId) || (await isGlobalAdmin(userId, context?.userClient ?? client));
    if (!allowed) {
      console.log(`[admin] ${userId} denied for admin command`);
      await respond({
        response_type: "ephemeral",
        text: ":loll: You do not have permission! :P",
      });
      return;
    }

    switch (action) {
      case "add": {
        if (!targetUser) {
          await respond({ response_type: "ephemeral", text: "Usage: `/pro admin add @user`" });
          return;
        }
        const id = targetUser.replace(/[<@>]/g, "").split("|")[0];
        await addGlobalAdmin(id, userId);
        console.log(`[admin] ${userId} added ${id} as global admin`);
        await respond({
          response_type: "ephemeral",
          text: `:okay-1: Added <@${id}> as global admin.`,
        });
        break;
      }
      case "remove": {
        if (!targetUser) {
          await respond({ response_type: "ephemeral", text: "Usage: `/pro admin remove @user`" });
          return;
        }
        const id = targetUser.replace(/[<@>]/g, "").split("|")[0];
        await removeGlobalAdmin(id);
        console.log(`[admin] ${userId} removed ${id} from global admins`);
        await respond({
          response_type: "ephemeral",
          text: `:okay-1: Removed <@${id}> from global admins.`,
        });
        break;
      }
      case "list": {
        const admins = await listGlobalAdmins();
        if (admins.length === 0) {
          await respond({
            response_type: "ephemeral",
            text: "No explicit global admins configured. Slack workspace admins and owners automatically have global admin permissions.",
          });
        } else {
          const list = admins.map((a) => `• <@${a.user_id}>`).join("\n");
          await respond({
            response_type: "ephemeral",
            text: `*Global Admins (explicit grants):*\n${list}\n\nSlack workspace admins and owners automatically have global admin permissions.`,
          });
        }
        break;
      }
      case "dms": {
        if (targetUser === "list") {
          const rows = await listDeletionDmModes();
          const list = rows.map((r) => `• <#${r.channel_id}>: ${DM_MODES[r.mode] ?? r.mode}`);
          await respond({
            response_type: "ephemeral",
            text: list.length
              ? `*Channels with custom deletion DMs:*\n${list.join("\n")}`
              : "Every channel sends full deletion DMs.",
          });
          return;
        }

        const rest = args.slice(1);
        const named = parseChannel(rest[0]);
        const channel = named ?? command.channel_id;
        const mode = named ? rest[1] : rest[0];

        if (!mode) {
          const current = await getDeletionDmMode(channel);
          await respond({
            response_type: "ephemeral",
            text: `<#${channel}> sends ${DM_MODES[current] ?? current}.\n${DMS_USAGE}`,
          });
          return;
        }
        if (!(mode in DM_MODES)) {
          await respond({ response_type: "ephemeral", text: DMS_USAGE });
          return;
        }

        await setDeletionDmMode(channel, mode, userId);
        console.log(`[admin] ${userId} set deletion DMs for ${channel} to ${mode}`);
        await respond({
          response_type: "ephemeral",
          text: `:okay-1: <#${channel}> now sends ${DM_MODES[mode]}.`,
        });
        break;
      }
      default:
        await respond({
          response_type: "ephemeral",
          text: `Usage: \`/pro admin [add|remove|list] [@user]\`\n${DMS_USAGE}`,
        });
    }
  },
};
