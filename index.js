import "dotenv/config";
import { App } from "@slack/bolt";
import { WebClient } from "@slack/web-api";
import { registerCommands } from "./lib/commands/index.js";
import { registerShortcuts } from "./lib/shortcuts/index.js";
import { registerListeners } from "./lib/listeners/index.js";
import { registerActions } from "./lib/actions/index.js";
import appHomeHandler, {
  actions as homeActions,
  views as homeViews,
} from "./lib/listeners/appHome.js";

export const userClient = new WebClient(process.env.SLACK_USER_TOKEN);

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

app.use(async ({ context, next }) => {
  context.userClient = userClient;
  await next();
});

registerCommands(app);
registerShortcuts(app);
registerListeners(app);
registerActions(app);

app.event("app_home_opened", appHomeHandler);

// home tab actions
for (const h of homeActions) {
  if (h.actionId) {
    app.action(h.actionId, async (args) => h.execute(args));
  } else if (h.pattern) {
    app.action(h.pattern, async (args) => h.execute(args));
  }
}

// home tab modal submissions
for (const v of homeViews) {
  app.view(v.callbackId, async (args) => {
    await args.ack();
    await v.handleView(args);
  });
}

(async () => {
  await app.start();
  console.log(`fire stolen, legs broken`);
})();
