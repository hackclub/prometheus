const cache = new Map();

export async function resolveDisplayName(client, userId) {
  if (cache.has(userId)) return cache.get(userId);
  try {
    const { user } = await client.users.info({ user: userId });
    const name = user?.profile?.display_name || user?.real_name || user?.name || userId;
    cache.set(userId, name);
    return name;
  } catch (e) {
    console.warn(`[displayNames] failed to resolve ${userId}: ${e.data?.error ?? e.message}`);
    return userId;
  }
}

export async function resolveDisplayNames(client, userIds) {
  const unique = [...new Set(userIds)];
  const entries = await Promise.all(
    unique.map(async (id) => [id, await resolveDisplayName(client, id)]),
  );
  return new Map(entries);
}
