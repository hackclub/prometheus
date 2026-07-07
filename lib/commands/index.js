import { readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const commands = new Map();
const views = [];

const files = readdirSync(__dirname).filter((f) => f.endsWith(".js") && f !== "index.js");
for (const file of files) {
  const mod = await import(join(__dirname, file));
  if (mod.default?.name) commands.set(mod.default.name, mod.default);
  if (Array.isArray(mod.views)) views.push(...mod.views);
}

console.log(`[commands] loaded ${commands.size} commands: ${[...commands.keys()].join(", ")}`);

export function registerCommands(app) {
  app.command(/^\/(dev-)?pro$/, async ({ command, ack, respond, client, logger, context }) => {
    const recv = Date.now();
    await ack();

    const [subcommand, ...args] = command.text.trim().split(/\s+/);
    const handler = commands.get(subcommand);
    console.log(
      `[commands] ${command.command} ${subcommand} by ${command.user_id} in ${command.channel_id}`,
    );
    if (!subcommand || !handler) {
      await respond({
        response_type: "ephemeral",
        text: `:red-x: Unknown command. Available: ${[...commands.keys()].join(", ")}`,
      });
      return;
    }

    try {
      await handler.execute({ command, args, respond, client, logger, recv, context });
    } catch (error) {
      logger.error(`command ${subcommand} error: ${error.message}`);
      await respond({
        response_type: "ephemeral",
        text: `:red-x: Error: ${error.message}`,
      });
    }
  });

  for (const view of views) {
    app.view(view.callbackId, async (args) => {
      await args.ack();
      try {
        await view.handleView(args);
      } catch (error) {
        args.logger.error(`view ${view.callbackId} error: ${error.message}`);
      }
    });
  }
}

export { commands };
