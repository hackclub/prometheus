import {
  countPostingGateAcceptances,
  disablePostingGate,
  getPostingGate,
  resetPostingGateAcceptance,
  setPostingGate,
} from "../db.js";
import { logAdmin } from "../logger.js";
import { canManage } from "../perms.js";
import { escapeMrkdwn } from "../postingGate.js";

const eph = (text) => ({ response_type: "ephemeral", text });
const usage = () =>
  eph(
    "Usage: `/pro gate set button [explanation]`, `/pro gate set phrase [required phrase]`, `/pro gate status`, `/pro gate reset [@user|all]`, or `/pro gate disable`",
  );
const parseUser = (text) => text?.match(/^<@([A-Z0-9]+)(?:\|[^>]+)?>$/)?.[1];
const stripQuotes = (text) => {
  const trimmed = text.trim();
  const pairs = [
    ['"', '"'],
    ["'", "'"],
    ["“", "”"],
  ];
  const pair = pairs.find(([start, end]) => trimmed.startsWith(start) && trimmed.endsWith(end));
  return pair && trimmed.length >= 2 ? trimmed.slice(1, -1).trim() : trimmed;
};

async function ensureBotMembership(client, channelId) {
  try {
    const info = await client.conversations.info({ channel: channelId });
    if (info.channel?.is_member) return;
  } catch {
    // pub channel can still be joinable even when the init lookup fails
  }

  try {
    await client.conversations.join({ channel: channelId });
  } catch {
    throw new Error("Add Prometheus to this channel before enabling this!");
  }
}

function phraseModal(channelId, gate) {
  const details = gate?.mode === "phrase" ? gate.prompt : "";
  const phrase = gate?.mode === "phrase" ? gate.phrase : "";
  return {
    type: "modal",
    callback_id: "posting_gate_phrase_modal",
    private_metadata: JSON.stringify({ channel: channelId }),
    title: { type: "plain_text", text: "Phrase posting gate" },
    submit: { type: "plain_text", text: "Save gate" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "posting_gate_details",
        optional: true,
        label: { type: "plain_text", text: "Channel purpose and rules" },
        hint: { type: "plain_text", text: "Shown privately before the required phrase." },
        element: {
          type: "plain_text_input",
          action_id: "details",
          multiline: true,
          max_length: 2000,
          ...(details ? { initial_value: details } : {}),
        },
      },
      {
        type: "input",
        block_id: "posting_gate_phrase",
        label: { type: "plain_text", text: "Exact phrase" },
        hint: { type: "plain_text", text: "Members must type this before they can post." },
        element: {
          type: "plain_text_input",
          action_id: "phrase",
          max_length: 500,
          placeholder: { type: "plain_text", text: "Yes, these rules make sense" },
          ...(phrase ? { initial_value: phrase } : {}),
        },
      },
    ],
  };
}

async function savePhraseGate({ body, view, client, context, logger }) {
  const { channel } = JSON.parse(view.private_metadata);
  const userId = body.user.id;
  if (!(await canManage(context.userClient, userId, channel))) {
    logger.warn(`${userId} denied for posting_gate_phrase_modal in ${channel}`);
    return;
  }

  await ensureBotMembership(client, channel);
  const details = view.state.values.posting_gate_details.details.value?.trim() || "";
  const phrase = view.state.values.posting_gate_phrase.phrase.value.trim();
  if (!phrase) return;

  await setPostingGate(channel, "phrase", details, phrase, userId);
  logAdmin(client, {
    action: "set the posting gate to phrase mode",
    adminUser: userId,
    channel,
    detail: escapeMrkdwn(`${details ? `${details}\n` : ""}Required phrase: ${phrase}`),
  }).catch((error) => logger.warn(`posting gate audit failed: ${error.message}`));

  await client.chat
    .postEphemeral({
      channel,
      user: userId,
      text: `:okay-1: Members must type this before posting:\n> ${escapeMrkdwn(phrase)}`,
    })
    .catch((error) => logger.warn(`posting gate confirmation failed: ${error.message}`));
}

export const views = [{ callbackId: "posting_gate_phrase_modal", handleView: savePhraseGate }];

export default {
  name: "gate",
  description: "Require an action before members can post",

  async execute({ command, args, respond, client, context, logger }) {
    const channelId = command.channel_id;
    const userId = command.user_id;

    if (!(await canManage(context.userClient, userId, channelId))) {
      return respond(eph(":loll: You do not have permission to manage this channel's gate."));
    }

    const [action, mode, ...rest] = args;

    if (action === "set") {
      if (!["button", "phrase"].includes(mode)) return respond(usage());
      await ensureBotMembership(client, channelId);

      let prompt = "Before posting, confirm that you understand this channel's purpose.";
      let phrase = null;
      const input = rest.join(" ").trim();

      if (mode === "button") {
        if (input) prompt = input;
        if (prompt.length > 2000)
          return respond(eph(":red-x: The explanation must be under 2,000 characters."));
      } else {
        if (!input) {
          const gate = await getPostingGate(channelId);
          await client.views.open({
            trigger_id: command.trigger_id,
            view: phraseModal(channelId, gate),
          });
          return;
        }
        prompt = "";
        phrase = stripQuotes(input);
        if (!phrase) return respond(eph(":red-x: Provide the phrase members must type."));
        if (phrase.length > 500)
          return respond(eph(":red-x: Keep the phrase under 500 characters."));
      }

      await setPostingGate(channelId, mode, prompt, phrase, userId);
      logAdmin(client, {
        action: `set the posting gate to ${mode} mode`,
        adminUser: userId,
        channel: channelId,
        detail: escapeMrkdwn(mode === "phrase" ? phrase : prompt),
      }).catch((error) => logger.warn(`posting gate audit failed: ${error.message}`));

      return respond(
        eph(
          mode === "button"
            ? `:okay-1: Members must click *I agree* before posting in <#${channelId}>.`
            : `:okay-1: Members must type this before posting in <#${channelId}>:\n> ${escapeMrkdwn(phrase)}`,
        ),
      );
    }

    if (action === "status") {
      const gate = await getPostingGate(channelId);
      if (!gate)
        return respond(
          eph("No gate has been configured for this channel, so members can post freely."),
        );
      const accepted = await countPostingGateAcceptances(channelId);
      const details =
        gate.mode === "phrase" && gate.prompt
          ? `\nChannel information:\n> ${escapeMrkdwn(gate.prompt).replaceAll("\n", "\n> ")}`
          : "";
      return respond(
        eph(
          `*Posting gate for <#${channelId}>*\nStatus: ${gate.enabled ? "enabled" : "disabled"}\nMode: \`${gate.mode}\`\nAccepted members: ${accepted}${details}${gate.phrase ? `\nRequired phrase:\n> ${escapeMrkdwn(gate.phrase)}` : `\nExplanation:\n> ${escapeMrkdwn(gate.prompt)}`}`,
        ),
      );
    }

    if (action === "reset") {
      const target = mode;
      const targetUser = parseUser(target);
      if (target !== "all" && !targetUser) return respond(usage());
      const count = await resetPostingGateAcceptance(channelId, targetUser);
      return respond(
        eph(
          targetUser
            ? count
              ? `:okay-1: <@${targetUser}> must acknowledge the gate again.`
              : `<@${targetUser}> had not acknowledged this gate.`
            : `:okay-1: Reset ${count} acknowledgement${count === 1 ? "" : "s"}.`,
        ),
      );
    }

    if (action === "disable") {
      if (!(await disablePostingGate(channelId))) {
        return respond(eph("No enabled posting gate exists for this channel."));
      }
      logAdmin(client, {
        action: "disabled the posting gate",
        adminUser: userId,
        channel: channelId,
      }).catch((error) => logger.warn(`posting gate audit failed: ${error.message}`));
      return respond(eph(`:okay-1: Posting gate disabled for <#${channelId}>.`));
    }

    return respond(usage());
  },
};
