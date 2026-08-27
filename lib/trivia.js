import { decode } from "html-entities";
import { escapeMrkdwn } from "./postingGate.js";

const FETCH_TIMEOUT_MS = 5000;

export const DIFFICULTIES = ["easy", "medium", "hard"];
const GENERAL_TERMS = ["any", "general", "mixed", "all"];

const POINTS_BY_DIFFICULTY = { easy: 1, medium: 2, hard: 3 };
export function pointsForDifficulty(difficulty) {
  return POINTS_BY_DIFFICULTY[difficulty] ?? 2;
}

const STREAK_BONUS_THRESHOLD = 3;
const STREAK_BONUS_POINTS = 1;
export function streakBonus(streak) {
  return streak >= STREAK_BONUS_THRESHOLD ? STREAK_BONUS_POINTS : 0;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const TIME_WINDOWS = [
  { name: "All time", value: "all" },
  { name: "Today", value: "today" },
  { name: "This week", value: "week" },
  { name: "This month", value: "month" },
];
const TIME_WINDOW_DAYS = { today: 1, week: 7, month: 30 };
export function sinceForWindow(value) {
  const days = TIME_WINDOW_DAYS[value];
  return days ? Math.floor((Date.now() - days * DAY_MS) / 1000) : 0;
}

export const CATEGORY_GROUPS = [
  { name: "General Knowledge", ids: [9], raw: ["General Knowledge"] },
  { name: "Film & TV", ids: [11, 14], raw: ["Entertainment: Film", "Entertainment: Television"] },
  {
    name: "Music & Theatre",
    ids: [12, 13],
    raw: ["Entertainment: Music", "Entertainment: Musicals & Theatres"],
  },
  {
    name: "Video & Board Games",
    ids: [15, 16],
    raw: ["Entertainment: Video Games", "Entertainment: Board Games"],
  },
  {
    name: "Books & Comics",
    ids: [10, 29],
    raw: ["Entertainment: Books", "Entertainment: Comics"],
  },
  {
    name: "Anime & Cartoons",
    ids: [31, 32],
    raw: ["Entertainment: Japanese Anime & Manga", "Entertainment: Cartoon & Animations"],
  },
  { name: "Science & Nature", ids: [17, 19], raw: ["Science & Nature", "Science: Mathematics"] },
  { name: "Technology", ids: [18, 30], raw: ["Science: Computers", "Science: Gadgets"] },
  { name: "Mythology", ids: [20], raw: ["Mythology"] },
  { name: "Sports", ids: [21], raw: ["Sports"] },
  { name: "Geography", ids: [22], raw: ["Geography"] },
  { name: "History & Politics", ids: [23, 24], raw: ["History", "Politics"] },
  { name: "Art", ids: [25], raw: ["Art"] },
  { name: "Celebrities", ids: [26], raw: ["Celebrities"] },
  { name: "Animals", ids: [27], raw: ["Animals"] },
  { name: "Vehicles", ids: [28], raw: ["Vehicles"] },
];

const RAW_NAME_TO_GROUP = new Map(
  CATEGORY_GROUPS.flatMap((group) => group.raw.map((raw) => [raw, group])),
);

function findGroupByName(name) {
  return CATEGORY_GROUPS.find((g) => g.name === name);
}

export const MSG_USAGE =
  ":red-x: Usage: `/pro trivia s` to start a game, `/pro trivia lb` for the leaderboard, or `/pro trivia me` for your own stats.";
export const MSG_CORRECT = (points, streak) =>
  streak >= STREAK_BONUS_THRESHOLD
    ? `:white_check_mark: Correct! +${points} pts :fire: ${streak} in a row!`
    : `:white_check_mark: Correct! +${points} pts`;
export const MSG_WRONG = (answer) => `:red-x: Not quite, the answer was *${answer}*.`;
export const MSG_ROUND_END = (correct, played, points, bestStreak) =>
  `:checkered_flag: Round over — you got ${correct}/${played} right for ${points} points (best streak: ${bestStreak}). Play again with \`/pro trivia s\`.`;
export const MSG_ERROR = ":red-x: Couldn't reach the trivia API. Try again in a bit.";
export const MSG_NO_QUESTIONS =
  ":red-x: Not enough questions for that combination — try a different category or difficulty.";
export const MSG_LEADERBOARD_EMPTY =
  ":red-x: Nobody's played trivia yet — be the first with `/pro trivia s`.";
export const MSG_LEADERBOARD_EMPTY_FILTERED = ":red-x: Nobody's scored under these filters yet.";
export const MSG_CATEGORY_NOT_FOUND = (term, groups) =>
  `:red-x: No category matches "${term}". Try one of:\n${groups.map((g) => `• ${g.name}`).join("\n")}`;
export const MSG_LEADERBOARD_HEADER = ":trophy: *Trivia Leaderboard*";
export const leaderboardRow = (rank, userId, points, correct, played, accuracyPct) =>
  `\`${rank}.\` <@${userId}> — ${points} pts · ${correct}/${played} correct (${accuracyPct}%)`;

export class TriviaNoResultsError extends Error {}

export function decodeHtmlEntities(text) {
  return decode(text || "");
}

function shuffledAnswers(question) {
  const answers = [...question.incorrect_answers, question.correct_answer].map(decodeHtmlEntities);
  for (let i = answers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [answers[i], answers[j]] = [answers[j], answers[i]];
  }
  return answers;
}

function mapQuestion(q) {
  const rawCategory = decodeHtmlEntities(q.category);
  const displayCategory = RAW_NAME_TO_GROUP.get(rawCategory)?.name ?? rawCategory;

  return {
    question: decodeHtmlEntities(q.question),
    category: displayCategory,
    difficulty: q.difficulty,
    correctAnswer: decodeHtmlEntities(q.correct_answer),
    answers: shuffledAnswers(q),
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`trivia API HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export function resolveCategory(term) {
  if (!term || GENERAL_TERMS.includes(term.toLowerCase())) return { general: true };

  const lower = term.toLowerCase();
  const match = CATEGORY_GROUPS.find((g) => g.name.toLowerCase().includes(lower));
  return match ? { group: match } : { categories: CATEGORY_GROUPS };
}

const QUESTION_BATCH_SIZE = 50;
const FILTERED_BATCH_SIZE = 10;
const REFILL_THRESHOLD = 5;

const pools = new Map();

function poolKey(categoryGroupName, difficulty) {
  return `${categoryGroupName ?? ""}:${difficulty ?? ""}`;
}

function getPool(key) {
  let pool = pools.get(key);
  if (!pool) {
    pool = { queue: [], refilling: null };
    pools.set(key, pool);
  }
  return pool;
}

async function fetchBatch(pool, categoryGroupName, difficulty) {
  const group = categoryGroupName ? findGroupByName(categoryGroupName) : undefined;
  const categoryId = group ? group.ids[Math.floor(Math.random() * group.ids.length)] : undefined;
  const filtered = Boolean(categoryId || difficulty);

  const params = new URLSearchParams({
    amount: String(filtered ? FILTERED_BATCH_SIZE : QUESTION_BATCH_SIZE),
  });
  if (categoryId) params.set("category", String(categoryId));
  if (difficulty) params.set("difficulty", difficulty);

  const json = await fetchJson(`https://opentdb.com/api.php?${params}`);
  if (json.response_code === 1) throw new TriviaNoResultsError("not enough questions available");
  if (json.response_code !== 0) throw new Error(`trivia API response_code ${json.response_code}`);

  pool.queue.push(...(json.results || []).map(mapQuestion));
}

function refillPool(pool, categoryGroupName, difficulty) {
  if (!pool.refilling) {
    pool.refilling = fetchBatch(pool, categoryGroupName, difficulty).finally(() => {
      pool.refilling = null;
    });
  }
  return pool.refilling;
}

export async function fetchQuestion({ categoryGroupName, difficulty } = {}) {
  const pool = getPool(poolKey(categoryGroupName, difficulty));

  if (pool.queue.length <= REFILL_THRESHOLD) {
    const refill = refillPool(pool, categoryGroupName, difficulty);
    if (pool.queue.length) {
      refill.catch((e) => console.log(`[trivia] background refill failed: ${e.message}`));
    } else {
      await refill;
    }
  }

  if (!pool.queue.length) throw new Error("trivia question cache is empty");
  return pool.queue.shift();
}

export function buildQuestionBlocks(
  q,
  {
    feedback,
    roundCorrect = 0,
    roundPlayed = 0,
    roundPoints = 0,
    roundStreak = 0,
    roundBestStreak = 0,
    categoryGroupName,
    difficulty,
  } = {},
) {
  const blocks = [];

  if (feedback) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: feedback } });
  }

  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${escapeMrkdwn(q.category)}* _(${escapeMrkdwn(q.difficulty)})_\n${escapeMrkdwn(q.question)}`,
    },
  });

  const points = pointsForDifficulty(q.difficulty);

  const answerButtons = q.answers.map((answer, i) => ({
    type: "button",
    text: { type: "plain_text", text: answer.slice(0, 75), emoji: true },
    action_id: `trivia_answer_${i}`,
    value: JSON.stringify({
      correct: answer === q.correctAnswer,
      answer: q.correctAnswer,
      points,
      questionDifficulty: q.difficulty,
      questionCategory: q.category,
      roundCorrect,
      roundPlayed,
      roundPoints,
      roundStreak,
      roundBestStreak,
      categoryGroupName,
      difficulty,
    }),
  }));

  const stopButton = {
    type: "button",
    text: { type: "plain_text", text: "Stop", emoji: true },
    style: "danger",
    action_id: "trivia_stop",
    value: JSON.stringify({ roundCorrect, roundPlayed, roundPoints, roundBestStreak }),
  };

  blocks.push({ type: "actions", elements: [...answerButtons, stopButton] });

  return blocks;
}

const txt = (text) => ({ type: "plain_text", text });
const opt = (label, value) => ({ text: txt(label), value: String(value) });

export function difficultyFilterOptions() {
  return [
    opt("Any difficulty", "any"),
    ...DIFFICULTIES.map((d) => opt(d[0].toUpperCase() + d.slice(1), d)),
  ];
}

export function categoryFilterOptions() {
  return [opt("Any category", "any"), ...CATEGORY_GROUPS.map((g) => opt(g.name, g.name))];
}

export function timeWindowOptions() {
  return TIME_WINDOWS.map((w) => opt(w.name, w.value));
}

function findOption(options, value) {
  return options.find((o) => o.value === value) ?? options[0];
}

export function buildLeaderboardBlocks(rows, { difficulty, categoryGroupName, timeWindow }) {
  const difficultyOpts = difficultyFilterOptions();
  const categoryOpts = categoryFilterOptions();
  const timeOpts = timeWindowOptions();

  const isFiltered = Boolean(
    difficulty || categoryGroupName || (timeWindow && timeWindow !== "all"),
  );
  const emptyMsg = isFiltered ? MSG_LEADERBOARD_EMPTY_FILTERED : MSG_LEADERBOARD_EMPTY;

  const lines = rows.length
    ? rows.map((row, i) => {
        const accuracyPct = row.played ? Math.round((row.correct / row.played) * 100) : 0;
        return leaderboardRow(i + 1, row.user_id, row.points, row.correct, row.played, accuracyPct);
      })
    : [emptyMsg];

  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: `${MSG_LEADERBOARD_HEADER}\n${lines.join("\n")}` },
    },
    {
      type: "actions",
      elements: [
        {
          type: "static_select",
          action_id: "trivia_lb_difficulty",
          options: difficultyOpts,
          initial_option: findOption(difficultyOpts, difficulty ?? "any"),
        },
        {
          type: "static_select",
          action_id: "trivia_lb_category",
          options: categoryOpts,
          initial_option: findOption(categoryOpts, categoryGroupName ?? "any"),
        },
        {
          type: "static_select",
          action_id: "trivia_lb_time",
          options: timeOpts,
          initial_option: findOption(timeOpts, timeWindow ?? "all"),
        },
      ],
    },
  ];
}

const MIN_CATEGORY_SAMPLE = 3;
const DIFFICULTY_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard" };

export const MSG_STATS_HEADER = ":bar_chart: *Your Trivia Stats*";
export const MSG_STATS_EMPTY = ":red-x: You haven't played any trivia yet — try `/pro trivia s`.";
export const MSG_STATS_NOT_ENOUGH_DATA =
  "_Play a few more rounds to see your strongest/weakest categories._";

function accuracyPct(correct, played) {
  return played ? Math.round((correct / played) * 100) : 0;
}

export function buildPersonalStatsBlocks(stats) {
  const { overall, byDifficulty, byCategory, bestStreak } = stats;

  if (!overall.played) {
    return [{ type: "section", text: { type: "mrkdwn", text: MSG_STATS_EMPTY } }];
  }

  const lines = [
    MSG_STATS_HEADER,
    `${overall.points} pts · ${overall.correct}/${overall.played} correct (${accuracyPct(overall.correct, overall.played)}%)`,
    `Best streak: ${bestStreak} :fire:`,
  ];

  const difficultyLines = DIFFICULTIES.map((d) => {
    const row = byDifficulty.find((r) => r.difficulty === d);
    if (!row) return null;
    return `${DIFFICULTY_LABEL[d]}: ${row.correct}/${row.played} (${accuracyPct(row.correct, row.played)}%)`;
  }).filter(Boolean);

  if (difficultyLines.length) {
    lines.push("", "*By difficulty*", ...difficultyLines);
  }

  const eligible = byCategory.filter((r) => r.played >= MIN_CATEGORY_SAMPLE);
  if (eligible.length) {
    const ranked = [...eligible].sort(
      (a, b) => accuracyPct(b.correct, b.played) - accuracyPct(a.correct, a.played),
    );
    const strongest = ranked[0];
    const weakest = ranked[ranked.length - 1];
    lines.push(
      "",
      `Strongest: *${strongest.category}* (${accuracyPct(strongest.correct, strongest.played)}%, ${strongest.played} played)`,
    );
    if (weakest !== strongest) {
      lines.push(
        `Weakest: *${weakest.category}* (${accuracyPct(weakest.correct, weakest.played)}%, ${weakest.played} played)`,
      );
    }
  } else {
    lines.push("", MSG_STATS_NOT_ENOUGH_DATA);
  }

  return [{ type: "section", text: { type: "mrkdwn", text: lines.join("\n") } }];
}
