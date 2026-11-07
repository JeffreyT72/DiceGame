const topLimit = 50;
const cacheSeconds = 60;
const topKey = 'leaderboard:top';
const ranksKey = 'leaderboard:ranks';

export function createLeaderboard(database, redis = null) {
  const boardQuery = (column, field, minimum = 0) => database.prepare(`
    SELECT users.id AS userId,
      COALESCE(NULLIF(player_stats.character_name, ''), users.username) AS username,
      COALESCE(player_stats.${column}, 0) AS ${field}
    FROM users
    LEFT JOIN player_stats ON player_stats.user_id = users.id
    WHERE users.active = 1 AND COALESCE(player_stats.${column}, 0) >= ${minimum}
    ORDER BY ${field} DESC, username COLLATE NOCASE ASC
  `);
  const boards = {
    experience: boardQuery('total_exp', 'totalExp'),
    monstersDefeated: boardQuery('monsters_defeated', 'monstersDefeated'),
    towerFloor: boardQuery('highest_tower_floor', 'highestTowerFloor', 1),
  };

  function snapshot() {
    const top = { updatedAt: new Date().toISOString() };
    const ranks = {};
    for (const [board, query] of Object.entries(boards)) {
      const rows = query.all();
      top[board] = rows.slice(0, topLimit).map(({ userId, ...entry }) => entry);
      rows.forEach(({ userId, ...entry }, index) => {
        (ranks[userId] ??= {})[board] = { rank: index + 1, ...entry };
      });
    }
    return { top, ranks };
  }

  async function cacheSnapshot() {
    const result = snapshot();
    const fields = Object.fromEntries(
      Object.entries(result.ranks).map(([userId, rank]) => [userId, JSON.stringify(rank)]),
    );
    const write = redis.multi()
      .set(topKey, JSON.stringify(result.top), { expiration: { type: 'EX', value: cacheSeconds } })
      .del(ranksKey);
    if (Object.keys(fields).length) write.hSet(ranksKey, fields).expire(ranksKey, cacheSeconds);
    await write.exec();
    return result;
  }

  let rebuilding = null;

  async function get(userId) {
    // Without isReady, node-redis queues commands while disconnected and the request hangs.
    if (redis?.isReady) {
      try {
        const [top, me] = await Promise.all([redis.get(topKey), redis.hGet(ranksKey, userId)]);
        if (top) return { ...JSON.parse(top), me: me ? JSON.parse(me) : {} };
        rebuilding ??= cacheSnapshot().finally(() => { rebuilding = null; });
        const { top: fresh, ranks } = await rebuilding;
        return { ...fresh, me: ranks[userId] ?? {} };
      } catch (error) {
        console.error('Leaderboard cache unavailable, reading SQLite:', error.message);
      }
    }
    const { top, ranks } = snapshot();
    return { ...top, me: ranks[userId] ?? {} };
  }

  return { get };
}
