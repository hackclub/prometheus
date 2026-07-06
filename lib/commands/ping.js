export default {
  name: "ping",
  description: "Check if the bot is alive",
  async execute({ respond, recv }) {
    const bot = Date.now() - recv;
    await respond({
      response_type: "ephemeral",
      text: `:zap: Yes, I am working!\n\nBot Latency: \`${bot}ms\``,
    });
  },
};
