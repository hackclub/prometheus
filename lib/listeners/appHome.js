import {
  isGlobalAdmin,
  listGlobalAdmins,
  listAllAppointedManagers,
  listAllChannelBans,
  removeChannelBan,
  addGlobalAdmin,
  removeGlobalAdmin,
  addAppointedManager,
  removeAppointedManager,
} from "../db.js";
import { logAdmin } from "../logger.js";

export const event = "app_home_opened";

// --- block builders ---

const hdr = (text) => ({ type: "header", text: { type: "plain_text", text } });
const md = (text) => ({ type: "section", text: { type: "mrkdwn", text } });
const divider = { type: "divider" };
const ctx = (text) => ({ type: "context", elements: [{ type: "mrkdwn", text }] });

function adminBlocks(admins) {
  const blocks = [hdr("Global Admins")];
  if (!admins.length) {
    blocks.push(md("_No global admins yet_"));
  } else {
    for (const a of admins) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `<@${a.user_id}>` },
        accessory: {
          type: "button",
          text: { type: "plain_text", text: "Remove" },
          style: "danger",
          action_id: `home_remove_admin_${a.user_id}`,
          confirm: {
            title: { type: "plain_text", text: "Remove Admin?" },
            text: { type: "plain_text", text: `Strip global admin from this user?` },
            confirm: { type: "plain_text", text: "Do it" },
            deny: { type: "plain_text", text: "Nah" },
          },
        },
      });
    }
  }
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "Add Global Admin" },
        action_id: "home_add_admin",
      },
    ],
  });
  return blocks;
}

function channelRoleBlocks(managers) {
  const blocks = [hdr("Channel Roles")];
  if (!managers.length) {
    blocks.push(md("_No channel roles assigned. The channels govern themselves... somehow._"));
  } else {
    const byChannel = {};
    for (const m of managers) {
      (byChannel[m.channel_id] ||= []).push(m);
    }
    for (const [ch, members] of Object.entries(byChannel)) {
      blocks.push(md(`*<#${ch}>*`));
      for (const m of members) {
        const emoji = m.role === "manager" ? ":baldfols:" : ":bonk:";
        blocks.push({
          type: "section",
          text: { type: "mrkdwn", text: `${emoji} <@${m.user_id}> — _${m.role}_` },
          accessory: {
            type: "button",
            text: { type: "plain_text", text: "Remove" },
            style: "danger",
            action_id: `home_remove_chrole_${m.user_id}_${m.channel_id}`,
            confirm: {
              title: { type: "plain_text", text: "Remove Channel Role?" },
              text: { type: "plain_text", text: `Remove this user's role in this channel?` },
              confirm: { type: "plain_text", text: "Yeet them" },
              deny: { type: "plain_text", text: "Keep them" },
            },
          },
        });
      }
    }
  }
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "Add Channel Role" },
        action_id: "home_add_chrole",
      },
    ],
  });
  return blocks;
}

function banBlocks(bans) {
  const blocks = [hdr("Channel Timeouts")];
  if (!bans.length) {
    blocks.push(md("_No active timeouts. Peace reigns... for now._"));
  } else {
    const byChannel = {};
    for (const b of bans) {
      (byChannel[b.channel_id] ||= []).push(b);
    }
    for (const [ch, entries] of Object.entries(byChannel)) {
      blocks.push(md(`*<#${ch}>*`));
      for (const b of entries) {
        const expiry = b.expires
          ? `expires <!date^${b.expires}^{date_short_pretty} at {time}|${new Date(b.expires * 1000).toUTCString()}>`
          : "permanent";
        const reason = b.reason ? ` — _${b.reason}_` : "";
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `:bonk: <@${b.user_id}> timed out by <@${b.banned_by}> (${expiry})${reason}`,
          },
          accessory: {
            type: "button",
            text: { type: "plain_text", text: "Remove Timeout" },
            style: "danger",
            action_id: `home_unban_${b.user_id}_${b.channel_id}`,
            confirm: {
              title: { type: "plain_text", text: "Remove Timeout?" },
              text: {
                type: "plain_text",
                text: `Remove the timeout on this user in this channel?`,
              },
              confirm: { type: "plain_text", text: "Remove" },
              deny: { type: "plain_text", text: "Keep timed out" },
            },
          },
        });
      }
    }
  }
  return blocks;
}

function buildHome() {
  return [
    md(
      "_Welcome to the :prometheus: Prometheus dashboard. You see this because you're one of the cool ones._",
    ),
    divider,
    ...adminBlocks(listGlobalAdmins()),
    divider,
    ...channelRoleBlocks(listAllAppointedManagers()),
    divider,
    ...banBlocks(listAllChannelBans()),
  ];
}

const normie = [
  md("Nothing to see here, move along! :eyes:"),
  ctx("_If you think you should have access, complain to someone important._"),
];

export default async function ({ event: ev, client }) {
  if (ev.tab !== "home") return;
  console.log(`[home] app home opened by ${ev.user} (admin: ${isGlobalAdmin(ev.user)})`);
  const blocks = isGlobalAdmin(ev.user) ? buildHome() : normie;
  try {
    await client.views.publish({ user_id: ev.user, view: { type: "home", blocks } });
  } catch (e) {
    console.error("[home] views.publish failed:", e.data || e.message);
  }
}

async function refreshHome(client, userId) {
  if (!isGlobalAdmin(userId)) return;
  await client.views.publish({ user_id: userId, view: { type: "home", blocks: buildHome() } });
}

export const actions = [
  {
    pattern: /^home_remove_admin_(.+)$/,
    async execute({ action, body, client }) {
      if (!isGlobalAdmin(body.user.id)) return;
      const target = action.action_id.match(/^home_remove_admin_(.+)$/)[1];
      console.log(`[home] ${body.user.id} removed global admin ${target}`);
      removeGlobalAdmin(target);
      logAdmin(client, {
        action: `removed <@${target}> as global admin`,
        adminUser: body.user.id,
        channel: "global",
        detail: "via App Home",
      });
      await refreshHome(client, body.user.id);
    },
  },
  {
    pattern: /^home_remove_chrole_(.+?)_(.+)$/,
    async execute({ action, body, client }) {
      if (!isGlobalAdmin(body.user.id)) return;
      const [, uid, ch] = action.action_id.match(/^home_remove_chrole_(.+?)_(.+)$/);
      console.log(`[home] ${body.user.id} removed channel role for ${uid} in ${ch}`);
      removeAppointedManager(uid, ch);
      logAdmin(client, {
        action: `removed <@${uid}> from channel roles`,
        adminUser: body.user.id,
        channel: ch,
        detail: "via App Home",
      });
      await refreshHome(client, body.user.id);
    },
  },
  {
    pattern: /^home_unban_(.+?)_(.+)$/,
    async execute({ action, body, client }) {
      if (!isGlobalAdmin(body.user.id)) return;
      const [, uid, ch] = action.action_id.match(/^home_unban_(.+?)_(.+)$/);
      console.log(`[home] ${body.user.id} unbanned ${uid} from ${ch}`);
      removeChannelBan(uid, ch);
      await refreshHome(client, body.user.id);
    },
  },
  {
    actionId: "home_add_admin",
    async execute({ body, client }) {
      if (!isGlobalAdmin(body.user.id)) return;
      await client.views.open({
        trigger_id: body.trigger_id,
        view: {
          type: "modal",
          callback_id: "home_add_admin_modal",
          title: { type: "plain_text", text: "Add Global Admin" },
          submit: { type: "plain_text", text: "Add" },
          blocks: [
            {
              type: "input",
              block_id: "user_block",
              label: { type: "plain_text", text: "User" },
              element: { type: "users_select", action_id: "user_select" },
            },
          ],
          private_metadata: body.user.id,
        },
      });
    },
  },
  {
    actionId: "home_add_chrole",
    async execute({ body, client }) {
      if (!isGlobalAdmin(body.user.id)) return;
      await client.views.open({
        trigger_id: body.trigger_id,
        view: {
          type: "modal",
          callback_id: "home_add_chrole_modal",
          title: { type: "plain_text", text: "Add Channel Role" },
          submit: { type: "plain_text", text: "Add" },
          blocks: [
            {
              type: "input",
              block_id: "user_block",
              label: { type: "plain_text", text: "User" },
              element: { type: "users_select", action_id: "user_select" },
            },
            {
              type: "input",
              block_id: "channel_block",
              label: { type: "plain_text", text: "Channel" },
              element: { type: "channels_select", action_id: "channel_select" },
            },
            {
              type: "input",
              block_id: "role_block",
              label: { type: "plain_text", text: "Role" },
              element: {
                type: "static_select",
                action_id: "role_select",
                options: [
                  { text: { type: "plain_text", text: "Moderator" }, value: "moderator" },
                  { text: { type: "plain_text", text: "Manager" }, value: "manager" },
                ],
                initial_option: {
                  text: { type: "plain_text", text: "Moderator" },
                  value: "moderator",
                },
              },
            },
          ],
          private_metadata: body.user.id,
        },
      });
    },
  },
];

export const views = [
  {
    callbackId: "home_add_admin_modal",
    async handleView({ view, body, client }) {
      if (!isGlobalAdmin(body.user.id)) return;
      const invoker = body.user.id;
      const target = view.state.values.user_block.user_select.selected_user;
      console.log(`[home] ${invoker} added global admin ${target}`);
      addGlobalAdmin(target, invoker);
      logAdmin(client, {
        action: `added <@${target}> as global admin`,
        adminUser: invoker,
        channel: "global",
        detail: "via App Home",
      });
      await refreshHome(client, invoker);
    },
  },
  {
    callbackId: "home_add_chrole_modal",
    async handleView({ view, body, client }) {
      if (!isGlobalAdmin(body.user.id)) return;
      const invoker = body.user.id;
      const v = view.state.values;
      const uid = v.user_block.user_select.selected_user;
      const ch = v.channel_block.channel_select.selected_channel;
      const role = v.role_block.role_select.selected_option.value;
      console.log(`[home] ${invoker} added ${uid} as ${role} in ${ch}`);
      addAppointedManager(uid, ch, invoker, role);
      logAdmin(client, {
        action: `added <@${uid}> as channel ${role}`,
        adminUser: invoker,
        channel: ch,
        detail: "via App Home",
      });
      await refreshHome(client, invoker);
    },
  },
];
