/** @jsxImportSource hono/jsx */

function SlackMark() {
  return (
    <svg class="slack-mark" viewBox="0 0 127 127" aria-hidden="true">
      <path
        d="M27.2 80c0 7.3-5.9 13.2-13.2 13.2C6.7 93.2.8 87.3.8 80c0-7.3 5.9-13.2 13.2-13.2h13.2V80zm6.6 0c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2v33c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V80z"
        fill="#E01E5A"
      />
      <path
        d="M47 27c-7.3 0-13.2-5.9-13.2-13.2C33.8 6.5 39.7.6 47 .6c7.3 0 13.2 5.9 13.2 13.2V27H47zm0 6.7c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H13.9C6.6 60.1.7 54.2.7 46.9c0-7.3 5.9-13.2 13.2-13.2H47z"
        fill="#36C5F0"
      />
      <path
        d="M99.9 46.9c0-7.3 5.9-13.2 13.2-13.2 7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H99.9V46.9zm-6.6 0c0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V13.8C66.9 6.5 72.8.6 80.1.6c7.3 0 13.2 5.9 13.2 13.2v33.1z"
        fill="#2EB67D"
      />
      <path
        d="M80.1 99.8c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2-7.3 0-13.2-5.9-13.2-13.2V99.8h13.2zm0-6.6c-7.3 0-13.2-5.9-13.2-13.2 0-7.3 5.9-13.2 13.2-13.2h33.1c7.3 0 13.2 5.9 13.2 13.2 0 7.3-5.9 13.2-13.2 13.2H80.1z"
        fill="#ECB22E"
      />
    </svg>
  );
}

function Brand() {
  return (
    <a class="brand" href="/">
      <img
        class="brand-mark"
        src="https://github.com/user-attachments/assets/196e153b-1ef2-4a83-89a3-1bde9a0afe28"
        alt=""
      />
      <span>Prometheus</span>
    </a>
  );
}

function Header({ user }) {
  return (
    <header>
      <Brand />
      {user && (
        <div class="user">
          {user.image && <img class="avatar" src={user.image} alt="" />}
          <span>{user.name}</span>
          <form class="logout" action="/auth/logout" method="post">
            <button type="submit">Sign out</button>
          </form>
        </div>
      )}
    </header>
  );
}

function Document({ title, bodyClass, children }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <title>{title} · Prometheus</title>
        <link rel="stylesheet" href="/assets/dashboard.css" />
      </head>
      <body class={bodyClass}>{children}</body>
    </html>
  );
}

function AuthLayout({ title, children }) {
  return (
    <Document title={title} bodyClass="auth-page">
      <main class="auth-shell">
        <Brand />
        <section class="auth-panel">{children}</section>
      </main>
    </Document>
  );
}

function DashboardLayout({ title, user, children }) {
  return (
    <Document title={title}>
      <div class="shell">
        <Header user={user} />
        {children}
        <footer>:3</footer>
      </div>
    </Document>
  );
}

export function LandingPage({ error }) {
  return (
    <AuthLayout title="Sign in">
      <h1>Configure Prometheus</h1>
      <p>Sign in with Slack to continue.</p>
      {error && <p class="error">{error}</p>}
      <a class="button signin" href="/auth/slack">
        <SlackMark /> Sign in with Slack
      </a>
    </AuthLayout>
  );
}

export function ErrorPage() {
  return (
    <AuthLayout title="Sign-in error">
      <h1>Sign-in failed</h1>
      <p class="error">
        Try again. If this continues, ask a Prometheus admin to check the service.
      </p>
      <a class="button" href="/">
        Return to sign in
      </a>
    </AuthLayout>
  );
}

const statusMessages = {
  "anchor-message-saved": "Anchored message published.",
  "anchor-nps-saved": "NPS survey published.",
  "anchor-poll-saved": "Poll published.",
  "anchor-removed": "Anchor removed.",
  "anchor-updated": "Anchor status updated.",
  "embed-removed": "Embed rule removed.",
  "embed-saved": "Embed rule added.",
  "welcome-removed": "Welcome message removed.",
  "welcome-saved": "Welcome message saved.",
};

function ChannelRail({ canSelectAny, channels, selectedChannel }) {
  return (
    <aside class="channel-rail" aria-label="Configurable channels">
      {canSelectAny && (
        <form class="channel-picker" action="/" method="get">
          <label for="channel-picker">Open a channel</label>
          <div>
            <input
              id="channel-picker"
              name="channel"
              placeholder="Slack URL or channel ID"
              required
            />
            <button type="submit" aria-label="Open channel">
              →
            </button>
          </div>
        </form>
      )}
      <div class="rail-heading">
        <span>Channels</span>
        <strong>{channels.length}</strong>
      </div>
      <nav>
        {channels.map((channel) => (
          <a
            class={
              channel.channel_id === selectedChannel?.channel_id
                ? "channel-link active"
                : "channel-link"
            }
            href={`/?channel=${encodeURIComponent(channel.channel_id)}`}
            aria-current={channel.channel_id === selectedChannel?.channel_id ? "page" : undefined}
          >
            <span class="channel-glyph">{channel.is_private ? "⌁" : "#"}</span>
            <span class="channel-name">{channel.name}</span>
          </a>
        ))}
      </nav>
    </aside>
  );
}

function CardHeading({ icon, title, description, state }) {
  return (
    <summary class="card-heading">
      <div class="module-copy">
        <div class="card-title-line">
          <span class="module-icon" aria-hidden="true">
            {icon}
          </span>
          <h2>{title}</h2>
          {state && (
            <span
              class={state === "Active" || state === "On" ? "state-badge enabled" : "state-badge"}
            >
              {state}
            </span>
          )}
        </div>
        <p>{description}</p>
      </div>
      <span class="summary-action">Settings</span>
    </summary>
  );
}

function Field({ label, hint, children }) {
  return (
    <label class="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function AnchorOverview({ channel, anchor }) {
  const base = `/channels/${encodeURIComponent(channel.channel_id)}/anchor`;
  if (!anchor) {
    return (
      <section class="anchor-overview empty-anchor">
        <div class="anchor-summary">
          <span class="signal idle"></span>
          <div>
            <p class="eyebrow">Current anchor</p>
            <h2>None</h2>
          </div>
        </div>
        <p class="anchor-meta">Choose a module below to publish one.</p>
      </section>
    );
  }

  const kind =
    anchor.type === "nps" ? "NPS survey" : anchor.type === "message" ? "Message" : "Poll";
  const responseCount = anchor.type === "nps" ? anchor.responses.length : anchor.votes.length;
  return (
    <section class="anchor-overview">
      <div class="anchor-summary">
        <span class={anchor.enabled ? "signal" : "signal idle"}></span>
        <div>
          <p class="eyebrow">Active {kind}</p>
          <h2>{anchor.question}</h2>
          <p class="anchor-meta">
            {anchor.enabled ? "Resurfacing is on" : "Resurfacing is paused"}
            {anchor.type !== "message" &&
              ` · ${responseCount} response${responseCount === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>
      <div class="overview-actions">
        <form action={`${base}/toggle`} method="post">
          <input type="hidden" name="enabled" value={anchor.enabled ? "false" : "true"} />
          <button class="button-secondary" type="submit">
            {anchor.enabled ? "Pause" : "Enable"}
          </button>
        </form>
        <form action={`${base}/delete`} method="post">
          <button class="button-danger" type="submit">
            Remove
          </button>
        </form>
      </div>
    </section>
  );
}

function AnchorMessageCard({ channel, anchor }) {
  const current = anchor?.type === "message";
  return (
    <details class="feature-card">
      <CardHeading
        icon="¶"
        title="Anchored message"
        description="Keep essential context pinned and resurface it as the channel moves."
        state={current ? "Active" : null}
      />
      <div class="settings-body">
        <form
          action={`/channels/${encodeURIComponent(channel.channel_id)}/anchor/message`}
          method="post"
        >
          <Field label="Message" hint="Publishing this replaces the current anchor.">
            <textarea
              name="message"
              maxlength="3000"
              rows="5"
              required
              placeholder="Share the context everyone should see…"
            >
              {current ? anchor.question : ""}
            </textarea>
          </Field>
          <button type="submit">{current ? "Replace message" : "Publish message"}</button>
        </form>
      </div>
    </details>
  );
}

function PollCard({ channel, anchor }) {
  const current = anchor?.type === "poll";
  return (
    <details class="feature-card">
      <CardHeading
        icon="≋"
        title="Channel poll"
        description="Run a persistent vote in this channel."
        state={current ? "Active" : "Off"}
      />
      <div class="settings-body">
        <form
          action={`/channels/${encodeURIComponent(channel.channel_id)}/anchor/poll`}
          method="post"
        >
          <Field label="Question">
            <input
              name="question"
              maxlength="250"
              required
              value={current ? anchor.question : ""}
              placeholder="What should we decide?"
            />
          </Field>
          <Field label="Choices" hint="One per line. Replacing a poll resets its votes.">
            <textarea name="choices" rows="4" required placeholder={"First option\nSecond option"}>
              {current ? anchor.choices.map(({ text }) => text).join("\n") : ""}
            </textarea>
          </Field>
          <div class="inline-fields">
            <Field label="New choices">
              <select name="addChoiceSetting">
                <option
                  value="no_one"
                  selected={!current || anchor.add_choice_setting === "no_one"}
                >
                  No one
                </option>
                <option
                  value="creator"
                  selected={current && anchor.add_choice_setting === "creator"}
                >
                  Creator only
                </option>
                <option value="anyone" selected={current && anchor.add_choice_setting === "anyone"}>
                  Anyone
                </option>
              </select>
            </Field>
            <div class="check-stack">
              <label>
                <input
                  type="checkbox"
                  name="anonymous"
                  checked={current && Boolean(anchor.anonymous)}
                />{" "}
                Anonymous
              </label>
              <label>
                <input
                  type="checkbox"
                  name="multiSelect"
                  checked={current && Boolean(anchor.multi_select)}
                />{" "}
                Multiple answers
              </label>
            </div>
          </div>
          <button type="submit">{current ? "Replace poll" : "Publish poll"}</button>
        </form>
      </div>
    </details>
  );
}

function NpsCard({ channel, anchor }) {
  const current = anchor?.type === "nps";
  const defaultQuestion = "How likely are you to recommend this channel to a friend?";
  return (
    <details class="feature-card">
      <CardHeading
        icon="10"
        title="NPS pulse"
        description="Collect a 1–10 score and optional feedback."
        state={current ? "Active" : "Off"}
      />
      <div class="settings-body">
        <form
          action={`/channels/${encodeURIComponent(channel.channel_id)}/anchor/nps`}
          method="post"
        >
          <Field label="Question">
            <input
              name="question"
              maxlength="250"
              required
              value={current ? anchor.question : defaultQuestion}
            />
          </Field>
          <Field label="Run for" hint="The survey closes automatically.">
            <div class="input-suffix">
              <input name="days" type="number" min="1" max="365" value="7" required />
              <span>days</span>
            </div>
          </Field>
          <button type="submit">{current ? "Replace survey" : "Publish survey"}</button>
        </form>
      </div>
    </details>
  );
}

function WelcomeCard({ channel, welcome }) {
  return (
    <details class="feature-card">
      <CardHeading
        icon="↳"
        title="Welcome message"
        description="Greet people when they join this channel."
        state={welcome ? "On" : "Off"}
      />
      <div class="settings-body">
        <form action={`/channels/${encodeURIComponent(channel.channel_id)}/welcome`} method="post">
          <Field label="Delivery">
            <select name="mode">
              <option value="ephemeral" selected={!welcome || welcome.mode === "ephemeral"}>
                Private message in channel
              </option>
              <option value="dm" selected={welcome?.mode === "dm"}>
                Direct message
              </option>
            </select>
          </Field>
          <Field label="Message">
            <textarea
              name="message"
              maxlength="3000"
              rows="4"
              required
              placeholder="Welcome! Here’s what this channel is for…"
            >
              {welcome?.message || ""}
            </textarea>
          </Field>
          <div class="form-actions">
            <button type="submit">Save welcome</button>
            {welcome && (
              <button
                class="button-danger"
                type="submit"
                formaction={`/channels/${encodeURIComponent(channel.channel_id)}/welcome/delete`}
              >
                Turn off
              </button>
            )}
          </div>
        </form>
      </div>
    </details>
  );
}

function ruleLabel(rule) {
  if (rule.type === "domain") return `*.${rule.target}/*`;
  return `${rule.target}/*`;
}

function EmbedCard({ channel, rules }) {
  const action = `/channels/${encodeURIComponent(channel.channel_id)}/embeds`;
  return (
    <details class="feature-card">
      <CardHeading
        icon="⊘"
        title="Blocked embeds"
        description="Stop selected links from expanding."
        state={`${rules.length} rule${rules.length === 1 ? "" : "s"}`}
      />
      <div class="settings-body">
        {rules.length > 0 && (
          <div class="rule-list">
            {rules.map((rule) => (
              <div class="rule-row">
                <div>
                  <span>{rule.type}</span>
                  <code>{ruleLabel(rule)}</code>
                </div>
                <form action={`${action}/delete`} method="post">
                  <input type="hidden" name="type" value={rule.type} />
                  <input type="hidden" name="target" value={rule.target} />
                  <button
                    class="icon-button"
                    type="submit"
                    aria-label={`Remove ${ruleLabel(rule)}`}
                  >
                    ×
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
        <form action={action} method="post">
          <div class="inline-fields rule-builder">
            <Field label="Rule scope">
              <select name="type">
                <option value="domain">Entire domain</option>
                <option value="host">Exact host</option>
                <option value="path">URL path</option>
              </select>
            </Field>
            <Field label="Example URL">
              <input name="url" type="url" required placeholder="https://example.com/path" />
            </Field>
          </div>
          <button type="submit">Add rule</button>
        </form>
      </div>
    </details>
  );
}

export function DashboardPage({
  user,
  teamId,
  permissions,
  selectedChannel,
  settings,
  status,
  error,
}) {
  const { channels, globalAdmin, primaryRole, workspaceAdmin } = permissions;
  const canSelectAny = globalAdmin || workspaceAdmin;
  const channelUrl = selectedChannel
    ? `https://app.slack.com/client/${encodeURIComponent(teamId)}/${encodeURIComponent(selectedChannel.channel_id)}`
    : null;
  return (
    <DashboardLayout title={selectedChannel ? `#${selectedChannel.name}` : "Dashboard"} user={user}>
      <div class="dashboard-layout">
        <ChannelRail
          canSelectAny={canSelectAny}
          channels={channels}
          selectedChannel={selectedChannel}
        />
        <main class="dashboard-main">
          {!selectedChannel ? (
            <div class="empty dashboard-empty">
              <h1>{canSelectAny ? "Choose a channel" : "No configurable channels"}</h1>
              <p>
                {canSelectAny
                  ? "Paste a Slack channel URL or channel ID in the sidebar to configure it."
                  : "You need a channel manager role, global admin role, or workspace admin access before channel settings appear here."}
              </p>
              {error && (
                <div class="notice failure" role="alert">
                  {error}
                </div>
              )}
            </div>
          ) : (
            <>
              <div class="channel-header">
                <div>
                  <p class="eyebrow">Channel settings · {primaryRole}</p>
                  <h1>
                    <span>{selectedChannel.is_private ? "⌁" : "#"}</span>
                    {selectedChannel.name}
                  </h1>
                </div>
                <a class="button button-secondary slack-link" href={channelUrl}>
                  Open in Slack ↗
                </a>
              </div>
              {statusMessages[status] && (
                <div class="notice success" role="status">
                  {statusMessages[status]}
                </div>
              )}
              {error && (
                <div class="notice failure" role="alert">
                  {error}
                </div>
              )}
              {selectedChannel.canAnchor && (
                <AnchorOverview channel={selectedChannel} anchor={settings.anchor} />
              )}
              <div class="card-grid">
                {selectedChannel.canAnchor && (
                  <AnchorMessageCard channel={selectedChannel} anchor={settings.anchor} />
                )}
                {selectedChannel.canAnchor && (
                  <PollCard channel={selectedChannel} anchor={settings.anchor} />
                )}
                {selectedChannel.canAnchor && (
                  <NpsCard channel={selectedChannel} anchor={settings.anchor} />
                )}
                {selectedChannel.canManage && (
                  <WelcomeCard channel={selectedChannel} welcome={settings.welcome} />
                )}
                {selectedChannel.canManage && (
                  <EmbedCard channel={selectedChannel} rules={settings.embedRules} />
                )}
              </div>
            </>
          )}
        </main>
      </div>
    </DashboardLayout>
  );
}
