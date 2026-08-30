export default {
  name: "metheans",
  description: "Learn about chemistry",
  async execute({ respond }) {
    await respond({
      response_type: "ephemeral",
      text: `https://en.wikipedia.org/wiki/Methamphetamine`,
    });
  },
};
