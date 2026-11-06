import { randomInt } from 'node:crypto';

export const dailyQuestDefinitions = [
  { type: 'win_rounds', title: 'Win blackjack rounds', min: 6, max: 10 },
  { type: 'start_rounds', title: 'Start blackjack rounds', min: 15, max: 20 },
  { type: 'dealer_busts', title: 'Make the dealer bust', min: 2, max: 5 },
  { type: 'place_bets', title: 'Place bets', min: 1, max: 5 },
  { type: 'clear_dungeon', title: 'Clear a dungeon', min: 1, max: 1 },
  { type: 'double_down', title: 'Double down', min: 1, max: 4 },
  { type: 'split', title: 'Split pairs', min: 1, max: 4 },
  { type: 'blackjack', title: 'Get a blackjack', min: 1, max: 3 },
  { type: 'defeat_monster', title: 'Defeat any monster', min: 1, max: 3 },
  { type: 'defeat_boss', title: 'Defeat a boss', min: 1, max: 1 },
];

const reward = 100;

export function createDailyQuestStore(database, {
  getDate = () => new Date().toISOString().slice(0, 10),
  random = randomInt,
} = {}) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS player_daily_quests (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quest_date TEXT NOT NULL,
      quest_type TEXT NOT NULL,
      target INTEGER NOT NULL CHECK (target > 0),
      progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
      claimed INTEGER NOT NULL DEFAULT 0 CHECK (claimed IN (0, 1)),
      PRIMARY KEY (user_id, quest_date, quest_type)
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS player_daily_quest_selection (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quest_date TEXT NOT NULL,
      quest_type TEXT NOT NULL,
      PRIMARY KEY (user_id, quest_date, quest_type)
    )
  `);

  const insertQuest = database.prepare(`
    INSERT OR IGNORE INTO player_daily_quests (user_id, quest_date, quest_type, target)
    VALUES (?, ?, ?, ?)
  `);
  const insertSelection = database.prepare(`
    INSERT OR IGNORE INTO player_daily_quest_selection (user_id, quest_date, quest_type)
    VALUES (?, ?, ?)
  `);

  function ensure(userId) {
    const date = getDate();
    return database.transaction(() => {
      const selected = new Set(database.prepare(`
        SELECT quest_type AS type FROM player_daily_quest_selection
        WHERE user_id = ? AND quest_date = ?
      `).all(userId, date).map(({ type }) => type));
      if (selected.size < 5) {
        const existing = new Set(database.prepare(`
          SELECT quest_type AS type FROM player_daily_quests
          WHERE user_id = ? AND quest_date = ?
        `).all(userId, date).map(({ type }) => type));
        const existingQuests = dailyQuestDefinitions.filter((quest) => (
          !selected.has(quest.type) && existing.has(quest.type)
        ));
        while (selected.size < 5 && existingQuests.length) {
          const [quest] = existingQuests.splice(random(0, existingQuests.length), 1);
          selected.add(quest.type);
          insertSelection.run(userId, date, quest.type);
        }
        const candidates = dailyQuestDefinitions.filter((quest) => !selected.has(quest.type));
        while (selected.size < 5) {
          const index = random(0, candidates.length);
          const [quest] = candidates.splice(index, 1);
          selected.add(quest.type);
          insertSelection.run(userId, date, quest.type);
        }
      }

      for (const quest of dailyQuestDefinitions) {
        if (selected.has(quest.type)) {
          insertQuest.run(userId, date, quest.type, random(quest.min, quest.max + 1));
        }
      }
      return date;
    })();
  }

  function list(userId) {
    const date = ensure(userId);
    const quests = database.prepare(`
      SELECT selection.quest_type AS type, quest.target, quest.progress, quest.claimed
      FROM player_daily_quest_selection AS selection
      JOIN player_daily_quests AS quest
        ON quest.user_id = selection.user_id
        AND quest.quest_date = selection.quest_date
        AND quest.quest_type = selection.quest_type
      WHERE selection.user_id = ? AND selection.quest_date = ?
    `).all(userId, date);
    const questByType = new Map(quests.map((quest) => [quest.type, quest]));
    return dailyQuestDefinitions.filter(({ type }) => questByType.has(type)).map((definition) => {
      const quest = questByType.get(definition.type);
      return {
        type: definition.type,
        title: definition.title,
        target: quest.target,
        progress: quest.progress,
        completed: quest.progress >= quest.target,
        claimed: Boolean(quest.claimed),
        reward,
      };
    });
  }

  function record(userId, type, amount = 1) {
    if (!dailyQuestDefinitions.some((quest) => quest.type === type)) {
      throw new Error(`Unknown daily quest type: ${type}`);
    }
    if (!Number.isInteger(amount) || amount < 1) {
      throw new Error('Daily quest progress must be a positive whole number.');
    }
    const date = ensure(userId);
    database.prepare(`
      UPDATE player_daily_quests SET progress = MIN(target, progress + ?)
      WHERE user_id = ? AND quest_date = ? AND quest_type = ?
        AND EXISTS (
          SELECT 1 FROM player_daily_quest_selection
          WHERE user_id = ? AND quest_date = ? AND quest_type = ?
        )
    `).run(amount, userId, date, type, userId, date, type);
  }

  function claim(userId, type) {
    if (!dailyQuestDefinitions.some((quest) => quest.type === type)) {
      return { error: 'Choose a valid daily quest.', status: 400 };
    }
    const date = ensure(userId);
    return database.transaction(() => {
      const quest = database.prepare(`
        SELECT quest.target, quest.progress, quest.claimed
        FROM player_daily_quests AS quest
        JOIN player_daily_quest_selection AS selection
          ON selection.user_id = quest.user_id
          AND selection.quest_date = quest.quest_date
          AND selection.quest_type = quest.quest_type
        WHERE quest.user_id = ? AND quest.quest_date = ? AND quest.quest_type = ?
      `).get(userId, date, type);
      if (!quest) {
        return { error: "This quest isn't in today's daily set.", status: 409 };
      }
      if (quest.claimed) {
        return { error: 'This quest reward has already been claimed.', status: 409 };
      }
      if (quest.progress < quest.target) {
        return { error: 'Complete this quest before claiming its reward.', status: 409 };
      }
      database.prepare(`
        UPDATE player_daily_quests SET claimed = 1
        WHERE user_id = ? AND quest_date = ? AND quest_type = ? AND claimed = 0
          AND EXISTS (
            SELECT 1 FROM player_daily_quest_selection
            WHERE user_id = ? AND quest_date = ? AND quest_type = ?
          )
      `).run(userId, date, type, userId, date, type);
      const result = database.prepare(`
        UPDATE player_stats SET currency = currency + ?, updated_at = datetime('now')
        WHERE user_id = ?
      `).run(reward, userId);
      if (!result.changes) {
        throw new Error('Player stats could not be found while claiming a daily quest.');
      }
      return { currency: database.prepare(`
        SELECT currency FROM player_stats WHERE user_id = ?
      `).get(userId).currency };
    })();
  }

  return { list, record, claim };
}
