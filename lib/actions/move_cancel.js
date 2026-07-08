import { deleteMoveRequest } from "../move.js";

export default {
  actionId: "move_cancel",

  async execute({ ack, action, respond }) {
    await ack();
    const { requestId } = JSON.parse(action.value);
    deleteMoveRequest(requestId);
    await respond({ replace_original: true, text: "Move canceled." });
  },
};
