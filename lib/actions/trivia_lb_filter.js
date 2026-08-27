import { getTriviaLeaderboard } from "../db.js";
import { buildLeaderboardBlocks, sinceForWindow } from "../trivia.js";

function currentValue(blocks, actionId) {
  const actionsBlock = blocks.find((b) => b.type === "actions");
  const element = actionsBlock?.elements.find((e) => e.action_id === actionId);
  return element?.initial_option?.value;
}

export default {
  actionId: /^trivia_lb_(difficulty|category|time)$/,

  async execute({ ack, body, action, respond }) {
    await ack();

    const blocks = body.message?.blocks ?? [];
    const current = {
      difficulty: currentValue(blocks, "trivia_lb_difficulty") ?? "any",
      category: currentValue(blocks, "trivia_lb_category") ?? "any",
      time: currentValue(blocks, "trivia_lb_time") ?? "all",
    };

    const changedField =
      action.action_id === "trivia_lb_difficulty"
        ? "difficulty"
        : action.action_id === "trivia_lb_category"
          ? "category"
          : "time";
    current[changedField] = action.selected_option.value;

    const difficulty = current.difficulty === "any" ? undefined : current.difficulty;
    const categoryGroupName = current.category === "any" ? undefined : current.category;

    const rows = await getTriviaLeaderboard({
      since: sinceForWindow(current.time),
      difficulty,
      category: categoryGroupName,
    });

    await respond({
      replace_original: true,
      response_type: "ephemeral",
      text: "Trivia Leaderboard",
      blocks: buildLeaderboardBlocks(rows, {
        difficulty,
        categoryGroupName,
        timeWindow: current.time,
      }),
    });
  },
};
