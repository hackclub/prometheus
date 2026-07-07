const parseUser = (t) => t?.match(/<@([A-Z0-9]+)\|?.*>/)?.[1];

export default {
  name: "info",
  description: "Display info about a Slack user",
  async execute({ args, command, respond, context }) {
    const userId = args[0] ? parseUser(args[0]) : command.user_id;

    if (!userId)
      return respond({ response_type: "ephemeral", text: ":red-x: Usage: `/pro info @user`" });

    let user;
    try {
      const result = await context.userClient.users.info({ user: userId });
      user = result.user;
    } catch (e) {
      return respond({
        response_type: "ephemeral",
        text: `:red-x: Could not find that user: ${e.message}`,
      });
    }

    const tz = user.tz || "Unknown";
    const email = user.profile?.email || "Not available";
    const username = user.name || "Unknown";

    const lines = [
      `*User Info for <@${userId}>:*`,
      `- :globe_with_meridians: Timezone: ${tz}`,
      `- :slack: Slack Email: ${email}`,
      `- :slack: Slack Username: ${username}`,
      `- :slack: Slack ID: ${userId}`,
    ];

    await respond({
      response_type: "ephemeral",
      text: lines.join("\n") + "\n\n_Use `/scan @user` for more data_",
    });
  },
};
