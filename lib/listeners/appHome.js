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

const PAGE_SIZE = 40;

const hdr = (text) => ({ type: "header", text: { type: "plain_text", text } });
const md = (text) => ({ type: "section", text: { type: "mrkdwn", text } });
const divider = { type: "divider" };
const ctx = (text) => ({ type: "context", elements: [{ type: "mrkdwn", text }] });

function pageOf(items, requestedPage) {
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = Math.min(Math.max(Number(requestedPage) || 0, 0), pageCount - 1);
  return {
    items: items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    page,
    pageCount,
  };
}

function pageContext(total, page, pageCount) {
  if (!total) return null;
  const first = page * PAGE_SIZE + 1;
  const last = Math.min(first + PAGE_SIZE - 1, total);
  return ctx(`Showing ${first}-${last} of ${total} · Page ${page + 1} of ${pageCount}`);
}

function paginationBlocks(section, page, pageCount) {
  if (pageCount < 2) return [];
  const elements = [];
  if (page > 0) {
    elements.push({
      type: "button",
      text: { type: "plain_text", text: "Previous" },
      action_id: `home_navigate_${section}_${page - 1}`,
    });
  }
  if (page + 1 < pageCount) {
    elements.push({
      type: "button",
      text: { type: "plain_text", text: "Next" },
      action_id: `home_navigate_${section}_${page + 1}`,
    });
  }
  return [{ type: "actions", elements }];
}

function dashboardNav(section) {
  const tabs = [
    ["admins", "Global Admins"],
    ["roles", "Channel Roles"],
    ["timeouts", "Timeouts"],
  ];
  return {
    type: "actions",
    elements: tabs.map(([value, text]) => ({
      type: "button",
      text: { type: "plain_text", text },
      action_id: `home_navigate_${value}_0`,
      ...(section === value ? { style: "primary" } : {}),
    })),
  };
}

function adminBlocks(admins, requestedPage) {
  const { items, page, pageCount } = pageOf(admins, requestedPage);
  const blocks = [hdr("Global Admins")];
  const summary = pageContext(admins.length, page, pageCount);
  if (summary) blocks.push(summary);

  if (!items.length) {
    blocks.push(md("_No global admins yet_"));
  } else {
    for (const admin of items) {
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `<@${admin.user_id}>` },
        accessory: {
          type: "button",
          text: { type: "plain_text", text: "Remove" },
          style: "danger",
          action_id: `home_remove_admin_${page}_${admin.user_id}`,
          confirm: {
            title: { type: "plain_text", text: "Remove Admin?" },
            text: { type: "plain_text", text: "Strip global admin from this user?" },
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
        value: String(page),
      },
    ],
  });
  blocks.push(...paginationBlocks("admins", page, pageCount));
  return blocks;
}

function channelRoleBlocks(managers, requestedPage) {
  const { items, page, pageCount } = pageOf(managers, requestedPage);
  const blocks = [hdr("Channel Roles")];
  const summary = pageContext(managers.length, page, pageCount);
  if (summary) blocks.push(summary);

  if (!items.length) {
    blocks.push(md("_No channel roles assigned. The channels govern themselves... somehow._"));
  } else {
    let currentChannel;
    for (const manager of items) {
      if (manager.channel_id !== currentChannel) {
        currentChannel = manager.channel_id;
        blocks.push(md(`*<#${currentChannel}>*`));
      }
      const emoji = manager.role === "manager" ? ":baldfols:" : ":bonk:";
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${emoji} <@${manager.user_id}> — _${manager.role}_`,
        },
        accessory: {
          type: "button",
          text: { type: "plain_text", text: "Remove" },
          style: "danger",
          action_id: `home_remove_chrole_${page}_${manager.user_id}_${manager.channel_id}`,
          confirm: {
            title: { type: "plain_text", text: "Remove Channel Role?" },
            text: { type: "plain_text", text: "Remove this user's role in this channel?" },
            confirm: { type: "plain_text", text: "Yeet them" },
            deny: { type: "plain_text", text: "Keep them" },
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
        text: { type: "plain_text", text: "Add Channel Role" },
        action_id: "home_add_chrole",
        value: String(page),
      },
    ],
  });
  blocks.push(...paginationBlocks("roles", page, pageCount));
  return blocks;
}

function banBlocks(bans, requestedPage) {
  const { items, page, pageCount } = pageOf(bans, requestedPage);
  const blocks = [hdr("Channel Timeouts")];
  const summary = pageContext(bans.length, page, pageCount);
  if (summary) blocks.push(summary);

  if (!items.length) {
    blocks.push(md("_No active timeouts. Peace reigns... for now._"));
  } else {
    let currentChannel;
    for (const ban of items) {
      if (ban.channel_id !== currentChannel) {
        currentChannel = ban.channel_id;
        blocks.push(md(`*<#${currentChannel}>*`));
      }
      const expiry = ban.expires
        ? `expires <!date^${ban.expires}^{date_short_pretty} at {time}|${new Date(ban.expires * 1000).toUTCString()}>`
        : "permanent";
      const reason = ban.reason ? ` — _${ban.reason}_` : "";
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:bonk: <@${ban.user_id}> timed out by <@${ban.banned_by}> (${expiry})${reason}`,
        },
        accessory: {
          type: "button",
          text: { type: "plain_text", text: "Remove Timeout" },
          style: "danger",
          action_id: `home_unban_${page}_${ban.user_id}_${ban.channel_id}`,
          confirm: {
            title: { type: "plain_text", text: "Remove Timeout?" },
            text: {
              type: "plain_text",
              text: "Remove the timeout on this user in this channel?",
            },
            confirm: { type: "plain_text", text: "Remove" },
            deny: { type: "plain_text", text: "Keep timed out" },
          },
        },
      });
    }
  }

  blocks.push(...paginationBlocks("timeouts", page, pageCount));
  return blocks;
}

export function buildHomeBlocks({ admins, managers, bans }, section = "overview", page = 0) {
  const blocks = [
    md(
      "_Welcome to the :prometheus: Prometheus dashboard. You see this because you're one of the cool ones._",
    ),
    dashboardNav(section),
    divider,
  ];

  if (section === "admins") blocks.push(...adminBlocks(admins, page));
  else if (section === "roles") blocks.push(...channelRoleBlocks(managers, page));
  else if (section === "timeouts") blocks.push(...banBlocks(bans, page));
  else {
    blocks.push(
      md(
        `*${admins.length}* global admins · *${managers.length}* channel roles · *${bans.length}* active timeouts\n\nChoose a section above to manage it.`,
      ),
    );
  }

  return blocks;
}

function buildHome(section = "overview", page = 0) {
  return buildHomeBlocks(
    {
      admins: listGlobalAdmins(),
      managers: listAllAppointedManagers(),
      bans: listAllChannelBans(),
    },
    section,
    page,
  );
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

async function refreshHome(client, userId, section = "overview", page = 0) {
  if (!isGlobalAdmin(userId)) return;
  await client.views.publish({
    user_id: userId,
    view: { type: "home", blocks: buildHome(section, page) },
  });
}

function modalPage(view) {
  const page = Number(view.private_metadata);
  return Number.isInteger(page) && page >= 0 ? page : 0;
}

export const actions = [
  {
    pattern: /^home_navigate_(admins|roles|timeouts)_(\d+)$/,
    async execute({ action, body, client }) {
      if (!isGlobalAdmin(body.user.id)) return;
      const [, section, page] = action.action_id.match(
        /^home_navigate_(admins|roles|timeouts)_(\d+)$/,
      );
      await refreshHome(client, body.user.id, section, page);
    },
  },
  {
    pattern: /^home_remove_admin_(\d+)_(.+)$/,
    async execute({ action, body, client }) {
      if (!isGlobalAdmin(body.user.id)) return;
      const [, page, target] = action.action_id.match(/^home_remove_admin_(\d+)_(.+)$/);
      console.log(`[home] ${body.user.id} removed global admin ${target}`);
      removeGlobalAdmin(target);
      logAdmin(client, {
        action: `removed <@${target}> as global admin`,
        adminUser: body.user.id,
        channel: "global",
        detail: "via App Home",
      });
      await refreshHome(client, body.user.id, "admins", page);
    },
  },
  {
    pattern: /^home_remove_chrole_(\d+)_(.+?)_(.+)$/,
    async execute({ action, body, client }) {
      if (!isGlobalAdmin(body.user.id)) return;
      const [, page, uid, ch] = action.action_id.match(/^home_remove_chrole_(\d+)_(.+?)_(.+)$/);
      console.log(`[home] ${body.user.id} removed channel role for ${uid} in ${ch}`);
      removeAppointedManager(uid, ch);
      logAdmin(client, {
        action: `removed <@${uid}> from channel roles`,
        adminUser: body.user.id,
        channel: ch,
        detail: "via App Home",
      });
      await refreshHome(client, body.user.id, "roles", page);
    },
  },
  {
    pattern: /^home_unban_(\d+)_(.+?)_(.+)$/,
    async execute({ action, body, client }) {
      if (!isGlobalAdmin(body.user.id)) return;
      const [, page, uid, ch] = action.action_id.match(/^home_unban_(\d+)_(.+?)_(.+)$/);
      console.log(`[home] ${body.user.id} unbanned ${uid} from ${ch}`);
      removeChannelBan(uid, ch);
      await refreshHome(client, body.user.id, "timeouts", page);
    },
  },
  {
    actionId: "home_add_admin",
    async execute({ action, body, client }) {
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
          private_metadata: action.value,
        },
      });
    },
  },
  {
    actionId: "home_add_chrole",
    async execute({ action, body, client }) {
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
          private_metadata: action.value,
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
      await refreshHome(client, invoker, "admins", modalPage(view));
    },
  },
  {
    callbackId: "home_add_chrole_modal",
    async handleView({ view, body, client }) {
      if (!isGlobalAdmin(body.user.id)) return;
      const invoker = body.user.id;
      const values = view.state.values;
      const uid = values.user_block.user_select.selected_user;
      const ch = values.channel_block.channel_select.selected_channel;
      const role = values.role_block.role_select.selected_option.value;
      console.log(`[home] ${invoker} added ${uid} as ${role} in ${ch}`);
      addAppointedManager(uid, ch, invoker, role);
      logAdmin(client, {
        action: `added <@${uid}> as channel ${role}`,
        adminUser: invoker,
        channel: ch,
        detail: "via App Home",
      });
      await refreshHome(client, invoker, "roles", modalPage(view));
    },
  },
];
