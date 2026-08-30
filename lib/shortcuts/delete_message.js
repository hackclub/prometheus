import { canManage } from "../perms.js";
import { RateLimiter } from "../ratelimiter.js";
import { logDelete, notifyDeletion } from "../logger.js";
import { publicLogDelete } from "../public-logger.js";
import { fdReportDelete } from "../fd.js";

const rateLimiter = new RateLimiter(1000, 5);

const txt = (text) => ({ type: "plain_text", text, emoji: true });

function noPermsModal() {
  return {
    type: "modal",
    title: txt("Aw, Snap!"),
    close: txt("Close"),
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: ":red-x: *You do not have permission to do this!* Only channel managers are able to use this bot. Try it again in a channel you manage.",
        },
      },
    ],
  };
}

const fdOption = {
  text: txt("Send this message to Fire Department"),
  description: txt("Escalate this deletion to fd"),
  value: "fd",
};

const silentOption = {
  text: txt("Do not notify the user"),
  description: txt("Use this if you would rather reach out to them yourself"),
  value: "silent",
};

function reasonModal({ channel, message }) {
  return {
    type: "modal",
    callback_id: "delete_message_confirm",
    title: txt("Delete Message"),
    submit: txt("Delete"),
    close: txt("Cancel"),
    private_metadata: JSON.stringify({
      channel,
      ts: message.ts,
      user: message.user || null,
      text: (message.text || "").slice(0, 2000),
    }),
    blocks: [
      {
        type: "input",
        block_id: "reason",
        optional: false,
        label: txt("Reason"),
        element: {
          type: "plain_text_input",
          action_id: "reason_input",
          multiline: true,
          placeholder: txt("Why are you deleting this message?"),
        },
        hint: txt(
          "This will be recorded in the audit log and, unless you turn off the DM below, sent to the user who wrote the message.",
        ),
      },
      {
        type: "input",
        block_id: "fd",
        optional: true,
        label: txt("Escalation"),
        element: {
          type: "checkboxes",
          action_id: "fd_checkbox",
          options: [fdOption],
        },
      },
      {
        type: "input",
        block_id: "silent",
        optional: true,
        label: txt("Notification"),
        element: {
          type: "checkboxes",
          action_id: "silent_checkbox",
          options: [silentOption],
        },
      },
    ],
  };
}

export default {
  callbackId: "delete_message",
  viewCallbackId: "delete_message_confirm",

  async execute({ shortcut, client, context, logger }) {
    if (!(await canManage(context.userClient, shortcut.user.id, shortcut.channel.id))) {
      logger.warn(`${shortcut.user.id} denied for delete_message`);
      await client.views.open({ trigger_id: shortcut.trigger_id, view: noPermsModal() });
      return;
    }

    await client.views.open({
      trigger_id: shortcut.trigger_id,
      view: reasonModal({ channel: shortcut.channel.id, message: shortcut.message }),
    });
  },

  async handleView({ view, body, client, context, logger }) {
    const meta = JSON.parse(view.private_metadata);
    const channel = meta.channel;
    const deletedBy = body.user.id;

    if (!(await canManage(context.userClient, deletedBy, channel))) {
      logger.warn(`${deletedBy} denied for delete_message handleView`);
      return;
    }

    const reason = view.state?.values?.reason?.reason_input?.value?.trim() || "";
    const sendToFD = (view.state?.values?.fd?.fd_checkbox?.selected_options || []).some(
      (o) => o.value === "fd",
    );
    const silent = (view.state?.values?.silent?.silent_checkbox?.selected_options || []).some(
      (o) => o.value === "silent",
    );

    const message = { ts: meta.ts, user: meta.user, text: meta.text };

    try {
      const tasks = [
        logDelete(client, { channel, message, deletedBy, reason, silent }),
        publicLogDelete(client, { channel, deletedBy }),
      ];

      if (sendToFD) {
        tasks.push(fdReportDelete(context.userClient, { channel, message, deletedBy, reason }));
      }
      await Promise.all(tasks);

      await rateLimiter.exec(async () => {
        await context.userClient.chat.delete({ channel, ts: meta.ts });
      });

      if (!silent && message.user && message.user !== deletedBy) {
        await notifyDeletion(client, { channel, message, reason }).catch((e) => {
          logger.warn(`delete_message notify failed: ${e.message}`);
        });
      }

      logger.info(
        `delete_message done ${meta.ts} reason=${reason} fd=${sendToFD} silent=${silent}`,
      );
    } catch (error) {
      logger.error(`delete_message error deleting ${meta.ts}: ${error.message}`);
    }
  },
};
