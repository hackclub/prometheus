import { createWebApp } from "./app.js";

function webPort() {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT is invalid");
  return port;
}

function withClientIp(request, server) {
  if (request.headers.has("x-forwarded-for")) return request;
  const ip = server.requestIP(request);
  if (ip) request.headers.set("x-forwarded-for", ip.address);
  return request;
}

export function startWebServer(options) {
  const web = createWebApp(options);
  return Bun.serve({
    fetch: (request, server) => web.fetch(withClientIp(request, server), server),
    hostname: "0.0.0.0",
    idleTimeout: 60,
    port: webPort(),
  });
}
