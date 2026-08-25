/** @jsxImportSource hono/jsx */

import { sectionCount, sectionPath, visibleGroups } from "./sections.js";

export const roleLabels = {
  global: "Global admin",
  manager: "Channel manager",
  moderator: "Channel moderator",
  workspace: "Workspace admin",
};

const statusMessages = {
  "key-revoked": "API key revoked.",
};

function Lock() {
  return (
    <svg
      class="glyph"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.4"
      aria-hidden="true"
    >
      <rect x="3.2" y="7" width="9.6" height="6.6" rx="1" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
    </svg>
  );
}

function Caret() {
  return (
    <svg
      class="glyph"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path d="M4 6.5L8 10.5l4-4" />
    </svg>
  );
}

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

function ChannelName({ channel }) {
  if (!channel) return <span>No channel</span>;
  return (
    <>
      {channel.is_private ? <Lock /> : "#"}
      {channel.name}
    </>
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

function ChannelSwitcher({ channels, selectedChannel }) {
  return (
    <details class="menu">
      <summary>
        <span class="menu-name">
          <b>
            <ChannelName channel={selectedChannel} />
          </b>
        </span>
        <span class="menu-caret">
          <Caret />
        </span>
      </summary>
      <div class="menu-panel">
        <p class="label">Your channels</p>
        {channels.length > 0 ? (
          <nav class="menu-list">
            {channels.map((channel) => {
              const active = channel.channel_id === selectedChannel?.channel_id;
              return (
                <a
                  class={active ? "menu-item active" : "menu-item"}
                  href={sectionPath(channel.channel_id, "")}
                  aria-current={active ? "true" : undefined}
                >
                  <span class="ellipsis">
                    <ChannelName channel={channel} />
                  </span>
                  <em>{roleLabels[channel.role]}</em>
                </a>
              );
            })}
          </nav>
        ) : (
          <p class="menu-note">Nothing to see here, come back when you are cooler</p>
        )}
      </div>
    </details>
  );
}

function ProfileMenu({ user, permissions }) {
  return (
    <details class="menu profile">
      <summary>
        {user.image ? (
          <img class="avatar" src={user.image} alt="" />
        ) : (
          <span class="avatar avatar-blank" aria-hidden="true"></span>
        )}
        <span class="menu-name">{user.name}</span>
        <span class="menu-caret">
          <Caret />
        </span>
      </summary>
      <div class="menu-panel menu-panel-narrow">
        <p class="label">Signed in as</p>
        <p class="menu-identity">
          <b>{user.name}</b>
          {permissions.primaryRole}
        </p>
        <form class="menu-form" action="/auth/logout" method="post">
          <button class="button-quiet" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}

function Topbar({ permissions, selectedChannel, user }) {
  return (
    <header class="topbar">
      <Brand />
      <div class="topbar-actions">
        <ChannelSwitcher channels={permissions.channels} selectedChannel={selectedChannel} />
        <ProfileMenu user={user} permissions={permissions} />
      </div>
    </header>
  );
}

function Sidebar({ activeSlug, channel }) {
  return (
    <aside class="sidebar" aria-label="Channel settings">
      {visibleGroups(channel).map(({ label, items }) => (
        <details class="nav-group" open>
          <summary>
            <span class="label">{label}</span>
            <span class="menu-caret">
              <Caret />
            </span>
          </summary>
          <nav>
            {items.map((item) => {
              const active = item.slug === activeSlug;
              return (
                <a
                  class={active ? "nav-item active" : "nav-item"}
                  href={sectionPath(channel.channel_id, item.slug)}
                  aria-current={active ? "page" : undefined}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
        </details>
      ))}
    </aside>
  );
}

function Notices({ error, status }) {
  return (
    <>
      {statusMessages[status] && (
        <p class="notice success" role="status">
          {statusMessages[status]}
        </p>
      )}
      {error && (
        <p class="notice failure" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function FlameFilters() {
  return (
    <svg class="flame-defs" aria-hidden="true" focusable="false">
      <filter
        id="flame-churn"
        x="-30%"
        y="-30%"
        width="160%"
        height="160%"
        color-interpolation-filters="sRGB"
      >
        <feTurbulence type="fractalNoise" baseFrequency="0.021 0.0045" numOctaves="4" seed="17" />
        <feDisplacementMap
          in="SourceGraphic"
          scale="96"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
      <filter
        id="flame-churn-fine"
        x="-30%"
        y="-30%"
        width="160%"
        height="160%"
        color-interpolation-filters="sRGB"
      >
        <feTurbulence type="fractalNoise" baseFrequency="0.055 0.012" numOctaves="3" seed="43" />
        <feDisplacementMap
          in="SourceGraphic"
          scale="46"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  );
}

function Flame() {
  return (
    <div class="flame" aria-hidden="true">
      <FlameFilters />
      <span class="flame-glow" />
      <span class="flame-plume flame-plume-far" />
      <span class="flame-plume flame-plume-mid" />
      <span class="flame-plume flame-plume-near" />
      <span class="flame-tongue flame-tongue-a" />
      <span class="flame-tongue flame-tongue-b" />
      <span class="flame-tongue flame-tongue-c" />
      <span class="flame-tongue flame-tongue-d" />
      <span class="flame-tongue flame-tongue-e" />
      <span class="flame-tongue flame-tongue-f" />
      <span class="flame-bed flame-bed-a" />
      <span class="flame-bed flame-bed-b" />
      <span class="flame-heart" />
      <span class="flame-spark flame-spark-a" />
      <span class="flame-spark flame-spark-b" />
      <span class="flame-spark flame-spark-c" />
      <span class="flame-spark flame-spark-d" />
      <span class="flame-spark flame-spark-e" />
    </div>
  );
}

function AuthLayout({ title, children }) {
  return (
    <Document title={title} bodyClass="auth-page">
      <Flame />
      <div class="auth-frame">
        <Brand />
        <main class="auth-shell">
          <section class="auth-panel">{children}</section>
        </main>
      </div>
    </Document>
  );
}

export function LandingPage({ error }) {
  return (
    <AuthLayout title="Sign in">
      <h1>Configure Prometheus</h1>
      <p>Customize how Prometheus behaves in your channels</p>
      {error && <p class="error">{error}</p>}
      <a class="button signin" href="/auth/slack">
        <SlackMark /> Sign in with Slack
      </a>
    </AuthLayout>
  );
}

export function ErrorPage() {
  return (
    <AuthLayout title="Something broke">
      <h1>That did not load</h1>
      <p class="error">
        Try again. If it keeps failing, ask a Prometheus admin to check the service.
      </p>
      <a class="button button-quiet" href="/">
        Back to the dashboard
      </a>
    </AuthLayout>
  );
}

export function NoChannelsPage({ user, permissions, error }) {
  return (
    <Document title="No channels">
      <div class="console">
        <Topbar permissions={permissions} selectedChannel={null} user={user} />
        <main class="blank">
          <p class="label">{permissions.primaryRole}</p>
          <h1>Nothing to configure yet</h1>
          <p class="blank-note">
            {permissions.globalAdmin
              ? "Channel settings appear here once Prometheus has been set up in a workspace channel."
              : "Channel settings appear here once you are a channel manager."}
          </p>
          {error && (
            <p class="notice failure" role="alert">
              {error}
            </p>
          )}
        </main>
      </div>
    </Document>
  );
}

export function Card({ children, id }) {
  return (
    <section class="card" id={id}>
      {children}
    </section>
  );
}

export function CardHead({ title, state, live, description, action }) {
  const heading = (
    <>
      <h2>{title}</h2>
      {state && <p class={live ? "card-state on" : "card-state"}>{state}</p>}
    </>
  );
  return (
    <>
      {action ? (
        <div class="card-head">
          <div>{heading}</div>
          {action}
        </div>
      ) : (
        heading
      )}
      {description && <p class="card-note">{description}</p>}
    </>
  );
}

export function Stats({ rows }) {
  return (
    <ul class="stats">
      {rows.map(({ label, value, dim }) => (
        <li>
          <span>{label}</span>
          <b class={dim ? "value dim" : "value"}>{value}</b>
        </li>
      ))}
    </ul>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label class="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function PageHead({ section }) {
  return (
    <div class="page-head">
      <h1>{section.title}</h1>
      <p class="page-blurb">{section.blurb}</p>
    </div>
  );
}

function keyDate(seconds) {
  if (!seconds) return "never";
  return new Date(Number(seconds) * 1000).toISOString().slice(0, 10);
}

function KeyList({ channel, keys, remaining }) {
  const page = sectionPath(channel.channel_id, "");
  return (
    <Card id="keys">
      <CardHead
        title="Your keys"
        description="Keys you made for this channel. Other managers cannot see or use them."
        action={
          remaining > 0 && (
            <button type="button" popovertarget="create-key">
              Create key
            </button>
          )
        }
      />
      {keys.length > 0 ? (
        <div class="rules">
          {keys.map((key) => (
            <div class="rule">
              <div>
                <code>{`${key.key_prefix}...`}</code>
                <small>
                  {`${key.name} · created ${keyDate(key.created_at)} · last used ${keyDate(key.last_used_at)}`}
                </small>
              </div>
              <form action={`${page}/keys/revoke`} method="post">
                <input type="hidden" name="id" value={String(key.id)} />
                <button
                  class="button-remove button-small"
                  type="submit"
                  aria-label={`Revoke ${key.name}`}
                >
                  Revoke
                </button>
              </form>
            </div>
          ))}
        </div>
      ) : (
        <p class="quiet">No keys here, all is quiet on the western front.</p>
      )}
      {remaining <= 0 && (
        <p class="quiet">
          Your keyring is quite heavy at 5, you should remove some old keys before getting new ones!
        </p>
      )}
    </Card>
  );
}

function KeyUsage({ baseUrl }) {
  const endpoint = `${baseUrl}/api/v1/messages/delete`;
  const example = [
    `curl -X POST ${endpoint} \\`,
    `  -H "Authorization: Bearer $PROMETHEUS_KEY" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"ts":"1699999999.123456","reason":"spam"}'`,
  ].join("\n");

  return (
    <section class="key-usage">
      <h3>Using your key</h3>
      <p class="card-note">
        Send the key as a bearer token. Any message deletions are still under your name, so use it
        responsibly!
      </p>
      <pre class="snippet">
        <code>{example}</code>
      </pre>
      <ul class="notes">
        <li>
          <code>ts</code> takes one message timestamp or an array of up to 50.
        </li>
        <li>
          <code>reason</code> is required, up to 500 characters.
        </li>
        <li>
          A 200 means the request was accepted. Check <code>deleted</code> and <code>failed</code>{" "}
          for what actually happened to each message.
        </li>
        <li>
          You can use <code>GET {`${baseUrl}/api/v1/key`}</code> to check a key without deleting
          anything.
        </li>
      </ul>
    </section>
  );
}

function CreateKeyModal({ channel, remaining }) {
  if (remaining <= 0) return null;
  return (
    <dialog id="create-key" class="modal" popover="auto" aria-labelledby="create-key-title">
      <div class="modal-panel">
        <h2 id="create-key-title">Create a new key</h2>
        <p class="card-note">Give it a nice name, keys have feelings too!</p>
        <form action={sectionPath(channel.channel_id, "")} method="post">
          <Field label="Name" hint="For example: automod, or palantir-censorship-bot.">
            <input
              name="name"
              required
              maxlength="60"
              placeholder="modbot"
              autocomplete="off"
              autofocus
            />
          </Field>
          <div class="form-actions">
            <button
              type="button"
              class="button-quiet"
              popovertarget="create-key"
              popovertargetaction="hide"
            >
              Cancel
            </button>
            <button type="submit">Create key</button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

function CreatedKeyModal({ apiKey, channel, baseUrl }) {
  const closeHref = sectionPath(channel.channel_id, "");
  return (
    <div class="modal is-open">
      <a class="modal-dismiss" href={closeHref} aria-label="Close"></a>
      <div
        class="modal-panel modal-panel-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="created-key-title"
      >
        <h2 id="created-key-title">API Key created!</h2>
        <p class="card-note">
          You will only be able to see this key now, so copy it now and store it somewhere super
          duper safe!
        </p>
        <p class="secret">
          <code>{apiKey}</code>
        </p>
        <KeyUsage baseUrl={baseUrl} channel={channel} />
        <div class="form-actions">
          <a class="button" href={closeHref}>
            Done
          </a>
        </div>
      </div>
    </div>
  );
}

function ApiKeysPage({ channel, settings, createdKey, baseUrl }) {
  const { keys, total, max, remaining } = settings.apiKeys;
  return (
    <>
      <KeyList channel={channel} keys={keys} remaining={remaining} max={max} />
      <CreateKeyModal channel={channel} remaining={remaining} max={max} total={total} />
      {createdKey && <CreatedKeyModal apiKey={createdKey} baseUrl={baseUrl} channel={channel} />}
    </>
  );
}

const pages = {
  "": ApiKeysPage,
};

export function DashboardPage({
  user,
  teamId,
  permissions,
  section,
  selectedChannel,
  settings,
  status,
  error,
  createdKey,
  baseUrl,
}) {
  const Section = pages[section.slug];
  const channelUrl = `https://app.slack.com/client/${encodeURIComponent(teamId)}/${encodeURIComponent(selectedChannel.channel_id)}`;
  const title = section.slug
    ? `${section.title} · #${selectedChannel.name}`
    : `#${selectedChannel.name}`;
  // One section means the sidebar would just point at the page you are already on.
  const solo = sectionCount(selectedChannel) < 2;
  return (
    <Document title={title}>
      <div class="console">
        <Topbar
          channelUrl={channelUrl}
          permissions={permissions}
          selectedChannel={selectedChannel}
          user={user}
        />
        <div class={solo ? "workspace solo" : "workspace"}>
          {!solo && <Sidebar activeSlug={section.slug} channel={selectedChannel} />}
          <main class="canvas">
            <PageHead channel={selectedChannel} permissions={permissions} section={section} />
            <Notices error={error} status={status} />
            <Section
              baseUrl={baseUrl}
              channel={selectedChannel}
              createdKey={createdKey}
              permissions={permissions}
              settings={settings}
            />
          </main>
        </div>
      </div>
    </Document>
  );
}
