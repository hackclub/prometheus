export default {
  actionId: "move_cancel",

  async execute({ ack, respond }) {
    await ack();
    await respond({ replace_original: true, text: "Move canceled." });
  },
};
