export function richTextToPlainText(block) {
  const parts = [];

  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    switch (node.type) {
      case 'text':
        parts.push(node.text ?? '');
        return;
      case 'emoji':
        parts.push(node.name ? `:${node.name}:` : '');
        return;
      case 'link':
        parts.push(node.text || node.url || '');
        return;
      case 'user':
        parts.push(node.user_id ? `<@${node.user_id}>` : '');
        return;
      case 'channel':
        parts.push(node.channel_id ? `<#${node.channel_id}>` : '');
        return;
      default:
        if (Array.isArray(node.elements)) walk(node.elements);
    }
  }

  walk(block);
  return parts.join('').trim();
}

export function plainTextToRichText(text) {
  return {
    type: 'rich_text',
    elements: [
      {
        type: 'rich_text_section',
        elements: [{ type: 'text', text: text ?? '' }],
      },
    ],
  };
}
