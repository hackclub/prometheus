import { isMoveOptedOut, setMoveOptOut } from "../db.js";

const txt = (text) => ({ type: "plain_text", text });
const eph = (text) => ({ response_type: "ephemeral", text });

const MOVE_OPTION = {
  text: txt("Allow bulk moves to add me to channels"),
  description: txt("Channel managers can move members between channels in bulk."),
  value: "moves",
};

function buildSettingsModalView({ channel, movesAllowed }) {
  return {
    type: "modal",
    callback_id: "user_settings_modal",
    private_metadata: JSON.stringify({ channel }),
    title: txt("Settings"),
    submit: txt("Save"),
    close: txt("Cancel"),
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: "Choose how Prometheus can add you to channels." },
      },
      {
        type: "input",
        block_id: "move_settings",
        optional: true,
        label: txt("Moves"),
        element: {
          type: "checkboxes",
          action_id: "value",
          options: [MOVE_OPTION],
          ...(movesAllowed ? { initial_options: [MOVE_OPTION] } : {}),
        },
      },
    ],
  };
}

async function notify(client, channel, userId, text) {
  try {
    await client.chat.postEphemeral({ channel, user: userId, text });
  } catch {
    try {
      await client.chat.postMessage({ channel: userId, text });
    } catch {}
  }
}

async function handleSettingsView({ view, body, client, logger }) {
  const userId = body.user.id;
  const { channel } = JSON.parse(view.private_metadata);
  const selected = view.state.values.move_settings.value.selected_options ?? [];
  const movesAllowed = selected.some((o) => o.value === "moves");

  setMoveOptOut(userId, !movesAllowed);
  console.log(`[settings] ${userId} set move opt-out to ${!movesAllowed}`);

  await notify(
    client,
    channel,
    userId,
    movesAllowed
      ? "Settings saved. Bulk moves can add you to channels."
      : "Settings saved. Bulk moves will skip you.",
  );
  logger.info(`settings saved for ${userId}: moves ${movesAllowed ? "on" : "off"}`);
}

export default {
  name: "settings",
  description: "Manage your personal Prometheus settings",

  async execute({ command: cmd, args, respond, client }) {
    const [setting, state] = args;

    if (!setting) {
      await client.views.open({
        trigger_id: cmd.trigger_id,
        view: buildSettingsModalView({
          channel: cmd.channel_id,
          movesAllowed: !isMoveOptedOut(cmd.user_id),
        }),
      });
      return;
    }

    if (setting !== "move" || !["on", "off"].includes(state)) {
      return respond(eph("`/pro settings` or `/pro settings move on|off`"));
    }

    const enabled = state === "on";
    setMoveOptOut(cmd.user_id, !enabled);
    console.log(`[settings] ${cmd.user_id} set move opt-out to ${!enabled}`);
    await respond(
      eph(
        enabled
          ? "Turned bulk moves *on* for you. Moves can add you to channels."
          : "Turned bulk moves *off* for you. Moves will skip you.",
      ),
    );
  },
};

export const views = [{ callbackId: "user_settings_modal", handleView: handleSettingsView }];
