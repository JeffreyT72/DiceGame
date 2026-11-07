import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import test from 'node:test';
import { createLeaderboard } from './leaderboard.js';

function createDatabase() {
  const database = new Database(':memory:');
  database.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE player_stats (
      user_id TEXT PRIMARY KEY,
      character_name TEXT NOT NULL DEFAULT '',
      total_exp INTEGER NOT NULL DEFAULT 0,
      monsters_defeated INTEGER NOT NULL DEFAULT 0,
      highest_tower_floor INTEGER NOT NULL DEFAULT 0
    );
  `);
  const addUser = database.prepare('INSERT INTO users (id, username) VALUES (?, ?)');
  const addStats = database.prepare(`
    INSERT INTO player_stats (user_id, total_exp, monsters_defeated) VALUES (?, ?, ?)
  `);
  // p01 has the most EXP and p55 the least; p00 and p01 tie on monsters, broken by name.
  for (let index = 1; index <= 55; index += 1) {
    const id = `p${String(index).padStart(2, '0')}`;
    addUser.run(id, id);
    addStats.run(id, (56 - index) * 10, index === 1 ? 999 : index);
  }
  addUser.run('p00', 'p00');
  addStats.run('p00', 0, 999);
  addUser.run('gone', 'gone');
  database.prepare('UPDATE users SET active = 0 WHERE id = ?').run('gone');
  database.prepare('INSERT INTO player_stats (user_id, total_exp, highest_tower_floor) VALUES (?, ?, ?)')
    .run('gone', 99999, 999);
  const setFloor = database.prepare('UPDATE player_stats SET highest_tower_floor = ? WHERE user_id = ?');
  setFloor.run(12, 'p30');
  setFloor.run(40, 'p05');
  setFloor.run(12, 'p20');
  return database;
}

function createFakeRedis() {
  const store = new Map();
  return {
    isReady: true,
    get: async (key) => store.get(key) ?? null,
    hGet: async (key, field) => store.get(key)?.[field] ?? null,
    multi() {
      const ops = [];
      const chain = {
        set: (key, value) => { ops.push(() => store.set(key, value)); return chain; },
        del: (key) => { ops.push(() => store.delete(key)); return chain; },
        hSet: (key, fields) => { ops.push(() => store.set(key, { ...fields })); return chain; },
        expire: () => chain,
        exec: async () => ops.forEach((op) => op()),
      };
      return chain;
    },
  };
}

test('leaderboard returns the top 50 and the player rank outside it', async () => {
  const { experience, monstersDefeated, me, updatedAt } = await createLeaderboard(createDatabase()).get('p00');

  assert.equal(experience.length, 50);
  assert.deepEqual(experience[0], { username: 'p01', totalExp: 550 });
  assert.ok(!experience.some((entry) => entry.username === 'gone'));
  assert.ok(!('userId' in experience[0]));
  assert.deepEqual(monstersDefeated.slice(0, 2).map((entry) => entry.username), ['p00', 'p01']);
  assert.deepEqual(me, {
    experience: { rank: 56, username: 'p00', totalExp: 0 },
    monstersDefeated: { rank: 1, username: 'p00', monstersDefeated: 999 },
  });
  assert.ok(updatedAt);
});

test('tower leaderboard ranks only players who cleared a floor', async () => {
  const leaderboard = createLeaderboard(createDatabase());
  const { towerFloor, me } = await leaderboard.get('p20');

  // Inactive 'gone' is excluded; the 12-floor tie is broken by name.
  assert.deepEqual(towerFloor, [
    { username: 'p05', highestTowerFloor: 40 },
    { username: 'p20', highestTowerFloor: 12 },
    { username: 'p30', highestTowerFloor: 12 },
  ]);
  assert.deepEqual(me.towerFloor, { rank: 2, username: 'p20', highestTowerFloor: 12 });
  assert.equal((await leaderboard.get('p00')).me.towerFloor, undefined);
});

test('leaderboard serves cached data until Redis is unavailable', async () => {
  const database = createDatabase();
  const redis = createFakeRedis();
  const leaderboard = createLeaderboard(database, redis);

  const first = await leaderboard.get('p55');
  assert.equal(first.me.experience.rank, 55);
  database.prepare('UPDATE player_stats SET total_exp = 10000 WHERE user_id = ?').run('p55');

  assert.deepEqual(await leaderboard.get('p55'), first);
  assert.equal((await leaderboard.get('missing')).me.experience, undefined);

  redis.isReady = false;
  const live = await leaderboard.get('p55');
  assert.deepEqual(live.experience[0], { username: 'p55', totalExp: 10000 });
  assert.equal(live.me.experience.rank, 1);
});
