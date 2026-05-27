# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun install       # install dependencies
bun start         # run the bot
bun --watch index.js  # dev mode with auto-restart
bun run lint      # run ESLint
```

There are no tests in this project.

## Architecture

Prometheus is a Slack bot built with `@slack/bolt` in Socket Mode. It runs via `bun` and uses a local SQLite database (`prometheus.db`) via `bun:sqlite`.

**Entry point:** `index.js` — initializes the Bolt app with `SLACK_USER_TOKEN` (xoxp) and registers all four handler categories.

**Four handler categories**, each auto-discovered by their `index.js` loader:

- `lib/commands/` — subcommands under `/pro <subcommand>`. Each file exports a default with `{ name, execute }`. The router in `index.js` dispatches by name.
- `lib/shortcuts/` — message shortcuts (e.g. Delete Message, Destroy Thread). Each exports `{ callbackId, execute, viewCallbackId?, handleView? }`.
- `lib/listeners/` — event listeners. Each exports a default function + optional `export const event = 'type'` (defaults to `'message'`).
- `lib/actions/` — block kit action handlers. Each exports `{ actionId, execute }`.

**Permission model** (`lib/perms.js`):

- `isGlobalAdmin` — stored in SQLite `global_admins` table; seeded from `SUPERADMINS` env var
- `isWorkspaceAdmin` — Slack API check (`users.info`)
- `isChannelManager` — `appointed_managers` with `role = 'manager'`
- `isChannelModerator` — any role in `appointed_managers` (manager or moderator)
- `canManage` — globalAdmin OR workspaceAdmin OR channelManager (for delete/destroy/welcome)
- `canBan` — globalAdmin OR workspaceAdmin OR channelModerator (for ban/unban/@here)

**Database** (`lib/db.js`): Tables are `global_admins`, `appointed_managers` (with `role` column: `'manager'` or `'moderator'`), `channel_bans`, `join_messages`. All queries use prepared statements.

**Logging** (`lib/logger.js`): Logs deletions and thread nukes to `LOG_CHANNEL`. Uses `SLACK_BOT_TOKEN` for posting log messages and `HACKCLUB_CDN_KEY` for archiving thread content to the Hack Club CDN.

**Moderation** (`lib/moderation.js`): Wraps Slack's undocumented enterprise moderation APIs (`moderation.thread.hide`, `moderation.locks.create/remove`) using a browser token (`xoxc-`) and session cookie. Optional — when credentials are not configured, the destroy thread shortcut falls back to full delete only.

**Rate limiter** (`lib/ratelimiter.js`): Handles Slack API rate limits with exponential backoff. Used by `lib/purge.js` for batch message deletion.

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `SLACK_BOT_TOKEN` | Bot token (xoxb) — used for posting messages |
| `SLACK_USER_TOKEN` | User token (xoxp) — workspace admin, used for deletion and admin APIs |
| `SLACK_APP_TOKEN` | App-level token (xapp) with `connections:write` for Socket Mode |
| `SLACK_SIGNING_SECRET` | Request signing secret |
| `SUPERADMINS` | Comma-separated Slack user IDs seeded as global admins |
| `LOG_CHANNEL` | Channel ID for audit logging with full content (optional) |
| `PUBLIC_LOG_CHANNEL` | Channel ID for public audit logging — redacted, shows actor/target/channel only (optional) |
| `HACKCLUB_CDN_KEY` | CDN API key for archiving deleted threads (optional) |
| `SLACK_BROWSER_TOKEN` | Browser token (xoxc) for undocumented moderation APIs (optional) |
| `SLACK_COOKIE` | Session cookie (`d=` value) paired with browser token (optional) |

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
