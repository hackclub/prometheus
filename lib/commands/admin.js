import { addGlobalAdmin, removeGlobalAdmin, listGlobalAdmins } from "../db.js";
import { isGlobalAdmin } from "../perms.js";

const SUPERADMINS = (process.env.SUPERADMINS || "").split(",").filter(Boolean);
const isSuperAdmin = (id) => SUPERADMINS.includes(id);

export default {
  name: "admin",
  description: "Manage global admins",
  async execute({ command, args, respond }) {
    const userId = command.user_id;
    const [action, targetUser] = args;

    const allowed = isSuperAdmin(userId) || isGlobalAdmin(userId);
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
        addGlobalAdmin(id, userId);
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
        removeGlobalAdmin(id);
        console.log(`[admin] ${userId} removed ${id} from global admins`);
        await respond({
          response_type: "ephemeral",
          text: `:okay-1: Removed <@${id}> from global admins.`,
        });
        break;
      }
      case "list": {
        const admins = listGlobalAdmins();
        if (admins.length === 0) {
          await respond({ response_type: "ephemeral", text: "No global admins configured." });
        } else {
          const list = admins.map((a) => `• <@${a.user_id}>`).join("\n");
          await respond({ response_type: "ephemeral", text: `*Global Admins:*\n${list}` });
        }
        break;
      }
      default:
        await respond({
          response_type: "ephemeral",
          text: "Usage: `/pro admin [add|remove|list] [@user]`",
        });
    }
  },
};
