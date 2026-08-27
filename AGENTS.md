# AGENTS.md

This file provides guidance to AI agents when working with code in this repository.

## Commands

```bash
bun install       # install dependencies
bun run db:generate # generate a migration after editing lib/db/schema.ts
bun run db:migrate  # apply committed database migrations
bun run db:check    # verify migration snapshot consistency
bun start         # run the bot
bun --watch index.js  # dev mode with auto-restart
bun run lint      # run oxlint
bun run fmt       # format with oxfmt (fmt:check to verify)
```

There are no tests in this project.

## Architecture

Prometheus is a Slack bot built with `@slack/bolt` in Socket Mode. It runs via `bun` and uses PostgreSQL through Bun's native `SQL` client. `DATABASE_URL` is required at startup.

**Entry point:** `index.js` — initializes the Bolt app with `SLACK_USER_TOKEN` (xoxp) and registers all four handler categories.

**Four handler categories**, each auto-discovered by their `index.js` loader:

- `lib/commands/` — subcommands under `/pro <subcommand>`. Each file exports a default with `{ name, execute }`. The router in `index.js` dispatches by name.
- `lib/shortcuts/` — message shortcuts (e.g. Delete Message, Destroy Thread). Each exports `{ callbackId, execute, viewCallbackId?, handleView? }`.
- `lib/listeners/` — event listeners. Each exports a default function + optional `export const event = 'type'` (defaults to `'message'`) and `priority` (lower runs first). Returning `false` stops later listeners for that event.
- `lib/actions/` — block kit action handlers. Each exports `{ actionId, execute }`.

**Permission model** (`lib/perms.js`):

- `isGlobalAdmin` — stored in the PostgreSQL `global_admins` table
- `isWorkspaceAdmin` — Slack API check (`users.info`)
- `isChannelManager` — `appointed_managers` with `role = 'manager'`
- `isChannelModerator` — any role in `appointed_managers` (manager or moderator)
- `isSlackChannelManager` — Slack's native Channel Manager role (Enterprise Grid), via `getChannelManagers` in `lib/moderation.js` (undocumented `admin.roles.entity.listAssignments`). Uses the same enterprise moderation creds (`SLACK_BROWSER_TOKEN`/`SLACK_COOKIE`); no-ops (`false`) when those aren't configured
- `canManage` — globalAdmin OR channelManager (for delete/destroy/welcome)
- `canBan` — globalAdmin OR channelModerator OR isSlackChannelManager (for ban/unban/@here/@channel)
- `canAnchor` — `canManage` OR workspaceAdmin
- `SUPERADMINS` grants access to the `/pro admin` command; it does not automatically insert rows into `global_admins`

**Database** (`lib/db.js`): Uses Bun's native pooled PostgreSQL client, defaulting to four connections per bot instance. The Drizzle schema is `lib/db/schema.ts`; generated migrations live in `drizzle/` and must be applied with `bun run db:migrate` before starting a new application version. Tables are `global_admins`, `appointed_managers`, `channel_bans`, `join_messages`, `channel_posting_gates`, `channel_posting_gate_acceptances`, `embed_blocks`, `anchor_polls`, `anchor_poll_choices`, `anchor_poll_votes`, `anchor_nps_responses`, and `channel_api_keys`.

All exported database functions are asynchronous and must be awaited. Multi-row anchor creation and vote toggling use transactions and advisory locks so overlapping bot instances remain consistent during rolling deploys. Keep schema changes additive and safe for old and new application versions to run concurrently. Generate and commit migrations, do not try to manually create or edit drizzle migrations.

**Posting gates** (`lib/postingGate.js`): A channel manager can require either an ephemeral **I agree** button or an exact phrase before members may post. Phrase mode supports optional multiline channel information configured through a modal and shown as a quote before the exact phrase. Join prompts are folded into `joinMessage.js`; missed prompts are retried after deleting an unaccepted message. Each configuration gets an immutable generation embedded in button values, and stale buttons refresh to the current terms without accepting them. `lib/listeners/postingGate.js` runs before other message listeners and returns `false` after handling a gated message so rejected content cannot trigger anchors, embed processing, or other downstream behavior. Phrase acknowledgements are stored before Slack deletes them.

**Logging** (`lib/logger.js`): Logs deletions and thread nukes to `LOG_CHANNEL`. Uses `SLACK_BOT_TOKEN` for posting log messages and `HACKCLUB_CDN_KEY` for archiving thread content to the Hack Club CDN.

**Moderation** (`lib/moderation.js`): Wraps Slack's undocumented enterprise moderation APIs (`moderation.thread.hide`, `moderation.locks.create/remove`) using a browser token (`xoxc-`) and session cookie. Optional — when credentials are not configured, the destroy thread shortcut falls back to full delete only.

**Rate limiter** (`lib/ratelimiter.js`): Handles Slack API rate limits with exponential backoff. Used by `lib/purge.js` for batch message deletion.

**Web dashboard and API** (`lib/web/`): A Hono app served by `lib/web/server.js`, mounted by
`index.js` alongside the bot and also runnable on its own with `bun run start:web`. Sign-in is
Slack OAuth through Better Auth (`auth.js`), restricted to the workspace the bot is installed in.
The deployment runs behind Cloudflare, so Better Auth resolves client IPs from `cf-connecting-ip`
first, falling back to `x-forwarded-for`/`x-real-ip`; when none are present (local dev, direct
connections), `server.js` fills the header from the socket address.

- `app.js` — routing, security headers, and same-origin checks on every session mutation
- `api.js` — the public, bearer-authenticated `/api/v1` router
- `apiKeys.js` — key minting, hashing, and revocation
- `permissions.js` — maps a Slack user to the channels they can configure
- `sections.js` — the single source of truth for dashboard navigation
- `views.jsx` — hono/jsx server-rendered pages; `dashboard.css` is the only asset

The dashboard is deliberately scoped to API keys right now. The rest of the first pass is parked,
not deleted: nav entries live in `PARKED` in `sections.js`, page components in `views.parked.jsx`,
and their mutation helpers in `channelSettings.js`. Bringing a section back means moving its `PARKED`
entry into `NAV`, adding it to the `pages` map in `views.jsx`, and re-registering its POST routes in
`app.js`. Nothing imports `views.parked.jsx` or `channelSettings.js` in the meantime.

There is no JavaScript on the dashboard — the CSP forbids it — so every interaction is a plain form
POST. Key creation renders its response directly instead of redirecting, because the plaintext key
exists only for that one response.

**API keys** (`lib/web/api.js`): `POST /api/v1/messages/delete` deletes messages programmatically.
Keys are scoped to one channel and one owner, stored only as a SHA-256 hash, and re-checked against
`canManage` on every request, so demoting an owner disables their keys without an explicit
revocation. Deletions reuse `logDelete`/`publicLogDelete` and are attributed to the key's owner.
Per-key throughput is capped at 60 requests per minute in memory, and batches at 50 messages.

Two properties are load-bearing. `LOG_CHANNEL` is mandatory for the endpoint: `logDelete` treats an
unset channel as a successful no-op, so without this guard the API would delete messages with no
record at all. And authorization is rechecked per message rather than once per request, so revoking a
key or demoting its owner halts a batch already in flight. Request bodies are counted in bytes as
they stream and capped at 64 KB, because `Content-Length` is absent under chunked encoding. The
`reason` has its angle brackets stripped — it lands in a mrkdwn block, where `<!channel>` would
otherwise fire a real broadcast ping in the audit channel.

A user may hold `MAX_API_KEYS_PER_USER` (5) active keys in total, across every channel, not per
channel. `createChannelApiKey` counts and inserts inside one transaction behind an advisory lock on
the user id, so concurrent creations cannot both pass the check; it returns `null` at the cap and
`createApiKey` turns that into a user-facing error. The per-key rate limit is a loose temporary
guard, not a quota: Slack's tier 3 limit is the real ceiling and key holders already have the same
power via the Slack shortcut.

## Environment Variables

| Variable               | Purpose                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `SLACK_BOT_TOKEN`      | Bot token (xoxb) — used for posting messages                                               |
| `SLACK_USER_TOKEN`     | User token (xoxp) — workspace admin, used for deletion and admin APIs                      |
| `SLACK_APP_TOKEN`      | App-level token (xapp) with `connections:write` for Socket Mode                            |
| `SLACK_SIGNING_SECRET` | Request signing secret                                                                     |
| `DATABASE_URL`         | PostgreSQL connection URL (required)                                                       |
| `DATABASE_POOL_SIZE`   | Maximum PostgreSQL connections per bot instance (optional, defaults to `4`)                |
| `SUPERADMINS`          | Comma-separated Slack user IDs allowed to manage global admins                             |
| `LOG_CHANNEL`          | Channel ID for audit logging with full content (optional)                                  |
| `PUBLIC_LOG_CHANNEL`   | Channel ID for public audit logging — redacted, shows actor/target/channel only (optional) |
| `HACKCLUB_CDN_KEY`     | CDN API key for archiving deleted threads (optional)                                       |
| `SLACK_BROWSER_TOKEN`  | Browser token (xoxc) for undocumented moderation APIs (optional)                           |
| `SLACK_COOKIE`         | Session cookie (`d=` value) paired with browser token (optional)                           |
| `SLACK_CLIENT_ID`      | Slack app client ID for dashboard sign-in (optional)                                       |
| `SLACK_CLIENT_SECRET`  | Slack app client secret for dashboard sign-in (optional)                                   |
| `BETTER_AUTH_SECRET`   | Random 32+ character secret for Better Auth sessions (optional)                            |
| `DASHBOARD_BASE_URL`   | Public HTTPS origin the dashboard and API are served from (optional)                       |
| `PORT`                 | Port the web server listens on (optional, defaults to `3000`)                              |

## Adding a New Command

Create `lib/commands/<name>.js` exporting:

```js
export default {
  name: 'yourcommand',
  async execute({ command, args, respond, client, logger }) { ... }
};
```

It will be auto-discovered and available as `/pro yourcommand`.

## Adding a New Shortcut

Create `lib/shortcuts/<name>.js` exporting:

```js
export default {
  callbackId: 'your_callback',
  viewCallbackId: 'your_view', // optional, for modal submissions
  async execute(args) { ... },
  async handleView(args) { ... }, // optional
};
```

Register the `callback_id` in `slack.manifest.yaml` under `features.shortcuts`.
