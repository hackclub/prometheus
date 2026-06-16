import { addAppointedManager, removeAppointedManager, listAppointedManagers } from '../db.js';
import { isGlobalAdmin } from '../perms.js';
import { logAdmin } from '../logger.js';

const parseUser = (s) => s?.replace(/[<@>]/g, '').split('|')[0];
const eph = (text) => ({ response_type: 'ephemeral', text });

export default {
  name: 'communitysteward',
  description: 'Manage channel managers',
  async execute({ command, args, respond, client }) {
    const u = command.user_id, ch = command.channel_id;
    const [action, target] = args;

    if (!isGlobalAdmin(u)) {
      console.log(`[communitysteward] ${u} denied in ${ch}`);
      return respond(eph(':loll: You do not have permission! :P'));
    }

    switch (action) {
      case 'add': {
        const id = parseUser(target);
        if (!id) return respond(eph('Usage: `/pro communitysteward add @user [manager]`'));
        const role = args[2] === 'manager' ? 'manager' : 'moderator';
        addAppointedManager(id, ch, u, role);
        console.log(`[communitysteward] ${u} added ${id} as ${role} in ${ch}`);
        logAdmin(client, { action: `added <@${id}> as channel ${role}`, adminUser: u, channel: ch });
        return respond(eph(`:okay-1: Added <@${id}> as channel ${role} for <#${ch}>.`));
      }
      case 'remove': {
        const id = parseUser(target);
        if (!id) return respond(eph('Usage: `/pro communitysteward remove @user`'));
        removeAppointedManager(id, ch);
        console.log(`[communitysteward] ${u} removed ${id} from ${ch}`);
        logAdmin(client, { action: `removed <@${id}> from channel roles`, adminUser: u, channel: ch });
        return respond(eph(`:okay-1: Removed <@${id}> from <#${ch}>.`));
      }
      case 'list': {
        const mgrs = listAppointedManagers(ch);
        return respond(eph(mgrs.length
          ? `*Channel roles for <#${ch}>:*\n${mgrs.map(m => `• <@${m.user_id}> — ${m.role}`).join('\n')}`
          : 'No channel roles set for this channel.'));
      }
      default:
        return respond(eph('Usage: `/pro communitysteward [add|remove|list] [@user] [manager]`'));
    }
  }
};
