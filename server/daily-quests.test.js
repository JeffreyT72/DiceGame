import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { createDailyQuestStore, dailyQuestDefinitions } from './daily-quests.js';

function createFixture() {
  const database = new Database(':memory:');
  database.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE player_stats (
      user_id TEXT PRIMARY KEY REFERENCES users(id),
      currency INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT ''
    );
    INSERT INTO users (id) VALUES ('player');
    INSERT INTO player_stats (user_id, currency) VALUES ('player', 25);
  `);
  let date = '2026-11-06';
  const store = createDailyQuestStore(database, {
    getDate: () => date,
    random: (min, max) => max - 1,
  });
  return { database, store, setDate: (nextDate) => { date = nextDate; } };
}

test('selects and persists five randomized quests for each UTC date', () => {
  const { database, store, setDate } = createFixture();
  const quests = store.list('player');

  assert.equal(quests.length, 5);
  assert.equal(new Set(quests.map(({ type }) => type)).size, 5);
  for (const quest of quests) {
    const definition = dailyQuestDefinitions.find(({ type }) => type === quest.type);
    assert.ok(quest.target >= definition.min && quest.target <= definition.max);
  }
  assert.deepEqual(store.list('player'), quests);

  setDate('2026-11-07');
  assert.equal(store.list('player').length, 5);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM player_daily_quests').get().count, 10);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM player_daily_quest_selection').get().count, 10);
  database.close();
});

test('caps progress and grants each completed reward only once', () => {
  const { database, store } = createFixture();
  const quest = store.list('player')[0];

  store.record('player', quest.type, quest.target + 5);
  assert.equal(store.list('player').find(({ type }) => type === quest.type).progress, quest.target);
  assert.deepEqual(store.claim('player', quest.type), { currency: 125 });
  assert.deepEqual(store.claim('player', quest.type), {
    error: 'This quest reward has already been claimed.',
    status: 409,
  });
  assert.equal(database.prepare('SELECT currency FROM player_stats WHERE user_id = ?').get('player').currency, 125);
  database.close();
});

test('rejects premature claims without changing the balance', () => {
  const { database, store } = createFixture();
  const quest = store.list('player')[0];
  assert.deepEqual(store.claim('player', quest.type), {
    error: 'Complete this quest before claiming its reward.',
    status: 409,
  });
  assert.equal(database.prepare('SELECT currency FROM player_stats WHERE user_id = ?').get('player').currency, 25);
  database.close();
});

test('tracks split, blackjack, monster, and boss quest progress', () => {
  const { database, store } = createFixture();
  for (const { type } of store.list('player')) {
    store.record('player', type);
    assert.equal(store.list('player').find((quest) => quest.type === type).progress, 1);
  }
  database.close();
});

test('limits legacy daily quests to five without changing the saved quest progress', () => {
  const { database, store } = createFixture();
  for (const { type } of dailyQuestDefinitions) {
    database.prepare(`
      INSERT INTO player_daily_quests (user_id, quest_date, quest_type, target, progress)
      VALUES ('player', '2026-11-06', ?, 5, 2)
    `).run(type);
  }
  const quests = store.list('player');
  assert.equal(quests.length, 5);
  assert.ok(quests.every(({ progress }) => progress === 2));
  assert.equal(database.prepare(`
    SELECT COUNT(*) AS count FROM player_daily_quests WHERE quest_date = '2026-11-06'
  `).get().count, dailyQuestDefinitions.length);
  const unselected = dailyQuestDefinitions.find(({ type }) => (
    !quests.some((quest) => quest.type === type)
  ));
  assert.deepEqual(store.claim('player', unselected.type), {
    error: "This quest isn't in today's daily set.",
    status: 409,
  });
  assert.equal(database.prepare('SELECT currency FROM player_stats WHERE user_id = ?').get('player').currency, 25);
  database.close();
});
