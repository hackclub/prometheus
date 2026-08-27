import { getTriviaLeaderboard, getTriviaPersonalStats } from "../db.js";
import {
  DIFFICULTIES,
  MSG_CATEGORY_NOT_FOUND,
  MSG_ERROR,
  MSG_NO_QUESTIONS,
  MSG_USAGE,
  TIME_WINDOWS,
  TriviaNoResultsError,
  buildLeaderboardBlocks,
  buildPersonalStatsBlocks,
  buildQuestionBlocks,
  categoryFilterOptions,
  difficultyFilterOptions,
  fetchQuestion,
  resolveCategory,
  sinceForWindow,
} from "../trivia.js";

const txt = (text) => ({ type: "plain_text", text });

const TIME_WINDOW_KEYWORDS = new Map([
  ...TIME_WINDOWS.map((w) => [w.value, w.value]),
  ["alltime", "all"],
]);

async function postQuestion({ channel, userId, categoryGroupName, difficulty, client }) {
  let question;
  try {
    question = await fetchQuestion({ categoryGroupName, difficulty });
  } catch (e) {
    console.log(`[trivia] question fetch failed: ${e.message}`);
    const text = e instanceof TriviaNoResultsError ? MSG_NO_QUESTIONS : MSG_ERROR;
    return client.chat.postEphemeral({ channel, user: userId, text });
  }

  const blocks = buildQuestionBlocks(question, { categoryGroupName, difficulty });
  try {
    await client.chat.postEphemeral({ channel, user: userId, text: "Trivia", blocks });
  } catch (e) {
    console.log(`[trivia] respond failed: ${e.message}`);
  }
}

function buildStartModalView(channelId) {
  const difficultyOpts = difficultyFilterOptions();
  const categoryOpts = categoryFilterOptions();

  return {
    type: "modal",
    callback_id: "trivia_start_modal",
    private_metadata: JSON.stringify({ channel: channelId }),
    title: txt("Start Trivia"),
    submit: txt("Start"),
    close: txt("Cancel"),
    blocks: [
      {
        type: "input",
        block_id: "difficulty",
        label: txt("Difficulty"),
        element: {
          type: "static_select",
          action_id: "value",
          options: difficultyOpts,
          initial_option: difficultyOpts[0],
        },
      },
      {
        type: "input",
        block_id: "category",
        label: txt("Category"),
        element: {
          type: "static_select",
          action_id: "value",
          options: categoryOpts,
          initial_option: categoryOpts[0],
        },
      },
    ],
  };
}

async function openStartModal({ command, client }) {
  try {
    await client.views.open({
      trigger_id: command.trigger_id,
      view: buildStartModalView(command.channel_id),
    });
  } catch (e) {
    console.log(`[trivia] modal open failed: ${e.message}`);
  }
}

async function handleStartView({ body, view, client }) {
  const { channel } = JSON.parse(view.private_metadata);
  const userId = body.user.id;

  const difficultyValue = view.state.values.difficulty.value.selected_option.value;
  const categoryValue = view.state.values.category.value.selected_option.value;

  const difficulty = difficultyValue === "any" ? undefined : difficultyValue;
  const resolved = resolveCategory(categoryValue === "any" ? "" : categoryValue);

  await postQuestion({
    channel,
    userId,
    categoryGroupName: resolved.group?.name,
    difficulty,
    client,
  });
}

export const views = [{ callbackId: "trivia_start_modal", handleView: handleStartView }];

function parseLeaderboardArgs(args) {
  const rest = [];
  let difficulty;
  let timeWindow;

  for (const raw of args) {
    const lower = raw.toLowerCase();
    if (!difficulty && DIFFICULTIES.includes(lower)) {
      difficulty = lower;
      continue;
    }
    if (!timeWindow && TIME_WINDOW_KEYWORDS.has(lower)) {
      timeWindow = TIME_WINDOW_KEYWORDS.get(lower);
      continue;
    }
    rest.push(raw);
  }

  return { difficulty, timeWindow, categoryTerm: rest.join(" ").trim() };
}

async function showLeaderboard({ args, respond }) {
  const { difficulty, timeWindow, categoryTerm } = parseLeaderboardArgs(args);
  const resolved = resolveCategory(categoryTerm);
  if (resolved.categories) {
    return respond({
      response_type: "ephemeral",
      text: MSG_CATEGORY_NOT_FOUND(categoryTerm, resolved.categories),
    });
  }
  const categoryGroupName = resolved.group?.name;

  const rows = await getTriviaLeaderboard({
    since: sinceForWindow(timeWindow),
    difficulty,
    category: categoryGroupName,
  });

  await respond({
    response_type: "ephemeral",
    text: "Trivia Leaderboard",
    blocks: buildLeaderboardBlocks(rows, {
      difficulty,
      categoryGroupName,
      timeWindow: timeWindow ?? "all",
    }),
  });
}

async function showPersonalStats({ command, respond }) {
  const stats = await getTriviaPersonalStats(command.user_id);
  await respond({
    response_type: "ephemeral",
    text: "Your Trivia Stats",
    blocks: buildPersonalStatsBlocks(stats),
  });
}

export default {
  name: "trivia",
  description: "Play a trivia game",

  async execute({ command, args, respond, client }) {
    const [subcommand, ...rest] = args;

    switch (subcommand) {
      case "s":
      case "start":
        return openStartModal({ command, client });
      case "lb":
      case "leaderboard":
        return showLeaderboard({ args: rest, respond });
      case "me":
        return showPersonalStats({ command, respond });
      default:
        return respond({ response_type: "ephemeral", text: MSG_USAGE });
    }
  },
};
