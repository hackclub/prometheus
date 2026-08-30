/** @jsxImportSource hono/jsx */

import { roleAbilities } from "./permissions.js";
import { sectionPath, visibleGroups } from "./sections.js";
import { Card, CardHead, Field, Stats, roleLabels } from "./views.jsx";

function anchorKind(anchor) {
  if (!anchor) return null;
  if (anchor.type === "nps") return "NPS pulse";
  if (anchor.type === "message") return "Anchored message";
  return "Poll";
}

function LiveAnchor({ channel, anchor }) {
  const base = `/channels/${encodeURIComponent(channel.channel_id)}/anchor`;
  if (!anchor) {
    return (
      <section class="live-band idle">
        <div class="live-copy">
          <p class="label">Nothing anchored</p>
          <h2>This channel has no anchor</h2>
          <p class="live-meta">Publish a message, a poll, or an NPS pulse to fill the slot.</p>
        </div>
      </section>
    );
  }

  const count = anchor.type === "nps" ? anchor.responses.length : anchor.votes.length;
  return (
    <section class={anchor.enabled ? "live-band" : "live-band idle"}>
      <div class="live-copy">
        <p class="label">{anchor.enabled ? `Live · ${anchorKind(anchor)}` : "Paused"}</p>
        <h2>{anchor.question}</h2>
        <p class="live-meta">
          {anchor.enabled
            ? "Resurfacing as the channel moves"
            : "Still posted, but no longer resurfacing"}
          {anchor.type !== "message" && ` · ${count} response${count === 1 ? "" : "s"}`}
        </p>
      </div>
      <div class="live-actions">
        <form action={`${base}/toggle`} method="post">
          <input type="hidden" name="enabled" value={anchor.enabled ? "false" : "true"} />
          <button class="button-quiet" type="submit">
            {anchor.enabled ? "Pause" : "Resume"}
          </button>
        </form>
        <form action={`${base}/delete`} method="post">
          <button class="button-remove" type="submit">
            Remove
          </button>
        </form>
      </div>
    </section>
  );
}

// Overview cards carry numbers only while the setting is actually running. An idle card gets
// its state line and nothing else, so the page shows real state instead of rows of dashes.
function summaryFor(slug, { anchor, welcome, embedRules }) {
  const current = (type) => anchor?.type === type;
  const anchorSummary = (type, rows) => ({
    state: current(type) ? (anchor.enabled ? "Live" : "Paused") : "Not anchored",
    live: current(type) && anchor.enabled,
    rows: current(type) ? rows() : [],
  });

  switch (slug) {
    case "anchor-message":
      return anchorSummary("message", () => [
        { label: "Length", value: `${anchor.question.length} characters` },
      ]);
    case "anchor-poll":
      return anchorSummary("poll", () => [
        { label: "Choices", value: anchor.choices.length },
        { label: "Votes", value: anchor.votes.length },
        {
          label: "Ballot",
          value: `${anchor.multi_select ? "Multiple answers" : "One answer"}${anchor.anonymous ? ", anonymous" : ""}`,
        },
      ]);
    case "anchor-nps":
      return anchorSummary("nps", () => [{ label: "Responses", value: anchor.responses.length }]);
    case "welcome":
      return {
        state: welcome ? "On" : "Off",
        live: Boolean(welcome),
        rows: welcome
          ? [
              {
                label: "Delivery",
                value: welcome.mode === "dm" ? "Direct message" : "Private in channel",
              },
              { label: "Length", value: `${welcome.message.length} characters` },
            ]
          : [],
      };
    case "embeds":
      return {
        state: `${embedRules.length} rule${embedRules.length === 1 ? "" : "s"}`,
        live: embedRules.length > 0,
        rows: embedRules.length
          ? [
              {
                label: "Scopes in use",
                value: ["domain", "host", "path"]
                  .filter((type) => embedRules.some((rule) => rule.type === type))
                  .join(", "),
              },
            ]
          : [],
      };
    default:
      return null;
  }
}

export function OverviewPage({ channel, settings }) {
  return (
    <>
      {channel.canAnchor && <LiveAnchor channel={channel} anchor={settings.anchor} />}
      {visibleGroups(channel).map(({ label, items }) => {
        const cards = items.filter((item) => item.slug !== "" && item.summarize !== false);
        if (!cards.length) return null;
        return (
          <section class="group">
            <p class="label">{label}</p>
            <div class="card-grid">
              {cards.map((item) => {
                const summary = summaryFor(item.slug, settings);
                return (
                  <Card>
                    <CardHead
                      title={item.label}
                      state={summary?.state}
                      live={summary?.live}
                      description={item.blurb}
                    />
                    {summary?.rows.length > 0 && <Stats rows={summary.rows} />}
                    <a class="card-link" href={sectionPath(channel.channel_id, item.slug)}>
                      Change these settings ↗
                    </a>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}

function AnchorNote({ anchor, type }) {
  if (!anchor || anchor.type === type) return null;
  const kind = anchorKind(anchor).toLowerCase();
  return (
    <p class="notice info">A {kind} is anchored here right now. Publishing below replaces it.</p>
  );
}

export function AnchorMessagePage({ channel, settings }) {
  const anchor = settings.anchor;
  const current = anchor?.type === "message";
  return (
    <>
      <AnchorNote anchor={anchor} type="message" />
      <Card>
        <CardHead
          title={current ? "Edit the anchored message" : "Publish an anchored message"}
          description="Prometheus reposts it so it never scrolls out of reach."
        />
        <form
          action={`/channels/${encodeURIComponent(channel.channel_id)}/anchor/message`}
          method="post"
        >
          <Field label="Message" hint="Up to 3000 characters. Slack formatting works.">
            <textarea
              name="message"
              maxlength="3000"
              rows="8"
              required
              placeholder="Share the context everyone should see…"
            >
              {current ? anchor.question : ""}
            </textarea>
          </Field>
          <div class="form-actions">
            <button type="submit">{current ? "Replace message" : "Publish message"}</button>
          </div>
        </form>
      </Card>
    </>
  );
}

export function PollPage({ channel, settings }) {
  const anchor = settings.anchor;
  const current = anchor?.type === "poll";
  return (
    <>
      <AnchorNote anchor={anchor} type="poll" />
      <Card>
        <CardHead
          title={current ? "Edit the poll" : "Publish a poll"}
          description="Votes update in place. Replacing a poll clears the votes it already has."
        />
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
          <Field label="Choices" hint="One per line. Two to twenty choices.">
            <textarea name="choices" rows="5" required placeholder={"First option\nSecond option"}>
              {current ? anchor.choices.map(({ text }) => text).join("\n") : ""}
            </textarea>
          </Field>
          <div class="field-row">
            <Field label="Who can add choices">
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
                />
                <span>Hide who voted</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  name="multiSelect"
                  checked={current && Boolean(anchor.multi_select)}
                />
                <span>Allow multiple answers</span>
              </label>
            </div>
          </div>
          <div class="form-actions">
            <button type="submit">{current ? "Replace poll" : "Publish poll"}</button>
          </div>
        </form>
      </Card>
    </>
  );
}

export function NpsPage({ channel, settings }) {
  const anchor = settings.anchor;
  const current = anchor?.type === "nps";
  const defaultQuestion = "How likely are you to recommend this channel to a friend?";
  const average =
    current && anchor.responses.length
      ? (
          anchor.responses.reduce((total, { score }) => total + Number(score), 0) /
          anchor.responses.length
        ).toFixed(1)
      : null;
  return (
    <>
      <AnchorNote anchor={anchor} type="nps" />
      <Card>
        <CardHead
          title={current ? "Edit the NPS pulse" : "Publish an NPS pulse"}
          description="Members pick a score from 1 to 10 and can add a comment."
        />
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
          <Field label="Run for" hint="The survey closes itself when the window ends.">
            <div class="input-suffix">
              <input name="days" type="number" min="1" max="365" value="7" required />
              <span>days</span>
            </div>
          </Field>
          <div class="form-actions">
            <button type="submit">{current ? "Replace survey" : "Publish survey"}</button>
          </div>
        </form>
      </Card>
      {current && (
        <Card>
          <CardHead
            title="Results so far"
            state={anchor.enabled ? "Collecting" : "Paused"}
            live={anchor.enabled}
          />
          <Stats
            rows={[
              { label: "Responses", value: anchor.responses.length },
              { label: "Average score", value: average || "—", dim: !average },
            ]}
          />
        </Card>
      )}
    </>
  );
}

export function WelcomePage({ channel, settings }) {
  const welcome = settings.welcome;
  const action = `/channels/${encodeURIComponent(channel.channel_id)}/welcome`;
  return (
    <Card>
      <CardHead
        title={welcome ? "Edit the welcome message" : "Set up a welcome message"}
        state={welcome ? "On" : "Off"}
        live={Boolean(welcome)}
        description="Sent once, the first time someone joins the channel."
      />
      <form action={action} method="post">
        <Field label="Delivery">
          <select name="mode">
            <option value="ephemeral" selected={!welcome || welcome.mode === "ephemeral"}>
              Private message in the channel
            </option>
            <option value="dm" selected={welcome?.mode === "dm"}>
              Direct message
            </option>
          </select>
        </Field>
        <Field label="Message" hint="Up to 3000 characters.">
          <textarea
            name="message"
            maxlength="3000"
            rows="6"
            required
            placeholder="Welcome! Here's what this channel is for…"
          >
            {welcome?.message || ""}
          </textarea>
        </Field>
        <div class="form-actions">
          <button type="submit">Save welcome message</button>
          {welcome && (
            <button class="button-remove" type="submit" formaction={`${action}/delete`}>
              Turn off
            </button>
          )}
        </div>
      </form>
    </Card>
  );
}

function ruleLabel(rule) {
  if (rule.type === "domain") return `*.${rule.target}/*`;
  return `${rule.target}/*`;
}

const ruleScopes = {
  domain: "Every host on this domain",
  host: "This host only",
  path: "This path only",
};

export function EmbedsPage({ channel, settings }) {
  const rules = settings.embedRules;
  const action = `/channels/${encodeURIComponent(channel.channel_id)}/embeds`;
  return (
    <>
      <Card>
        <CardHead
          title="Rules"
          state={`${rules.length} rule${rules.length === 1 ? "" : "s"}`}
          live={rules.length > 0}
          description="Links matching a rule still post; they just do not expand."
        />
        {rules.length > 0 ? (
          <div class="rules">
            {rules.map((rule) => (
              <div class="rule">
                <div>
                  <code>{ruleLabel(rule)}</code>
                  <small>{ruleScopes[rule.type]}</small>
                </div>
                <form action={`${action}/delete`} method="post">
                  <input type="hidden" name="type" value={rule.type} />
                  <input type="hidden" name="target" value={rule.target} />
                  <button
                    class="button-remove button-small"
                    type="submit"
                    aria-label={`Remove ${ruleLabel(rule)}`}
                  >
                    Remove
                  </button>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <p class="quiet">No rules yet. Every link expands normally.</p>
        )}
      </Card>
      <Card>
        <CardHead
          title="Add a rule"
          description="Paste any URL and pick how wide the rule reaches."
        />
        <form action={action} method="post">
          <div class="field-row field-row-rule">
            <Field label="Scope">
              <select name="type">
                <option value="domain">Entire domain</option>
                <option value="host">Exact host</option>
                <option value="path">URL path</option>
              </select>
            </Field>
            <Field label="Example URL" hint="Prometheus reads the domain, host, or path from it.">
              <input name="url" type="url" required placeholder="https://example.com/path" />
            </Field>
          </div>
          <div class="form-actions">
            <button type="submit">Add rule</button>
          </div>
        </form>
      </Card>
    </>
  );
}

export function AccessPage({ channel, permissions }) {
  const abilities = roleAbilities[channel.role] || [];
  return (
    <div class="card-grid">
      <Card>
        <CardHead
          title="Your role here"
          description="How Prometheus decides what you can change in this channel."
        />
        <Stats
          rows={[
            { label: "Role", value: roleLabels[channel.role] || "Member" },
            {
              label: "Anchors",
              value: channel.canAnchor ? "Allowed" : "No",
              dim: !channel.canAnchor,
            },
            {
              label: "Channel settings",
              value: channel.canManage ? "Allowed" : "No",
              dim: !channel.canManage,
            },
            {
              label: "Moderation",
              value: channel.canModerate ? "Allowed" : "No",
              dim: !channel.canModerate,
            },
            { label: "Channel ID", value: channel.channel_id },
          ]}
        />
      </Card>
      <Card>
        <CardHead title="In this channel" description="What your channel role covers in Slack." />
        {abilities.length ? (
          <ul class="notes">
            {abilities.map((ability) => (
              <li>{ability}</li>
            ))}
          </ul>
        ) : (
          <p class="quiet">You are here through an admin role rather than a channel appointment.</p>
        )}
      </Card>
      <Card>
        <CardHead title="Everywhere else" description="Permissions that follow your account." />
        {permissions.inherited.length ? (
          <ul class="notes">
            {permissions.inherited.map((ability) => (
              <li>{ability}</li>
            ))}
          </ul>
        ) : (
          <p class="quiet">Nothing beyond the channels you are appointed to.</p>
        )}
      </Card>
    </div>
  );
}
