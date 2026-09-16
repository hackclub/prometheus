const FETCH_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_OWNER = "hackclub";
const NAME_PART = /^(?!\.+$)[a-zA-Z0-9._-]+$/;

const MSG_USAGE = ":red-x: Usage: `/pro github [owner/]repo`";
const MSG_INVALID_NAME = ":red-x: That doesn't look like a valid owner/repo name.";
const MSG_NOT_FOUND = (owner, repo) => `:red-x: Couldn't find \`${owner}/${repo}\` on GitHub.`;
const MSG_RATE_LIMITED = ":red-x: Hit GitHub's rate limit — try again in a bit.";
const MSG_ERROR = ":red-x: Couldn't reach GitHub. Try again in a bit.";

const escapeMrkdwn = (text) =>
  String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function parseRepoArg(raw) {
  const parts = raw.split("/");
  if (parts.length > 2 || parts.some((p) => !p || !NAME_PART.test(p))) return null;
  if (parts.length === 2) return { owner: parts[0], repo: parts[1] };
  return { owner: DEFAULT_OWNER, repo: parts[0] };
}

const cache = new Map();

function getCached(key) {
  const entry = cache.get(key);
  return entry && entry.expiresAt > Date.now() ? entry.data : null;
}

function setCached(key, data) {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function fetchRepo(owner, repo) {
  const key = `${owner}/${repo}`.toLowerCase();
  const cached = getCached(key);
  if (cached) return { data: cached };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      signal: controller.signal,
      headers: { Accept: "application/vnd.github+json", "User-Agent": "prometheus-slack-bot" },
    });

    if (res.status === 404) return { notFound: true };
    if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
      return { rateLimited: true };
    }
    if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);

    const json = await res.json();
    const data = {
      fullName: json.full_name,
      htmlUrl: json.html_url,
      description: json.description,
      stars: json.stargazers_count,
      forks: json.forks_count,
      language: json.language,
      openIssues: json.open_issues_count,
      license: json.license?.name,
      pushedAt: json.pushed_at,
      createdAt: json.created_at,
      archived: json.archived,
      homepage: json.homepage || null,
      topics: json.topics || [],
      isFork: json.fork,
      parentFullName: json.parent?.full_name,
      parentUrl: json.parent?.html_url,
    };
    setCached(key, data);
    return { data };
  } finally {
    clearTimeout(timeout);
  }
}

function slackDate(iso, label) {
  const ts = Math.floor(new Date(iso).getTime() / 1000);
  return `${label} <!date^${ts}^{date_short_pretty}|${iso}>`;
}

function buildRepoBlocks(data) {
  const lines = [
    `:github: *<${data.htmlUrl}|${escapeMrkdwn(data.fullName)}>*${data.archived ? " _(archived)_" : ""}`,
  ];

  if (data.isFork && data.parentFullName) {
    lines.push(`_Forked from <${data.parentUrl}|${escapeMrkdwn(data.parentFullName)}>_`);
  }

  if (data.description) lines.push(escapeMrkdwn(data.description));

  if (data.homepage) lines.push(`:link: <${data.homepage}>`);

  if (data.topics.length) {
    lines.push(data.topics.map((t) => `\`${escapeMrkdwn(t)}\``).join(" "));
  }

  const stats = [`:star: ${data.stars.toLocaleString()}`, `:fork: ${data.forks.toLocaleString()}`];
  if (data.language) stats.push(escapeMrkdwn(data.language));
  stats.push(`${data.openIssues.toLocaleString()} open issues`);
  if (data.license) stats.push(escapeMrkdwn(data.license));
  lines.push(stats.join("  ·  "));

  const dates = [];
  if (data.createdAt) dates.push(slackDate(data.createdAt, "Created"));
  if (data.pushedAt) dates.push(slackDate(data.pushedAt, "last pushed"));
  if (dates.length) lines.push(dates.join(", "));

  return [{ type: "section", text: { type: "mrkdwn", text: lines.join("\n") } }];
}

export default {
  name: "github",
  description: "Look up info about a GitHub repository",

  async execute({ command: cmd, args, respond }) {
    const err = (text) => respond({ response_type: "ephemeral", text });

    const raw = args.join(" ").trim();
    if (!raw) return err(MSG_USAGE);

    const parsed = parseRepoArg(raw);
    if (!parsed) return err(MSG_INVALID_NAME);

    try {
      const result = await fetchRepo(parsed.owner, parsed.repo);

      if (result.notFound) {
        console.log(`[github] ${cmd.user_id} not found: ${parsed.owner}/${parsed.repo}`);
        return err(MSG_NOT_FOUND(parsed.owner, parsed.repo));
      }
      if (result.rateLimited) {
        console.log(`[github] rate limited on ${parsed.owner}/${parsed.repo}`);
        return err(MSG_RATE_LIMITED);
      }

      console.log(`[github] ${cmd.user_id} looked up ${parsed.owner}/${parsed.repo}`);
      await respond({
        response_type: "ephemeral",
        text: result.data.fullName,
        blocks: buildRepoBlocks(result.data),
      });
    } catch (e) {
      console.log(`[github] error for ${parsed.owner}/${parsed.repo}: ${e.message}`);
      return err(MSG_ERROR);
    }
  },
};
