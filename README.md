<h1 align="center">
  <img alt="icon" width="250" src="https://github.com/user-attachments/assets/196e153b-1ef2-4a83-89a3-1bde9a0afe28" />
  <br>Prometheus
</h1>

_Prometheus is known for stealing fire from the gods and giving it to humanity._

Prometheus is a Slack bot that lets community members take responsibility for keeping high traffic channels tidy and welcoming. More details about why this exists in the Slacker News article: [Prometheus Brings Users More Powers to Improve Slack](https://news.hackclub.com/news/prometheus-distributed-care/).

## Features

**Message shortcuts** (right-click → Message shortcuts):

- **Delete Message**: instantly removes a message
- **Destroy Thread**: nukes an entire thread; hides it via Slack's moderation API if possible
- **Clear Embeds**: strips link previews from a message

**Slash commands** (invoked via `/pro <subcommand>`):

| Command                                              | Who           | What it does                           |
| ---------------------------------------------------- | ------------- | -------------------------------------- |
| `ping`                                               | Everyone      | Check if the bot is alive              |
| `info [@user]`                                       | Everyone      | Look up info about a Slack user        |
| `coin`                                               | Everyone      | Flip a coin                            |
| `cat`                                                | Everyone      | Get a random cat fact                  |
| `define <word>`                                      | Everyone      | Look up a word's definition            |
| `help`                                               | Everyone      | Show available commands                |
| `here <message>`                                     | Moderators    | Ping all online members in the channel |
| `channel <message>`                                  | Moderators    | Ping everyone in the channel           |
| `timeout @user [duration] reason`                    | Moderators    | Time out a user from the channel       |
| `untimeout @user`                                    | Moderators    | Remove a timeout                       |
| `welcome [set\|remove\|view]`                        | Managers      | Manage the channel welcome message     |
| `channelmanager add\|remove\|list [@user] [manager]` | Admins        | Appoint/remove moderators and managers |
| `admin add\|remove\|list [@user]`                    | Global admins | Manage global admins                   |

**Permission roles:**

- **Global admin**: seeded from `SUPERADMINS`.
- **Workspace admin**: inherited from Slack
- **Channel manager**: appointed per-channel; can delete, destroy, set welcome messages
- **Channel moderator**: appointed per-channel; can timeout, @here, @channel
- **Slack Channel Manager**: Slack's own native per-channel role (Enterprise Grid); can @here, @channel. Read via the enterprise moderation creds — inert without `SLACK_BROWSER_TOKEN`/`SLACK_COOKIE`

## Web API

Prometheus offers an web API to programmatically execute moderation actions. You can use this API how you see fit, common use cases include automod bots, cleaning up certain bot messes, or anything to your hearts content.

Keys are scoped to **one channel and one user**. You can hold up to five keys at once, counted across every channel; a key only ever works in the channel it was made for, and it explodes the moment its owner loses their channel manager role. Any actions done via API keys is still logged in the same way as if the user had done it themselves.

```bash
curl -X POST https://prometheus.hackclub.com/api/v1/messages/delete \
  -H "Authorization: Bearer $PROMETHEUS_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ts":"1699999999.123456","reason":"spam"}'
```

```json
{ "ok": true, "channel": "C0123ABCD", "deleted": ["1699999999.123456"], "failed": [] }
```

| Field    | Required | Notes                                           |
| -------- | -------- | ----------------------------------------------- |
| `ts`     | Yes      | One message timestamp, or an array of up to 50  |
| `reason` | Yes      | Up to 500 characters, recorded in the audit log |

A `200` means the request was accepted, not that every message was deleted, so check `deleted` and `failed`, where each failure carries the Slack error (`message_not_found`, `cant_delete_message`).

To delete a whole thread (root message plus every reply):

```bash
curl -X POST https://prometheus.hackclub.com/api/v1/threads/delete \
  -H "Authorization: Bearer $PROMETHEUS_KEY" \
  -H "Content-Type: application/json" \
  -d '{"thread_ts":"1699999999.123456","reason":"spam thread"}'
```

```json
{ "ok": true, "channel": "C0123ABCD", "thread_ts": "1699999999.123456" }
```

| Field       | Required | Notes                                           |
| ----------- | -------- | ----------------------------------------------- |
| `thread_ts` | Yes      | Timestamp of the thread's root message          |
| `reason`    | Yes      | Up to 500 characters, recorded in the audit log |

Deletion runs to completion server-side and keeps paging until the thread is empty; a `502 purge_failed` means it could not finish.

Other statuses: `400` malformed request, `401` missing or invalid key, `403` no permission, `413` request body over 64 KB, `429` over the rate limit of 60 requests per minute.

`GET /api/v1/key` just returns a key's metadata, which is handy for checking the status of a key.

## Setup

> **⚠️ Workspace admin perms required.** Only cloning the repo and installing the Slack app is **not** enough. Almost every moderation feature (delete message, destroy thread, timeout/kick, move members, ban enforcement, clear embeds, and similar) runs through `SLACK_USER_TOKEN` and **will not work** unless that token is a User OAuth token (`xoxp`) from a **workspace admin**. Without it, only trivial commands like `ping`, `coin`, and `help` work.

1. Clone the repo.
2. Create a Slack app from [`slack.manifest.yaml`](./slack.manifest.yaml).
3. Install/reinstall the app to your workspace so all scopes are granted.
4. Create an app-level token with `connections:write` (for Socket Mode!).
5. Fill out your `.env`, check the `.env.example` for reference. Here's a bit more detailed rundown of what to expect

| Variable               | Required | Purpose                                                                                            |
| ---------------------- | -------- | -------------------------------------------------------------------------------------------------- |
| `SLACK_BOT_TOKEN`      | Yes      | Bot User OAuth Token (xoxb) for posting messages                                                   |
| `SLACK_USER_TOKEN`     | Yes      | User OAuth Token (`xoxp`) from a **workspace admin** — required for all moderation actions         |
| `SLACK_APP_TOKEN`      | Yes      | App-Level Token (xapp) with `connections:write` for Socket Mode                                    |
| `SLACK_SIGNING_SECRET` | Yes      | Signing secret from app settings                                                                   |
| `SUPERADMINS`          | Yes      | Comma-separated Slack user IDs seeded as global admins (e.g. `U12345678,U87654321`)                |
| `DATABASE_URL`         | Yes      | PostgreSQL connection URL                                                                          |
| `DATABASE_POOL_SIZE`   | No       | Maximum PostgreSQL connections per bot instance (defaults to 4)                                    |
| `LOG_CHANNEL`          | API      | Channel ID for **private** audit logs which includes full message content and CDN transcripts      |
| `PUBLIC_LOG_CHANNEL`   | No       | Channel ID for **public** audit logs which are redacted, shows only who did what in which channel  |
| `HACKCLUB_CDN_KEY`     | No       | CDN API key for archiving deleted thread archives to the HC CDN                                    |
| `SLACK_BROWSER_TOKEN`  | No       | Browser token (xoxc) for Slack's undocumented moderation APIs (eg thread hiding)                   |
| `SLACK_COOKIE`         | No       | Session cookie (`d=` value) paired with `SLACK_BROWSER_TOKEN`                                      |
| `SLACK_CLIENT_ID`      | No       | Slack app client ID used by Sign in with Slack                                                     |
| `SLACK_CLIENT_SECRET`  | No       | Slack app client secret used by Sign in with Slack                                                 |
| `BETTER_AUTH_SECRET`   | No       | Random secret of at least 32 characters used by Better Auth                                        |
| `DASHBOARD_BASE_URL`   | No       | Public HTTPS origin the dashboard and API are served from (e.g. `https://prometheus.hackclub.com`) |
| `PORT`                 | No       | Port the dashboard and API listen on (defaults to 3000)                                            |

6. Apply database migrations and run it:

```bash
bun install
bun run db:migrate
bun start
```

When changing `lib/db/schema.ts`, generate and commit a migration with
`bun run db:generate`. Apply committed migrations with `bun run db:migrate`
before starting a new application version.

You should see two new message shortcuts in Slack:

<img width="267" height="115" alt="2025_10_08_0z1_Kleki" src="https://github.com/user-attachments/assets/ac48c2f0-31b4-4acc-8ea0-e9ed40612245" />

Deleting a message has no confirmation. Destroying a thread shows a confirmation modal to prevent misinputs:

<img width="453" height="199" alt="2025_10_08_0yz_Kleki" src="https://github.com/user-attachments/assets/da4b4aa3-0171-4b94-9a0e-ed469537f36b" />

## License

See [LICENSE](LICENSE) for the legal mumbo jumbo.
