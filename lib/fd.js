const SHROUD_API_URL = process.env.SHROUD_API_URL;
const SHROUD_API_TOKEN = process.env.SHROUD_API_TOKEN;

export async function fdReportDelete({ channel, message, deletedBy, reason }) {
  if (!SHROUD_API_URL || !SHROUD_API_TOKEN) return;

  const sender = message.user || 'unknown';
  const text = message.text || '_no text content_';
  const ts = message.ts;
  const dateStr = `<!date^${Math.floor(parseFloat(ts))}^{date_short_pretty} {time_secs}|${ts}>`;

  const content = `[Prometheus Report] <@${deletedBy}> deleted a message from <@${sender}> in <#${channel}> ${dateStr} — Reason: ${reason}`;

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Prometheus Report', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `<@${deletedBy}> deleted a message from <@${sender}>`,
      },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `📍 <#${channel}>` },
        { type: 'mrkdwn', text: `🕐 ${dateStr}` },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '*Reason*' },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `> ${reason}` },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '*Deleted Content*' },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `> ${text}` },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: 'Logged by Prometheus' }],
    },
  ];

  try {
    const response = await fetch(SHROUD_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SHROUD_API_TOKEN}`,
      },
      body: JSON.stringify({ content, blocks }),
    });
    if (!response.ok) {
      console.warn(`Shroud API returned ${response.status}: ${await response.text()}`);
    }
  } catch (error) {
    console.warn('Failed to send report to Shroud API:', error.message);
  }
}
