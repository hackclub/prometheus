let identityPromise;
const externalCache = new Map(); // user id -> boolean

async function homeIdentity(client) {
  identityPromise ||= client.auth.test().then((r) => ({
    teamId: r.team_id,
    enterpriseId: r.enterprise_id,
  }));
  try {
    return await identityPromise;
  } catch (e) {
    identityPromise = undefined;
    throw e;
  }
}

export async function isExternalUser(client, userId, teamHint) {
  if (!userId) return false;

  let home;
  try {
    home = await homeIdentity(client);
  } catch (e) {
    console.warn(`[workspace] auth.test failed: ${e.data?.error ?? e.message}`);
    return false;
  }
  if (teamHint && teamHint === home.teamId) return false;
  if (externalCache.has(userId)) return externalCache.get(userId);

  let user;
  try {
    ({ user } = await client.users.info({ user: userId }));
  } catch (e) {
    const error = e.data?.error ?? e.message;
    if (error === "user_not_found") {
      externalCache.set(userId, true);
      return true;
    }
    console.warn(`[workspace] users.info failed for ${userId}: ${error}`);
    return false;
  }

  const enterpriseId = user?.enterprise_user?.enterprise_id;
  const external = Boolean(
    user?.is_stranger ||
    (home.enterpriseId && enterpriseId
      ? enterpriseId !== home.enterpriseId
      : user?.team_id && user.team_id !== home.teamId),
  );
  externalCache.set(userId, external);
  return external;
}
