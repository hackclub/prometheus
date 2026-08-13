import { createWebApp } from "./app.js";

function webPort() {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT is invalid");
  return port;
}

export function startWebServer(options) {
  const web = createWebApp(options);
  return Bun.serve({
    fetch: web.fetch,
    hostname: "0.0.0.0",
    idleTimeout: 60,
    port: webPort(),
  });
}
