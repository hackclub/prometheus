// Single source of truth for dashboard navigation. `app.js` uses it to route and
// authorize section pages; `views.jsx` uses it to render the sidebar.
//
// The dashboard is deliberately narrow for now: API keys only. The rest of the
// first pass lives in PARKED below and in `views.parked.jsx`, ready to move back
// into NAV once those sections ship.

export const NAV = [
  {
    label: "API",
    items: [
      {
        slug: "",
        label: "Keyring",
        title: "Keyring",
        blurb: "Use Prometheus on your own terms with a kick ass API",
      },
    ],
  },
];

export const PARKED = [
  {
    label: "Core",
    items: [
      {
        slug: "access",
        label: "Access",
        title: "Access",
        blurb: "Who can change what in this channel.",
        // Read-only, and the page header already names your role, so it gets no overview card.
        summarize: false,
      },
    ],
  },
  {
    label: "Anchors",
    items: [
      {
        slug: "anchor-message",
        label: "Anchored message",
        capability: "canAnchor",
        title: "Anchored message",
        blurb: "Keep the context this channel needs at the bottom of the conversation.",
      },
      {
        slug: "anchor-poll",
        label: "Poll",
        capability: "canAnchor",
        title: "Poll",
        blurb: "Run a vote that stays visible as the channel moves.",
      },
      {
        slug: "anchor-nps",
        label: "NPS pulse",
        capability: "canAnchor",
        title: "NPS pulse",
        blurb: "Collect a 1–10 score and optional written feedback.",
      },
    ],
  },
  {
    label: "Channel",
    items: [
      {
        slug: "welcome",
        label: "Welcome message",
        capability: "canManage",
        title: "Welcome message",
        blurb: "Greet people the first time they join.",
      },
      {
        slug: "embeds",
        label: "Blocked embeds",
        capability: "canManage",
        title: "Blocked embeds",
        blurb: "Stop chosen links from expanding into previews.",
      },
    ],
  },
];

const bySlug = new Map(NAV.flatMap(({ items }) => items.map((item) => [item.slug, item])));

export function sectionBySlug(slug) {
  return bySlug.get(slug || "") || null;
}

export function sectionPath(channelId, slug) {
  const base = `/c/${encodeURIComponent(channelId)}`;
  return slug ? `${base}/${slug}` : base;
}

export function visibleGroups(channel) {
  return NAV.map(({ label, items }) => ({
    label,
    items: items.filter(({ capability }) => !capability || channel[capability]),
  })).filter(({ items }) => items.length > 0);
}

export function sectionCount(channel) {
  return visibleGroups(channel).reduce((total, { items }) => total + items.length, 0);
}
