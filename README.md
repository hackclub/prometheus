<h1 align="center">
  <img alt="icon" width="250" src="https://github.com/user-attachments/assets/196e153b-1ef2-4a83-89a3-1bde9a0afe28" />
  <br>Prometheus
</h1>

*Prometheus is known for stealing fire from the gods and giving it to humanity.*

Prometheus is a Slack bot that lets community members take responsibility for keeping high traffic channels tidy and welcoming. More details about why this exists in the Slacker News article: [Prometheus Brings Users More Powers to Improve Slack](https://news.hackclub.com/news/prometheus-distributed-care/).

## Features

**Message shortcuts** (right-click → Message shortcuts):

- **Delete Message**: instantly removes a message
- **Destroy Thread**: nukes an entire thread; hides it via Slack's moderation API if possible
- **Clear Embeds**: strips link previews from a message

**Slash commands** (invoked via `/pro <subcommand>`):

| Command | Who | What it does |
| --- | --- | --- |
| `ping` | Everyone | Check if the bot is alive |
| `info [@user]` | Everyone | Look up info about a Slack user |
| `coin` | Everyone | Flip a coin |
| `help` | Everyone | Show available commands |
| `here <message>` | Moderators | Ping all online members in the channel |
| `channel <message>` | Moderators | Ping everyone in the channel |
| `timeout @user [duration] reason` | Moderators | Time out a user from the channel |
| `untimeout @user` | Moderators | Remove a timeout |
| `welcome [set\|remove\|view]` | Managers | Manage the channel welcome message |
| `communitysteward add\|remove\|list [@user] [manager]` | Admins | Appoint/remove moderators and managers |
| `admin add\|remove\|list [@user]` | Global admins | Manage global admins |

**Permission roles:**

- **Global admin**: seeded from `SUPERADMINS`.
- **Workspace admin**: inherited from Slack
- **Channel manager**: appointed per-channel; can delete, destroy, set welcome messages
- **Channel moderator**: appointed per-channel; can timeout, @here, @channel

## Setup

1. Clone the repo.
2. Create a Slack app from [`slack.manifest.yaml`](./slack.manifest.yaml).
3. Install/reinstall the app to your workspace so all scopes are granted.
4. Create an app-level token with `connections:write` (for Socket Mode!).
5. Fill out your `.env`, check the `.env.example` for reference. Here's a bit more detailed rundown of what to expect

| Variable | Required | Purpose |
| --- | --- | --- |
| `SLACK_BOT_TOKEN` | Yes | Bot User OAuth Token (xoxb) for posting messages |
| `SLACK_USER_TOKEN` | Yes | User OAuth Token (xoxp) workspace admin account, used for deletion and admin APIs |
| `SLACK_APP_TOKEN` | Yes | App-Level Token (xapp) with `connections:write` for Socket Mode |
| `SLACK_SIGNING_SECRET` | Yes | Signing secret from app settings |
| `SUPERADMINS` | Yes | Comma-separated Slack user IDs seeded as global admins (e.g. `U12345678,U87654321`) |
| `LOG_CHANNEL` | No | Channel ID for **private** audit logs which includes full message content and CDN transcripts |
| `PUBLIC_LOG_CHANNEL` | No | Channel ID for **public** audit logs which are redacted, shows only who did what in which channel |
| `HACKCLUB_CDN_KEY` | No | CDN API key for archiving deleted thread archives to the HC CDN |
| `SLACK_BROWSER_TOKEN` | No | Browser token (xoxc) for Slack's undocumented moderation APIs (eg thread hiding) |
| `SLACK_COOKIE` | No | Session cookie (`d=` value) paired with `SLACK_BROWSER_TOKEN` |

6. Run it:

```bash
bun install
bun start
```

You should see two new message shortcuts in Slack:

<img width="267" height="115" alt="2025_10_08_0z1_Kleki" src="https://github.com/user-attachments/assets/ac48c2f0-31b4-4acc-8ea0-e9ed40612245" />

Deleting a message has no confirmation. Destroying a thread shows a confirmation modal to prevent misinputs:

<img width="453" height="199" alt="2025_10_08_0yz_Kleki" src="https://github.com/user-attachments/assets/da4b4aa3-0171-4b94-9a0e-ed469537f36b" />

## License

See [LICENSE](LICENSE) for the legal mumbo jumbo.
