import { escapeMrkdwn } from "../postingGate.js";

const COOLDOWN_MS = 3000;
const FETCH_TIMEOUT_MS = 5000;

const lastUsedAt = new Map();

const MSG_COOLDOWN = "PLACEHOLDER_COOLDOWN";
const MSG_ERROR = "PLACEHOLDER_ERROR";

async function fetchCatFact() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch("https://catfact.ninja/fact", { signal: controller.signal });
    if (!res.ok) throw new Error(`cat fact API HTTP ${res.status}`);

    const json = await res.json();
    if (!json.fact) throw new Error("cat fact API returned no fact");
    return json.fact;
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  name: "cat",
  description: "Get a random cat fact",

  async execute({ command: cmd, respond }) {
    const err = (text) => respond({ response_type: "ephemeral", text });

    const now = Date.now();
    const last = lastUsedAt.get(cmd.user_id);
    if (last && now - last < COOLDOWN_MS) return err(MSG_COOLDOWN);
    lastUsedAt.set(cmd.user_id, now);

    try {
      const fact = await fetchCatFact();
      console.log(`[cat] ${cmd.user_id} got a cat fact`);
      await respond({
        response_type: "ephemeral",
        text: `:cat: ${escapeMrkdwn(fact)}`,
      });
    } catch (e) {
      console.log(`[cat] error: ${e.message}`);
      return err(MSG_ERROR);
    }
  },
};
