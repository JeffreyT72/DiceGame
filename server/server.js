import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import express from 'express';
import {
  applyAction,
  createGameState,
  newGameId,
  toPublicGame,
} from './blackjack.js';
import {
  dungeons,
  getDungeon,
  getDungeonStageCount,
} from '../shared/dungeon-config.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const databasePath = resolve(projectRoot, process.env.DATABASE_PATH ?? 'data/blackjack.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });

const database = new Database(databasePath);
database.pragma('journal_mode = WAL');
database.exec(`
  CREATE TABLE IF NOT EXISTS blackjack_games (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

const playerDatabasePath = resolve(
  projectRoot,
  process.env.PLAYER_DATABASE_PATH ?? 'data/player-accounts.sqlite',
);
mkdirSync(dirname(playerDatabasePath), { recursive: true });
const playerDatabase = new Database(playerDatabasePath);
playerDatabase.pragma('journal_mode = WAL');
playerDatabase.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS player_stats (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    total_exp INTEGER NOT NULL DEFAULT 0 CHECK (total_exp >= 0),
    strength INTEGER NOT NULL DEFAULT 0 CHECK (strength >= 0),
    agility INTEGER NOT NULL DEFAULT 0 CHECK (agility >= 0),
    constitution INTEGER NOT NULL DEFAULT 0 CHECK (constitution >= 0),
    luck INTEGER NOT NULL DEFAULT 0 CHECK (luck >= 0),
    games_played INTEGER NOT NULL DEFAULT 0 CHECK (games_played >= 0),
    wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
    losses INTEGER NOT NULL DEFAULT 0 CHECK (losses >= 0),
    pushes INTEGER NOT NULL DEFAULT 0 CHECK (pushes >= 0),
    monsters_defeated INTEGER NOT NULL DEFAULT 0 CHECK (monsters_defeated >= 0),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS player_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS player_exp_awards (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, game_id)
  );

  CREATE TABLE IF NOT EXISTS dungeon_runs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    suggested_level INTEGER NOT NULL CHECK (suggested_level BETWEEN 1 AND 10),
    cleared_stages INTEGER NOT NULL DEFAULT 0 CHECK (cleared_stages >= 0),
    completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dungeon_stage_clears (
    dungeon_id TEXT NOT NULL REFERENCES dungeon_runs(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stage INTEGER NOT NULL CHECK (stage >= 1),
    game_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (dungeon_id, stage),
    UNIQUE (user_id, game_id)
  );

  CREATE INDEX IF NOT EXISTS player_sessions_expiry_idx ON player_sessions(expires_at);
`);
const dungeonRunsSchema = playerDatabase.prepare(`
  SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'dungeon_runs'
`).get()?.sql ?? '';
const dungeonStageClearsSchema = playerDatabase.prepare(`
  SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'dungeon_stage_clears'
`).get()?.sql ?? '';
if (
  /\bcleared_stages\b[^,]*\bBETWEEN\s+0\s+AND\s+\d+/i.test(dungeonRunsSchema)
  || /\bstage\b[^,]*\bBETWEEN\s+1\s+AND\s+\d+/i.test(dungeonStageClearsSchema)
) {
  playerDatabase.pragma('foreign_keys = OFF');
  const migrateDungeonStageLimits = playerDatabase.transaction(() => {
    playerDatabase.exec(`
      CREATE TABLE dungeon_runs_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        suggested_level INTEGER NOT NULL CHECK (suggested_level BETWEEN 1 AND 10),
        cleared_stages INTEGER NOT NULL DEFAULT 0 CHECK (cleared_stages >= 0),
        completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO dungeon_runs_new
      SELECT id, user_id, suggested_level, cleared_stages, completed, created_at, updated_at
      FROM dungeon_runs;

      CREATE TABLE dungeon_stage_clears_new (
        dungeon_id TEXT NOT NULL REFERENCES dungeon_runs(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        stage INTEGER NOT NULL CHECK (stage >= 1),
        game_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (dungeon_id, stage),
        UNIQUE (user_id, game_id)
      );
      INSERT INTO dungeon_stage_clears_new
      SELECT dungeon_id, user_id, stage, game_id, created_at
      FROM dungeon_stage_clears;

      DROP TABLE dungeon_stage_clears;
      DROP TABLE dungeon_runs;
      ALTER TABLE dungeon_runs_new RENAME TO dungeon_runs;
      ALTER TABLE dungeon_stage_clears_new RENAME TO dungeon_stage_clears;
    `);
  });
  try {
    migrateDungeonStageLimits();
  } finally {
    playerDatabase.pragma('foreign_keys = ON');
  }
}
const existingPlayerStatColumns = new Set(
  playerDatabase.prepare('PRAGMA table_info(player_stats)').all().map(({ name }) => name),
);
for (const column of ['strength', 'agility', 'constitution', 'luck']) {
  if (!existingPlayerStatColumns.has(column)) {
    playerDatabase.exec(`ALTER TABLE player_stats ADD COLUMN ${column} INTEGER NOT NULL DEFAULT 0 CHECK (${column} >= 0)`);
  }
}
playerDatabase.pragma('foreign_keys = ON');
playerDatabase.prepare('DELETE FROM player_sessions WHERE expires_at <= ?')
  .run(new Date().toISOString());
const existingDungeonRunColumns = new Set(
  playerDatabase.prepare('PRAGMA table_info(dungeon_runs)').all().map(({ name }) => name),
);
if (!existingDungeonRunColumns.has('dungeon_key')) {
  playerDatabase.exec(`
    ALTER TABLE dungeon_runs
    ADD COLUMN dungeon_key TEXT NOT NULL DEFAULT 'verdant-hollow'
  `);
}

const app = express();
const port = Number(process.env.PORT ?? 3000);
const clientDist = resolve(projectRoot, 'dist');

app.use(express.json({ limit: '16kb' }));

const scrypt = promisify(scryptCallback);
const sessionCookieName = 'blackjack_session';
const sessionDurationSeconds = 7 * 24 * 60 * 60;

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function getSessionToken(request) {
  const cookieHeader = request.headers.cookie ?? '';
  const sessionCookie = cookieHeader.split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${sessionCookieName}=`));
  return sessionCookie ? sessionCookie.slice(sessionCookieName.length + 1) : null;
}

function publicAccount(userId) {
  const account = playerDatabase.prepare(`
    SELECT users.id, users.username, users.email, player_stats.total_exp AS totalExp,
      player_stats.strength, player_stats.agility, player_stats.constitution, player_stats.luck,
      player_stats.games_played AS gamesPlayed, player_stats.wins,
      player_stats.losses, player_stats.pushes,
      player_stats.monsters_defeated AS monstersDefeated
    FROM users
    JOIN player_stats ON player_stats.user_id = users.id
    WHERE users.id = ?
  `).get(userId);
  if (!account) {
    return null;
  }

  const { id, username, email, ...stats } = account;
  const allocatedPoints = stats.strength + stats.agility + stats.constitution + stats.luck;
  const level = getLevel(stats.totalExp);
  return {
    user: { id, username, email },
    stats: { ...stats, level, availableStatPoints: Math.max(0, level - 1 - allocatedPoints) },
  };
}

function setSessionCookie(response, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  response.setHeader(
    'Set-Cookie',
    `${sessionCookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionDurationSeconds}${secure}`,
  );
}

function createSession(response, userId) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + sessionDurationSeconds * 1000).toISOString();
  playerDatabase.prepare(`
    INSERT INTO player_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)
  `).run(hashToken(token), userId, expiresAt);
  setSessionCookie(response, token);
}

function requirePlayer(request, response, next) {
  const token = getSessionToken(request);
  if (!token) {
    return response.status(401).json({ error: 'Please sign in to continue.' });
  }

  const session = playerDatabase.prepare(`
    SELECT user_id AS userId FROM player_sessions
    WHERE token_hash = ? AND expires_at > ?
  `).get(hashToken(token), new Date().toISOString());
  if (!session) {
    return response.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }

  request.playerId = session.userId;
  next();
}

app.post('/api/auth/signup', async (request, response) => {
  const username = typeof request.body?.username === 'string' ? request.body.username.trim() : '';
  const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
  const password = typeof request.body?.password === 'string' ? request.body.password : '';
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) {
    return response.status(400).json({ error: 'Username must be 3–24 characters using letters, numbers, or underscores.' });
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return response.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (password.length < 8 || password.length > 128) {
    return response.status(400).json({ error: 'Password must be between 8 and 128 characters.' });
  }

  const userId = randomBytes(16).toString('hex');
  const salt = randomBytes(16).toString('hex');
  const passwordHash = await scrypt(password, salt, 64);
  try {
    const createAccount = playerDatabase.transaction(() => {
      playerDatabase.prepare(`
        INSERT INTO users (id, username, email, password_hash, password_salt)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, username, email, passwordHash.toString('hex'), salt);
      playerDatabase.prepare('INSERT INTO player_stats (user_id) VALUES (?)').run(userId);
    });
    createAccount();
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return response.status(409).json({ error: 'That username or email is already registered.' });
    }
    throw error;
  }

  createSession(response, userId);
  response.status(201).json(publicAccount(userId));
});

app.post('/api/auth/login', async (request, response) => {
  const identifier = typeof request.body?.identifier === 'string' ? request.body.identifier.trim() : '';
  const password = typeof request.body?.password === 'string' ? request.body.password : '';
  if (!identifier || !password || identifier.length > 254 || password.length > 128) {
    return response.status(400).json({ error: 'Enter your username or email and password.' });
  }

  const user = playerDatabase.prepare(`
    SELECT id, password_hash AS passwordHash, password_salt AS passwordSalt
    FROM users WHERE username = ? OR email = ?
  `).get(identifier, identifier);
  if (!user) {
    return response.status(401).json({ error: 'Username/email or password is incorrect.' });
  }

  const candidateHash = await scrypt(password, user.passwordSalt, 64);
  const storedHash = Buffer.from(user.passwordHash, 'hex');
  if (!timingSafeEqual(candidateHash, storedHash)) {
    return response.status(401).json({ error: 'Username/email or password is incorrect.' });
  }

  createSession(response, user.id);
  response.json(publicAccount(user.id));
});

app.get('/api/auth/me', requirePlayer, (request, response) => {
  response.json(publicAccount(request.playerId));
});

app.post('/api/auth/logout', (request, response) => {
  const token = getSessionToken(request);
  if (token) {
    playerDatabase.prepare('DELETE FROM player_sessions WHERE token_hash = ?').run(hashToken(token));
  }
  response.setHeader(
    'Set-Cookie',
    `${sessionCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
  );
  response.status(204).end();
});

app.get('/api/player/stats', requirePlayer, (request, response) => {
  response.json({ stats: playerStats(request.playerId) });
});

app.get('/api/player/leaderboard', requirePlayer, (_request, response) => {
  const experience = playerDatabase.prepare(`
    SELECT users.username, COALESCE(player_stats.total_exp, 0) AS totalExp
    FROM users
    LEFT JOIN player_stats ON player_stats.user_id = users.id
    ORDER BY totalExp DESC, users.username COLLATE NOCASE ASC
  `).all();
  const monstersDefeated = playerDatabase.prepare(`
    SELECT users.username, COALESCE(player_stats.monsters_defeated, 0) AS monstersDefeated
    FROM users
    LEFT JOIN player_stats ON player_stats.user_id = users.id
    ORDER BY monstersDefeated DESC, users.username COLLATE NOCASE ASC
  `).all();
  response.json({ experience, monstersDefeated });
});

const statColumns = {
  strength: 'strength',
  agility: 'agility',
  constitution: 'constitution',
  luck: 'luck',
};

app.post('/api/player/stats/allocate', requirePlayer, (request, response) => {
  const { stat } = request.body ?? {};
  if (typeof stat !== 'string' || !Object.hasOwn(statColumns, stat)) {
    return response.status(400).json({ error: 'Choose a valid character stat to increase.' });
  }

  const allocateStat = playerDatabase.transaction(() => {
    const currentStats = playerDatabase.prepare(`
      SELECT total_exp AS totalExp, strength, agility, constitution, luck
      FROM player_stats WHERE user_id = ?
    `).get(request.playerId);
    if (!currentStats) {
      return { error: 'Player stats could not be found.', status: 404 };
    }

    const allocatedPoints = currentStats.strength + currentStats.agility
      + currentStats.constitution + currentStats.luck;
    if (getLevel(currentStats.totalExp) - 1 <= allocatedPoints) {
      return { error: 'No stat points are available. Earn a level to get another point.', status: 409 };
    }

    playerDatabase.prepare(`
      UPDATE player_stats
      SET ${statColumns[stat]} = ${statColumns[stat]} + 1, updated_at = datetime('now')
      WHERE user_id = ?
    `).run(request.playerId);
    return { stats: playerStats(request.playerId) };
  });
  const result = allocateStat();
  if (result.error) {
    return response.status(result.status).json({ error: result.error });
  }
  response.json(result);
});

app.post('/api/dungeons', requirePlayer, (request, response) => {
  const suggestedLevel = request.body?.suggestedLevel;
  const dungeonKey = request.body?.dungeonKey ?? dungeons[0].id;
  const selectedDungeon = getDungeon(dungeonKey);
  if (!Number.isInteger(suggestedLevel) || suggestedLevel < 1 || suggestedLevel > 10) {
    return response.status(400).json({ error: 'Suggested character level must be from 1 to 10.' });
  }
  if (!selectedDungeon) {
    return response.status(400).json({ error: 'A valid dungeon must be selected.' });
  }

  const previousRuns = playerDatabase.prepare(`
    SELECT id FROM dungeon_runs WHERE user_id = ?
  `).all(request.playerId);
  for (const { id: previousRunId } of previousRuns) {
    removeDungeonSession(previousRunId, request.playerId);
  }

  const id = randomUUID();
  playerDatabase.prepare(`
    INSERT INTO dungeon_runs (id, user_id, suggested_level, dungeon_key) VALUES (?, ?, ?, ?)
  `).run(id, request.playerId, suggestedLevel, selectedDungeon.id);

  response.status(201).json({ dungeon: dungeonRun(id, request.playerId) });
});

app.delete('/api/dungeons/:id', requirePlayer, (request, response) => {
  const gameId = request.body?.gameId;
  if (gameId !== undefined && gameId !== null && (typeof gameId !== 'string' || gameId.length > 128)) {
    return response.status(400).json({ error: 'A valid battle ID is required.' });
  }
  removeDungeonSession(request.params.id, request.playerId, gameId);
  response.status(204).end();
});

app.post('/api/dungeons/:id/clear-stage', requirePlayer, (request, response) => {
  const { stage, gameId } = request.body ?? {};
  if (!Number.isInteger(stage) || stage < 1) {
    return response.status(400).json({ error: 'Stage must be a positive whole number.' });
  }
  if (typeof gameId !== 'string' || !gameId || gameId.length > 128) {
    return response.status(400).json({ error: 'A valid completed battle ID is required.' });
  }

  const run = playerDatabase.prepare(`
    SELECT id, dungeon_key AS dungeonKey, cleared_stages AS clearedStages, completed
    FROM dungeon_runs WHERE id = ? AND user_id = ?
  `).get(request.params.id, request.playerId);
  if (!run) {
    return response.status(404).json({ error: 'Dungeon run not found.' });
  }
  const selectedDungeon = getDungeon(run.dungeonKey);
  if (!selectedDungeon) {
    return response.status(500).json({ error: 'The dungeon configuration for this run is unavailable.' });
  }
  const stageCount = getDungeonStageCount(selectedDungeon);
  if (stage > stageCount) {
    return response.status(400).json({ error: `Stage must be between 1 and ${stageCount}.` });
  }
  if (stage <= run.clearedStages) {
    return response.json({
      dungeon: dungeonRun(request.params.id, request.playerId),
      stats: playerStats(request.playerId),
    });
  }
  if (run.completed || stage !== run.clearedStages + 1) {
    return response.status(409).json({ error: 'Dungeon stages must be cleared in order.' });
  }
  const game = findGame(gameId);
  if (!game) {
    return response.status(404).json({ error: 'Battle not found.' });
  }
  const gameState = JSON.parse(game.state);
  if (
    gameState.status !== 'complete'
    || !['player_blackjack', 'player_win', 'dealer_bust'].includes(gameState.outcome)
  ) {
    return response.status(400).json({ error: 'A stage can only be cleared after winning a completed battle.' });
  }
  const previouslyUsedBattle = playerDatabase.prepare(`
    SELECT 1 FROM dungeon_stage_clears WHERE user_id = ? AND game_id = ?
  `).get(request.playerId, gameId);
  if (previouslyUsedBattle) {
    return response.status(409).json({ error: 'This battle has already cleared a dungeon stage.' });
  }

  const clearStage = playerDatabase.transaction(() => {
    playerDatabase.prepare(`
      INSERT INTO dungeon_stage_clears (dungeon_id, user_id, stage, game_id)
      VALUES (?, ?, ?, ?)
    `).run(request.params.id, request.playerId, stage, gameId);
    playerDatabase.prepare(`
      UPDATE dungeon_runs
      SET cleared_stages = ?, completed = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `).run(stage, Number(stage === stageCount), request.params.id, request.playerId);

    if (stage === stageCount) {
      playerDatabase.prepare(`
        UPDATE player_stats
        SET total_exp = total_exp + ?,
          monsters_defeated = monsters_defeated + ?,
          updated_at = datetime('now')
        WHERE user_id = ?
      `).run(selectedDungeon.rewardExp, stageCount, request.playerId);
    }
  });
  clearStage();

  response.json({
    dungeon: dungeonRun(request.params.id, request.playerId),
    stats: playerStats(request.playerId),
  });
});

function playerStats(userId) {
  const stats = playerDatabase.prepare(`
    SELECT total_exp AS totalExp, games_played AS gamesPlayed, wins, losses, pushes,
      monsters_defeated AS monstersDefeated, strength, agility, constitution, luck
    FROM player_stats WHERE user_id = ?
  `).get(userId);
  if (!stats) {
    return null;
  }
  const allocatedPoints = stats.strength + stats.agility + stats.constitution + stats.luck;
  const level = getLevel(stats.totalExp);
  return { ...stats, level, availableStatPoints: Math.max(0, level - 1 - allocatedPoints) };
}

function dungeonRun(id, userId) {
  const run = playerDatabase.prepare(`
    SELECT id, dungeon_key AS dungeonKey, suggested_level AS suggestedLevel,
      cleared_stages AS clearedStages, completed
    FROM dungeon_runs WHERE id = ? AND user_id = ?
  `).get(id, userId);
  if (!run) {
    return null;
  }
  return { ...run, completed: Boolean(run.completed) };
}

function removeDungeonSession(id, userId, activeGameId) {
  const run = playerDatabase.prepare(`
    SELECT id FROM dungeon_runs WHERE id = ? AND user_id = ?
  `).get(id, userId);
  if (!run) return;

  const clearedGames = playerDatabase.prepare(`
    SELECT game_id AS gameId FROM dungeon_stage_clears WHERE dungeon_id = ?
  `).all(id);
  const deleteGame = database.prepare('DELETE FROM blackjack_games WHERE id = ?');
  const removeSession = playerDatabase.transaction(() => {
    playerDatabase.prepare('DELETE FROM dungeon_runs WHERE id = ? AND user_id = ?')
      .run(id, userId);
    for (const { gameId } of clearedGames) {
      deleteGame.run(gameId);
    }
    if (activeGameId) {
      deleteGame.run(activeGameId);
    }
  });
  removeSession();
}

function getLevel(totalExp) {
  let level = 1;
  let remainingExp = totalExp;
  while (remainingExp >= level * 100) {
    remainingExp -= level * 100;
    level += 1;
  }
  return level;
}

function findGame(id) {
  return database.prepare(`
    SELECT id, state, created_at AS createdAt, updated_at AS updatedAt
    FROM blackjack_games
    WHERE id = ?
  `).get(id);
}

app.post('/api/games', (_request, response) => {
  const id = newGameId();
  const state = createGameState();
  database.prepare(`
    INSERT INTO blackjack_games (id, state) VALUES (?, ?)
  `).run(id, JSON.stringify(state));
  const game = findGame(id);

  response.status(201).json({
    game: toPublicGame(game.id, state, game.createdAt, game.updatedAt),
  });
});

app.post('/api/games/:id/actions', (request, response) => {
  const game = findGame(request.params.id);
  if (!game) {
    return response.status(404).json({ error: 'Game not found.' });
  }

  const state = JSON.parse(game.state);
  const result = applyAction(state, request.body?.action);
  if (result.error) {
    return response.status(result.status).json({ error: result.error });
  }

  const updatedAt = new Date().toISOString();
  database.prepare(`
    UPDATE blackjack_games
    SET state = ?, updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(result.state), updatedAt, game.id);

  response.json({
    game: toPublicGame(game.id, result.state, game.createdAt, updatedAt),
  });
});

app.use(express.static(clientDist));

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Blackjack server listening on http://localhost:${port}`);
});
