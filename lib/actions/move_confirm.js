import { canMove } from "../perms.js";
import { deleteMoveRequest, executeMove, getMoveRequest } from "../move.js";
import { logMove } from "../logger.js";
import { publicLogMove } from "../public-logger.js";

export default {
  actionId: "move_confirm",

  async execute({ ack, body, action, respond, client, context, logger }) {
    await ack();

    const { requestId } = JSON.parse(action.value);
    const request = getMoveRequest(requestId);
    const movedBy = body.user.id;

    if (!request) {
      return respond({
        replace_original: true,
        text: "This move review expired. Run `/pro move` again.",
      });
    }

    const { source, dest, kick, exclude, plan, requestedBy } = request;

    if (requestedBy !== movedBy) {
      return respond({
        replace_original: true,
        text: ":loll: Only the person who started this move can confirm it.",
      });
    }

    const [canMoveFromSource, canMoveToDest] = await Promise.all([
      canMove(context.userClient, movedBy, source),
      canMove(context.userClient, movedBy, dest),
    ]);

    if (!canMoveFromSource || !canMoveToDest) {
      return respond({
        replace_original: true,
        text: ":loll: You're no longer allowed to move members between these channels.",
      });
    }

    deleteMoveRequest(requestId);

    await respond({
      replace_original: true,
      text: `${kick ? "Moving" : "Copying"} members to <#${dest}>… this can take a while.`,
    });

    let result;
    try {
      result = await executeMove(client, context.userClient, logger, {
        source,
        dest,
        kick,
        exclude,
        plan,
      });
    } catch (error) {
      logger.error(
        `[move] execute failed ${source} -> ${dest}: ${error.data?.error ?? error.message}`,
      );
      return respond({
        replace_original: true,
        text: `Move failed: \`${error.data?.error ?? error.message}\``,
      });
    }

    const lines = [`*${result.invited.length}* invited to <#${dest}>`];
    if (result.alreadyIn.length) lines.push(`> ${result.alreadyIn.length} were already in`);
    if (result.failed.length) lines.push(`> ${result.failed.length} failed to invite`);
    if (result.kick) {
      lines.push(
        `> Removed ${result.kicked.length} from <#${source}>${result.kickFailed.length ? ` (${result.kickFailed.length} failed)` : ""}`,
      );
    }

    await respond({ replace_original: true, text: lines.join("\n") });

    await Promise.all([
      logMove(client, { source, dest, movedBy, result }),
      publicLogMove(client, {
        source,
        dest,
        movedBy,
        count: result.kick ? result.kicked.length : result.invited.length,
        kick: result.kick,
      }),
    ]);

    logger.info(
      `[move] ${movedBy} ${source} -> ${dest}: invited ${result.invited.length}, kicked ${result.kicked.length}`,
    );
  },
};
