import { recordTriviaAnswer, recordTriviaStreak } from "../db.js";
import {
  MSG_CORRECT,
  MSG_ERROR,
  MSG_NO_QUESTIONS,
  MSG_WRONG,
  TriviaNoResultsError,
  buildQuestionBlocks,
  fetchQuestion,
  streakBonus,
} from "../trivia.js";

export default {
  actionId: /^trivia_answer_\d+$/,

  async execute({ ack, body, action, respond }) {
    await ack();

    const {
      correct,
      answer,
      points,
      questionDifficulty,
      questionCategory,
      roundCorrect,
      roundPlayed,
      roundPoints,
      roundStreak,
      roundBestStreak,
      categoryGroupName,
      difficulty,
    } = JSON.parse(action.value);

    const newStreak = correct ? roundStreak + 1 : 0;
    const earned = correct ? points + streakBonus(newStreak) : 0;
    await Promise.all([
      recordTriviaAnswer(body.user.id, correct, earned, questionDifficulty, questionCategory),
      correct ? recordTriviaStreak(body.user.id, newStreak) : null,
    ]);

    const newRoundCorrect = roundCorrect + (correct ? 1 : 0);
    const newRoundPlayed = roundPlayed + 1;
    const newRoundPoints = roundPoints + earned;
    const newRoundBestStreak = Math.max(roundBestStreak, newStreak);
    const feedback = correct ? MSG_CORRECT(earned, newStreak) : MSG_WRONG(answer);

    let next;
    try {
      next = await fetchQuestion({ categoryGroupName, difficulty });
    } catch (e) {
      console.log(`[trivia] next-question fetch failed: ${e.message}`);
      const errorText = e instanceof TriviaNoResultsError ? MSG_NO_QUESTIONS : MSG_ERROR;
      return respond({
        replace_original: true,
        response_type: "ephemeral",
        text: `${feedback}\n${errorText}`,
      });
    }

    try {
      await respond({
        replace_original: true,
        response_type: "ephemeral",
        text: "Trivia",
        blocks: buildQuestionBlocks(next, {
          feedback,
          roundCorrect: newRoundCorrect,
          roundPlayed: newRoundPlayed,
          roundPoints: newRoundPoints,
          roundStreak: newStreak,
          roundBestStreak: newRoundBestStreak,
          categoryGroupName,
          difficulty,
        }),
      });
    } catch (e) {
      console.log(`[trivia] respond failed: ${e.message}`);
    }
  },
};
