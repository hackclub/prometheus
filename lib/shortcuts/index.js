import { readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const shortcuts = new Map();

const files = readdirSync(__dirname).filter((f) => f.endsWith(".js") && f !== "index.js");
for (const file of files) {
  const mod = await import(join(__dirname, file));
  if (mod.default?.callbackId) {
    shortcuts.set(mod.default.callbackId, mod.default);
  }
}

console.log(`[shortcuts] loaded ${shortcuts.size} shortcuts: ${[...shortcuts.keys()].join(", ")}`);

export function registerShortcuts(app) {
  for (const [callbackId, handler] of shortcuts) {
    app.shortcut(callbackId, async (args) => {
      await args.ack();
      console.log(`[shortcuts] ${callbackId} triggered by ${args.shortcut?.user?.id}`);
      try {
        await handler.execute(args);
      } catch (error) {
        args.logger.error(`shortcut ${callbackId} error: ${error.message}`);
      }
    });

    if (handler.viewCallbackId) {
      app.view(handler.viewCallbackId, async (args) => {
        await args.ack();
        try {
          await handler.handleView(args);
        } catch (error) {
          args.logger.error(`view ${handler.viewCallbackId} error: ${error.message}`);
        }
      });
    }
  }
}

export { shortcuts };
