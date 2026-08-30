import "dotenv/config";
import { WebClient } from "@slack/web-api";
import { checkDatabaseConnection, sql } from "./lib/db.js";
import { startWebServer } from "./lib/web/server.js";

if (!process.env.SLACK_USER_TOKEN) {
  throw new Error("SLACK_USER_TOKEN is required by the standalone dashboard");
}
if (!process.env.SLACK_BOT_TOKEN) {
  throw new Error("SLACK_BOT_TOKEN is required by the standalone dashboard");
}

if (!(await checkDatabaseConnection())) {
  throw new Error("The standalone dashboard could not connect to DATABASE_URL");
}

const client = new WebClient(process.env.SLACK_USER_TOKEN);
const botClient = new WebClient(process.env.SLACK_BOT_TOKEN);
const server = startWebServer({ botClient, client, isHealthy: checkDatabaseConnection });

console.log(`Prometheus dashboard listening on ${server.url}`);

async function shutdown() {
  server.stop();
  await sql.close({ timeout: 5 });
  process.exit(0);
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
