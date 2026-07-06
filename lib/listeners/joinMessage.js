import { getwelcome } from "../db.js";

export const event = "member_joined_channel";

export default async function welcomeListener({ event: ev, client, logger }) {
  const jm = getwelcome(ev.channel);
  if (!jm) return;

  console.log(`[joinmessage] sending ${jm.mode} welcome to ${ev.user} in ${ev.channel}`);
  const text = jm.message;

  if (jm.mode === "dm") {
    try {
      const dm = await client.conversations.open({ users: ev.user });
      await client.chat.postMessage({
        channel: dm.channel.id,
        text: `Welcome to <#${ev.channel}>! ${text}`,
      });
    } catch (e) {
      logger.warn(`join message dm failed: ${e.message}`);
    }
  } else {
    try {
      await client.chat.postEphemeral({
        channel: ev.channel,
        user: ev.user,
        text: `Welcome to <#${ev.channel}>! ${text}`,
      });
    } catch (e) {
      logger.warn(`join message ephemeral failed: ${e.message}`);
    }
  }
}
