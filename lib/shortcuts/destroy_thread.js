import { canManage } from "../perms.js";
import { purge } from "../purge.js";
import { hideThread, lockThread, unlockThread, areWeEnterprise } from "../moderation.js";
import { fdReportNuke } from "../fd.js";

const txt = (text) => ({ type: "plain_text", text, emoji: true });
const opt = (text, value) => ({ text: txt(text), value });

const hideOpt = opt("Hide Thread (tombstone)", "hide");
const deleteOpt = opt("Fully Delete (permanent)", "delete");

const fdOption = {
  text: txt("Send this message to Fire Department"),
  description: txt("Escalate this thread destruction to fd"),
  value: "fd",
};

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

function signoff() {
  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*Are you like 100% sure you want to do this?* Once you start, there is no going back.",
      },
    },
  ];

  if (areWeEnterprise) {
    blocks.push({
      type: "input",
      block_id: "destroy_mode",
      label: txt("Destruction method"),
      element: {
        type: "static_select",
        action_id: "destroy_mode_select",
        initial_option: hideOpt,
        options: [hideOpt, deleteOpt],
      },
      hint: txt(
        "Thanks to the power of Slack's moderation tools, you can choose to hide the thread (tombstone) or perform a full delete (permanent).",
      ),
    });
  }

  blocks.push({
    type: "input",
    block_id: "reason",
    optional: false,
    label: txt("Reason"),
    element: {
      type: "plain_text_input",
      action_id: "reason_input",
      multiline: true,
      placeholder: txt("Why are you destroying this thread?"),
    },
    hint: txt("This will be recorded in the audit log"),
  });

  blocks.push({
    type: "input",
    block_id: "fd",
    optional: true,
    label: txt("Escalation"),
    element: {
      type: "checkboxes",
      action_id: "fd_checkbox",
      options: [fdOption],
    },
  });

  return blocks;
}

export default {
  callbackId: "destroy_thread",
  viewCallbackId: "destroy_thread_confirm",

  async execute({ shortcut: s, client, context, logger }) {
    const open = (view) => client.views.open({ trigger_id: s.trigger_id, view });

    if (!(await canManage(context.userClient, s.user.id, s.channel.id))) {
      logger.warn(`${s.user.id} denied for destroy_thread`);
      return open(noPermsModal());
    }

    await open({
      type: "modal",
      title: txt("Hold up!"),
      close: txt("Abort!"),
      submit: txt("I am sure!"),
      callback_id: "destroy_thread_confirm",
      private_metadata: JSON.stringify({
        channel: s.channel.id,
        messageTs: s.message.ts,
        threadTs: s.message.thread_ts || s.message.ts,
      }),
      blocks: signoff(),
    });
  },

  async handleView({ view, body, context, logger }) {
    const { channel, threadTs } = JSON.parse(view.private_metadata);
    const uid = body.user.id;

    if (!(await canManage(context.userClient, uid, channel))) {
      logger.warn(`${uid} denied for destroy_thread handleView`);
      return;
    }

    const mode =
      view.state?.values?.destroy_mode?.destroy_mode_select?.selected_option?.value || "delete";
    const reason = view.state?.values?.reason?.reason_input?.value?.trim() || "";
    const sendToFD = (view.state?.values?.fd?.fd_checkbox?.selected_options || []).some(
      (o) => o.value === "fd",
    );

    logger.info(
      `destroy_thread: mode=${mode} channel=${channel} threadTs=${threadTs} by=${uid} reason=${reason} fd=${sendToFD}`,
    );

    let locked = false;
    if (areWeEnterprise) {
      try {
        await lockThread(channel, threadTs);
        locked = true;
      } catch (err) {
        logger.warn(
          `destroy_thread: failed to lock thread ${threadTs} in ${channel}: ${err.message}`,
        );
      }
    }

    let destroySucceeded = false;
    try {
      if (mode === "hide") {
        await hideThread(channel, threadTs);
        logger.info(`destroy_thread: thread ${threadTs} hidden in ${channel} by ${uid}`);
      } else {
        await purge(context.userClient, logger, channel, threadTs, uid);
      }
      destroySucceeded = true;
    } finally {
      if (locked && (mode === "hide" || !destroySucceeded)) {
        try {
          await unlockThread(channel, threadTs);
        } catch (err) {
          logger.warn(
            `destroy_thread: failed to unlock thread ${threadTs} in ${channel}: ${err.message}`,
          );
        }
      }
    }

    if (sendToFD) {
      await fdReportNuke(context.userClient, { channel, threadTs, mode, destroyedBy: uid, reason });
    }
  },
};
