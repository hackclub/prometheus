export default {
  name: "coin",
  description: "Flip a coin and get heads or tails",
  async execute({ respond }) {
    const result = Math.random() < 0.5 ? ":coinheads: heads" : ":cointails: tails";
    await respond({
      response_type: "ephemeral",
      text: `The coin landed on ${result}!`,
    });
  },
};
