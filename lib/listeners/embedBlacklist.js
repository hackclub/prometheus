export const event = "message";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function messageSentListener({ event, client }) {
  if (!event?.user) return;

  if (event.subtype) return;

  console.log(
    `message sent by ${event.user} in ${event.channel}: ${event.text || ""}`,
  );

  console.log(event);

  for (const delay of [1500, 5000, 10000]) {
    await sleep(delay);
    // fetch message and check attachments

    const result = await client.conversations.history({
      channel: event.channel,
      latest: event.ts,
      inclusive: true,
      limit: 1,
    });
    console.log(result);
  }
}
