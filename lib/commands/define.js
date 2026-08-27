import { escapeMrkdwn } from "../postingGate.js";

const MAX_TERM_LENGTH = 50;
const COOLDOWN_MS = 3000;
const FETCH_TIMEOUT_MS = 5000;
const MAX_DEFINITIONS = 3;

const lastUsedAt = new Map();

const MSG_USAGE = ":red-x: What am I defining? Try `/pro define <word>`";
const MSG_TOO_LONG = ":red-x: That's not a word, that's a paragraph.";
const MSG_COOLDOWN = ":red-x: Slow down — try again in a few seconds.";
const MSG_NOT_FOUND = (term) => `:red-x: No definition found for "${term}".`;
const MSG_ERROR = ":red-x: Couldn't reach the dictionary. Try again later.";
const moreSensesLine = (n, term) =>
  `<https://en.wiktionary.org/wiki/${encodeURIComponent(term)}|+${n} more sense${n === 1 ? "" : "s"} not shown>`;

function stripWikiHtml(html) {
  return (html || "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

async function fetchDefinition(term) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(term)}`,
      { signal: controller.signal },
    );

    if (res.status === 404) return { notFound: true };
    if (!res.ok) throw new Error(`dictionary API HTTP ${res.status}`);

    const json = await res.json();
    if (!Array.isArray(json.en) || !json.en.length) return { notFound: true };
    return { meanings: json.en };
  } finally {
    clearTimeout(timeout);
  }
}

function collectDefinitions(meanings) {
  const collected = [];
  for (const meaning of meanings) {
    const def = meaning.definitions?.[0];
    if (!def) continue;
    collected.push({
      partOfSpeech: meaning.partOfSpeech,
      definition: stripWikiHtml(def.definition),
      example: stripWikiHtml(def.examples?.[0]),
    });
  }
  return collected;
}

function buildBlocks(term, meanings) {
  const blocks = [{ type: "section", text: { type: "mrkdwn", text: `*${escapeMrkdwn(term)}*` } }];

  const all = collectDefinitions(meanings);
  const shown = all.slice(0, MAX_DEFINITIONS);

  for (const { partOfSpeech, definition, example } of shown) {
    let text = `*${escapeMrkdwn(partOfSpeech)}* — ${escapeMrkdwn(definition)}`;
    if (example) text += `\n> ${escapeMrkdwn(example)}`;
    blocks.push({ type: "section", text: { type: "mrkdwn", text } });
  }

  const remaining = all.length - shown.length;
  if (remaining > 0) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: moreSensesLine(remaining, term) }],
    });
  }

  return blocks;
}

export default {
  name: "define",
  description: "Look up a word's definition",

  async execute({ command: cmd, args, respond }) {
    const err = (text) => respond({ response_type: "ephemeral", text });

    const term = args.join(" ").trim();
    if (!term) return err(MSG_USAGE);
    if (term.length > MAX_TERM_LENGTH) return err(MSG_TOO_LONG);

    const now = Date.now();
    const last = lastUsedAt.get(cmd.user_id);
    if (last && now - last < COOLDOWN_MS) return err(MSG_COOLDOWN);
    lastUsedAt.set(cmd.user_id, now);

    try {
      const result = await fetchDefinition(term);
      if (result.notFound) {
        console.log(`[define] ${cmd.user_id} no results for "${term}"`);
        return err(MSG_NOT_FOUND(term));
      }

      console.log(`[define] ${cmd.user_id} looked up "${term}"`);
      await respond({
        response_type: "ephemeral",
        text: `Definition of ${term}`,
        blocks: buildBlocks(term, result.meanings),
      });
    } catch (e) {
      console.log(`[define] error for "${term}": ${e.message}`);
      return err(MSG_ERROR);
    }
  },
};
