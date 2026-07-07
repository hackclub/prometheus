function contentBlock(poll) {
  if (poll.content) return JSON.parse(poll.content);
  return { type: "section", text: { type: "mrkdwn", text: poll.question || "_(empty)_" } };
}

export function buildAnchorMessageBlocks(poll) {
  return [contentBlock(poll)];
}
