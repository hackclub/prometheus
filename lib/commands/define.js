import { escapeMrkdwn } from "../postingGate.js";

const MSG_NOT_FOUND = (term) => `:red-x: No definition found for "${escapeMrkdwn(term)}".`;
const moreSensesLine = (n, term) =>
  `<https://en.wiktionary.org/wiki/${encodeURIComponent(term)}|+${n} more sense${n === 1 ? "" : "s"} not shown>`;

function stripWikiHtml(html) {
  return (html || "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<ol[\s>][\s\S]*$/i, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .trim();
}

function englishFirst(sections) {
  const english = sections.filter((s) => s.language === "English");
  return english.length ? english : sections;
}

function collectSenses(sections) {
  const senses = [];
  for (const section of englishFirst(sections)) {
    for (const def of section.definitions || []) {
      const definition = stripWikiHtml(def.definition);
      if (!definition) continue;
      senses.push({
        partOfSpeech: section.partOfSpeech,
        definition,
        example: stripWikiHtml(def.examples?.[0]),
      });
    }
  }
  return senses;
}

function buildBlocks(term, senses) {
  const blocks = [{ type: "section", text: { type: "mrkdwn", text: `*${escapeMrkdwn(term)}*` } }];

  for (const { partOfSpeech, definition, example } of senses.slice(0, 5)) {
    const label = partOfSpeech ? `*${escapeMrkdwn(partOfSpeech)}* — ` : "";
    let text = `${label}${escapeMrkdwn(definition)}`;
    if (example) text += `\n> ${escapeMrkdwn(example)}`;
    blocks.push({ type: "section", text: { type: "mrkdwn", text } });
  }

  const remaining = senses.length - 5;
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
    const [term, ...rest] = args;
    if (!term)
      return respond({
        response_type: "ephemeral",
        text: ":red-x: What am I defining? Try `/pro define <word>`",
      });
    if (rest.length)
      return respond({ response_type: "ephemeral", text: ":red-x: One word at a time, please." });
    if (term.length > 50)
      return respond({
        response_type: "ephemeral",
        text: ":red-x: One word at a time, please.",
      });
    if (term.length > 50)
      return respond({
        response_type: "ephemeral",
        text: ":red-x: That's not a word, that's a paragraph.",
      });

    const res = await fetch(
      `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(term)}`,
      { signal: AbortSignal.timeout(5000) },
    );
    // 4xx just means the API won't take that title; anything else is a real failure.
    if (!res.ok && res.status >= 500) throw new Error(`dictionary API HTTP ${res.status}`);

    const senses = res.ok ? collectSenses((await res.json()).en || []) : [];
    if (!senses.length) {
      console.log(`[define] ${cmd.user_id} no results for "${term}"`);
      return respond({ response_type: "ephemeral", text: MSG_NOT_FOUND(term) });
    }

    console.log(`[define] ${cmd.user_id} looked up "${term}"`);
    await respond({
      response_type: "ephemeral",
      text: `Definition of ${term}`,
      blocks: buildBlocks(term, senses),
    });
  },
};
