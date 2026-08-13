import { html } from "hono/html";
import { roleAbilities } from "./permissions.js";

const slackMark = html`<span class="slack-mark" aria-hidden="true"
  ><i></i><i></i><i></i><i></i
></span>`;

function page({ title, content, session }) {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <title>${title} · Prometheus</title>
        <link rel="stylesheet" href="/assets/dashboard.css" />
      </head>
      <body>
        <div class="shell">
          <header>
            <a class="brand" href="/">Prometheus</a>
            ${
              session
                ? html`<div class="user">
                    ${
                      session.picture
                        ? html`<img class="avatar" src="${session.picture}" alt="" />`
                        : ""
                    }
                    <span>${session.name}</span>
                    <form class="logout" action="/auth/logout" method="post">
                      <button type="submit">Sign out</button>
                    </form>
                  </div>`
                : ""
            }
          </header>
          ${content}
          <footer>meow mrrp</footer>
        </div>
      </body>
    </html>`;
}

export function landingView(error) {
  return page({
    title: "Your permissions",
    content: html`<main>
      <p class="eyebrow">Channel stewardship, made visible</p>
      <h1>See where you carry the fire.</h1>
      <p class="lede">
        Sign in with your Slack account to see the Prometheus roles and moderation tools available
        to you in every channel.
      </p>
      ${error ? html`<p class="error">${error}</p>` : ""}
      <a class="button signin" href="/auth/slack">${slackMark}Sign in with Slack</a>
    </main>`,
  });
}

export function errorView() {
  return page({
    title: "Sign-in error",
    content: html`<main>
      <p class="eyebrow">The flame went out</p>
      <h1>Couldn’t load the dashboard.</h1>
      <p class="error">
        Try signing in again. If this continues, ask a Prometheus admin to check the service.
      </p>
      <a class="button" href="/">Return home</a>
    </main>`,
  });
}

function abilityList(abilities) {
  return html`<div class="abilities">
    ${abilities.map((ability) => html`<span class="ability">${ability}</span>`)}
  </div>`;
}

function channelGrant(channel, teamDomain) {
  const abilities = roleAbilities[channel.role] || roleAbilities.moderator;
  const channelUrl = teamDomain
    ? `https://${encodeURIComponent(teamDomain)}.slack.com/archives/${encodeURIComponent(channel.channel_id)}`
    : null;
  return html`<article class="grant">
    <div>
      <span class="kind">${channel.role}</span>
      <h3>
        ${channelUrl ? html`<a href="${channelUrl}">#${channel.name}</a>` : html`#${channel.name}`}
      </h3>
    </div>
    ${abilityList(abilities)}
  </article>`;
}

export function dashboardView(session, permissions) {
  const { channels, inherited, primaryRole } = permissions;
  return page({
    title: "Your permissions",
    session,
    content: html`<main>
      <div class="summary">
        <div>
          <p class="eyebrow">Signed in as ${session.name}</p>
          <h1>Your Prometheus permissions.</h1>
          <p class="lede">
            These grants reflect your roles right now. Changes made in Slack or Prometheus will
            appear the next time you load this page.
          </p>
        </div>
        <div class="role-stamp"><strong>${primaryRole}</strong><span>Current standing</span></div>
      </div>
      <div class="ember-line"></div>
      ${
        inherited.length
          ? html`<section>
                <div class="section-head">
                  <h2>Workspace-wide</h2>
                  <span class="count">${inherited.length} inherited</span>
                </div>
                ${abilityList(inherited)}
              </section>
              <div class="ember-line"></div>`
          : ""
      }
      <section>
        <div class="section-head">
          <h2>Channel grants</h2>
          <span class="count">${channels.length} channel${channels.length === 1 ? "" : "s"}</span>
        </div>
        ${
          channels.length
            ? html`<div class="ledger">
                ${channels.map((channel) => channelGrant(channel, session.teamDomain))}
              </div>`
            : html`<div class="empty">
                You have no channel-specific Prometheus role. Your normal Slack membership is
                unchanged.
              </div>`
        }
      </section>
    </main>`,
  });
}
