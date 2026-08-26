import { getPostingGateForUser, getwelcome } from "../db.js";
import { canManage } from "../perms.js";
import { postPostingGatePrompt } from "../postingGate.js";

export const event = "member_joined_channel";

export default async function welcomeListener({ event: ev, client, context, logger }) {
  const [jm, gate] = await Promise.all([
    getwelcome(ev.channel),
    getPostingGateForUser(ev.channel, ev.user),
  ]);
  if (!jm && !gate) return;

  const gateApplies =
    gate && !gate.accepted && !(await canManage(context.userClient, ev.user, ev.channel));

  if (jm?.mode === "dm") {
    console.log(`[joinmessage] sending dm welcome to ${ev.user} in ${ev.channel}`);
    try {
      const dm = await client.conversations.open({ users: ev.user });
      await client.chat.postMessage({
        channel: dm.channel.id,
        text: `Welcome to <#${ev.channel}>! ${jm.message}`,
      });
    } catch (e) {
      logger.warn(`join message dm failed: ${e.message}`);
    }
  }

  if (gateApplies) {
    console.log(`[postinggate] sending join prompt to ${ev.user} in ${ev.channel}`);
    try {
      await postPostingGatePrompt(client, ev.channel, ev.user, gate, {
        welcome: jm?.mode === "ephemeral" ? jm.message : null,
      });
    } catch (e) {
      logger.warn(`posting gate join prompt failed: ${e.data?.error ?? e.message}`);
    }
  } else if (jm?.mode === "ephemeral") {
    console.log(`[joinmessage] sending ephemeral welcome to ${ev.user} in ${ev.channel}`);
    try {
      await client.chat.postEphemeral({
        channel: ev.channel,
        user: ev.user,
        text: `Welcome to <#${ev.channel}>! ${jm.message}`,
      });
    } catch (e) {
      logger.warn(`join message ephemeral failed: ${e.message}`);
    }
  }
}
