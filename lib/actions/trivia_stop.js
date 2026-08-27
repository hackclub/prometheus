import { MSG_ROUND_END } from "../trivia.js";

export default {
  actionId: "trivia_stop",

  async execute({ ack, action, respond }) {
    await ack();

    const { roundCorrect, roundPlayed, roundPoints, roundBestStreak } = JSON.parse(action.value);
    await respond({
      replace_original: true,
      response_type: "ephemeral",
      text: MSG_ROUND_END(roundCorrect, roundPlayed, roundPoints, roundBestStreak ?? 0),
    });
  },
};
