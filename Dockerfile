FROM oven/bun:alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY . .

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD bun -e 'try { const response = await fetch("http://127.0.0.1:3000/health"); process.exit(response.ok ? 0 : 1); } catch { process.exit(1); }'

CMD ["bun", "run", "index.js"]
