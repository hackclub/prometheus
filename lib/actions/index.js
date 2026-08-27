import { readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const actions = new Map();
const views = [];

const files = readdirSync(__dirname).filter((f) => f.endsWith(".js") && f !== "index.js");
for (const file of files) {
  const mod = await import(join(__dirname, file));
  if (mod.default?.actionId) {
    actions.set(mod.default.actionId, mod.default);
  }
  if (Array.isArray(mod.views)) views.push(...mod.views);
}

console.log(`[actions] loaded ${actions.size} actions: ${[...actions.keys()].join(", ")}`);

export function registerActions(app) {
  for (const [actionId, handler] of actions) {
    app.action(actionId, async (args) => {
      console.log(`[actions] ${actionId} triggered by ${args.body?.user?.id}`);
      try {
        await handler.execute(args);
      } catch (error) {
        args.logger.error(`action ${actionId} error: ${error.message}`);
      }
    });
  }

  for (const view of views) {
    app.view(view.callbackId, async (args) => {
      try {
        await view.handleView(args);
      } catch (error) {
        args.logger.error(`view ${view.callbackId} error: ${error.message}`);
        await args.ack();
      }
    });
  }
}

export { actions, views };
