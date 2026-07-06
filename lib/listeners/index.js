import { readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const listeners = new Map(); // event type -> handler[]

const files = readdirSync(__dirname).filter(
  (f) => f.endsWith(".js") && f !== "index.js" && f !== "appHome.js",
);
for (const file of files) {
  const mod = await import(join(__dirname, file));
  if (typeof mod.default !== "function") continue;
  const eventType = mod.event || "message";
  if (!listeners.has(eventType)) listeners.set(eventType, []);
  listeners.get(eventType).push(mod.default);
}

console.log(
  `[listeners] loaded ${[...listeners.values()].flat().length} listeners for events: ${[...listeners.keys()].join(", ")}`,
);

export function registerListeners(app) {
  for (const [eventType, handlers] of listeners) {
    app.event(eventType, async (args) => {
      for (const listener of handlers) {
        try {
          await listener(args);
        } catch (e) {
          args.logger?.error(`listener error: ${e.message}`);
        }
      }
    });
  }
}

export { listeners };
