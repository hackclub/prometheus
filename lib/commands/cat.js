import { escapeMrkdwn } from "../postingGate.js";

export default {
  name: "cat",
  description: "Get a random cat fact",
  async execute({ respond }) {
    const res = await fetch("https://catfact.ninja/fact", { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`cat fact API HTTP ${res.status}`);
    const { fact } = await res.json();
    if (!fact) throw new Error("cat fact API returned no fact");
    await respond({
      response_type: "ephemeral",
      text: `:cat: ${escapeMrkdwn(fact)}`,
    });
  },
};
