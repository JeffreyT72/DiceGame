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
  meetsDungeonLevelRequirement,
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
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
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
const existingUserColumns = new Set(
  playerDatabase.prepare('PRAGMA table_info(users)').all().map(({ name }) => name),
);
if (!existingUserColumns.has('active')) {
  playerDatabase.exec(`
    ALTER TABLE users
    ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
  `);
}
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

playerDatabase.exec(`
  CREATE TABLE IF NOT EXISTS login_attempts (
    key TEXT PRIMARY KEY,
    failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
    first_failed_at TEXT NOT NULL DEFAULT (datetime('now')),
    locked_until TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

const app = express();
const port = Number(process.env.PORT ?? 3000);
const clientDist = resolve(projectRoot, 'dist');
const isProduction = process.env.NODE_ENV === 'production';
const sessionCookieName = 'blackjack_session';
const sessionDurationSeconds = 7 * 24 * 60 * 60;
const csrfCookieName = 'blackjack_csrf';
const csrfHeaderName = 'x-csrf-token';
const maxLoginFailures = 5;
const loginFailureWindowMs = 15 * 60 * 1000;
const loginLockoutDurationMs = 30 * 60 * 1000;

let helmet = null;
let rateLimit = null;
let csrfMiddlewareFactory = null;
try {
  ({ default: helmet } = await import('helmet'));
} catch {
  helmet = null;
}
try {
  ({ default: rateLimit } = await import('express-rate-limit'));
} catch {
  rateLimit = null;
}
try {
  ({ default: csrfMiddlewareFactory } = await import('csurf'));
} catch {
  csrfMiddlewareFactory = null;
}

const scrypt = promisify(scryptCallback);

function parseCookies(cookieHeader = '') {
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const separatorIndex = cookie.indexOf('=');
        if (separatorIndex === -1) {
          return [cookie, ''];
        }
        return [cookie.slice(0, separatorIndex), decodeURIComponent(cookie.slice(separatorIndex + 1))];
      }),
  );
}

function getCookie(request, name) {
  return parseCookies(request.headers.cookie ?? '')[name] ?? null;
}

function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function buildCookieHeader(name, value, options = {}) {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${options.maxAge ?? sessionDurationSeconds}`,
    `SameSite=${options.sameSite ?? 'Lax'}`,
    ...(options.httpOnly !== false ? ['HttpOnly'] : []),
    ...(isProduction && options.secure !== false ? ['Secure'] : []),
  ];
  return attributes.join('; ');
}

function setCookieHeader(response, name, value, options = {}) {
  const cookieHeader = buildCookieHeader(name, value, options);
  const currentHeaders = response.getHeader('Set-Cookie');
  const nextHeaders = Array.isArray(currentHeaders)
    ? [...currentHeaders, cookieHeader]
    : currentHeaders
      ? [currentHeaders, cookieHeader]
      : [cookieHeader];
  response.setHeader('Set-Cookie', nextHeaders);
}

function createRateLimiter(options = {}) {
  if (typeof rateLimit === 'function') {
    return rateLimit({
      windowMs: options.windowMs ?? 60 * 1000,
      max: options.max ?? 120,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: options.message ?? 'Too many requests. Please slow down.' },
      ...(options.rateLimitConfig ?? {}),
    });
  }

  const windowMs = options.windowMs ?? 60 * 1000;
  const max = options.max ?? 120;
  const buckets = new Map();
  return (request, response, next) => {
    const key = request.ip || request.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'anonymous';
    const now = Date.now();
    const bucket = buckets.get(key) ?? { windowStart: now, count: 0 };
    if (now - bucket.windowStart >= windowMs) {
      bucket.windowStart = now;
      bucket.count = 0;
    }
    bucket.count += 1;
    buckets.set(key, bucket);
    if (bucket.count > max) {
      return response.status(429).json({ error: options.message ?? 'Too many requests. Please slow down.' });
    }
    next();
  };
}

function generateToken() {
  return randomBytes(32).toString('hex');
}

function getLoginAttemptKey(identifier) {
  return `identifier:${String(identifier ?? '').trim().toLowerCase() || 'unknown'}`;
}

function clearFailedLoginAttempts(identifier) {
  playerDatabase.prepare('DELETE FROM login_attempts WHERE key = ?')
    .run(getLoginAttemptKey(identifier));
}

function getRemainingLockoutMs(identifier) {
  const record = playerDatabase.prepare(`
    SELECT locked_until AS lockedUntil
    FROM login_attempts WHERE key = ?
  `).get(getLoginAttemptKey(identifier));
  if (!record?.lockedUntil) {
    return 0;
  }
  const until = Date.parse(record.lockedUntil);
  return Number.isFinite(until) && until > Date.now() ? until - Date.now() : 0;
}

function registerFailedLoginAttempt(identifier) {
  const now = new Date();
  const nowIso = now.toISOString();
  const key = getLoginAttemptKey(identifier);
  const existing = playerDatabase.prepare(`
    SELECT failure_count AS failureCount, first_failed_at AS firstFailedAt
    FROM login_attempts WHERE key = ?
  `).get(key);
  if (!existing) {
    playerDatabase.prepare(`
      INSERT INTO login_attempts (key, failure_count, first_failed_at, updated_at)
      VALUES (?, 1, ?, ?)
    `).run(key, nowIso, nowIso);
    return;
  }
  const firstFailedAt = Date.parse(existing.firstFailedAt);
  const currentTime = now.getTime();
  if (Number.isFinite(firstFailedAt) && currentTime - firstFailedAt > loginFailureWindowMs) {
    playerDatabase.prepare(`
      UPDATE login_attempts
      SET failure_count = 1, first_failed_at = ?, locked_until = NULL, updated_at = ?
      WHERE key = ?
    `).run(nowIso, nowIso, key);
    return;
  }
  const nextFailureCount = Number(existing.failureCount) + 1;
  const lockedUntil = nextFailureCount >= maxLoginFailures
    ? new Date(currentTime + loginLockoutDurationMs).toISOString()
    : null;
  playerDatabase.prepare(`
    UPDATE login_attempts
    SET failure_count = ?, locked_until = ?, updated_at = ?
    WHERE key = ?
  `).run(nextFailureCount, lockedUntil, nowIso, key);
}

function csrfProtectionMiddleware(request, response, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    return next();
  }
  const tokenFromCookie = getCookie(request, csrfCookieName);
  const tokenFromHeader = request.headers[csrfHeaderName];
  if (!tokenFromCookie || typeof tokenFromHeader !== 'string' || !safeCompare(tokenFromCookie, tokenFromHeader)) {
    return response.status(403).json({ error: 'Invalid CSRF token. Refresh the page and try again.' });
  }
  next();
}

const securityHeaders = helmet
  ? helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      hsts: { maxAge: 31536000, includeSubDomains: true },
    })
  : (request, response, next) => {
      response.setHeader('X-DNS-Prefetch-Control', 'off');
      response.setHeader('X-Frame-Options', 'DENY');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
      response.setHeader('X-XSS-Protection', '0');
      response.setHeader('X-Powered-By', 'Blackjack');
      next();
    };

const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many authentication attempts. Please wait a bit and try again.',
});
const generalRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 240,
  message: 'Too many requests. Please slow down.',
});

app.disable('x-powered-by');
app.use((request, response, next) => {
  const forwardedProtocol = request.get('x-forwarded-proto')
    ?.split(',')[0]
    .trim()
    .toLowerCase();
  if (isProduction && !request.secure && forwardedProtocol !== 'https') {
    return response.redirect(308, `https://${request.get('host')}${request.originalUrl}`);
  }
  next();
});
app.use(generalRateLimiter);
app.use(securityHeaders);
app.use(express.json({ limit: '16kb' }));
app.use((request, response, next) => {
  request.cookies = parseCookies(request.headers.cookie ?? '');
  next();
});
app.use((request, response, next) => {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    return next();
  }
  const tokenFromCookie = request.cookies[csrfCookieName] ?? getCookie(request, csrfCookieName);
  const tokenFromHeader = request.headers[csrfHeaderName];
  if (!tokenFromCookie || typeof tokenFromHeader !== 'string' || !safeCompare(tokenFromCookie, tokenFromHeader)) {
    return response.status(403).json({ error: 'Invalid CSRF token. Refresh the page and try again.' });
  }
  next();
});
app.use((request, response, next) => {
  const activeToken = request.cookies[csrfCookieName] ?? generateToken();
  setCookieHeader(response, csrfCookieName, activeToken, {
    httpOnly: false,
    sameSite: 'Lax',
    secure: isProduction,
    maxAge: sessionDurationSeconds,
  });
  request.csrfToken = activeToken;
  next();
});

const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'Lax',
  secure: isProduction,
  maxAge: sessionDurationSeconds,
};

function setSessionCookie(response, token) {
  setCookieHeader(response, sessionCookieName, token, sessionCookieOptions);
}

function setLogoutCookie(response) {
  setCookieHeader(response, sessionCookieName, '', {
    ...sessionCookieOptions,
    maxAge: 0,
  });
}

app.get('/api/csrf-token', (request, response) => {
  const token = request.cookies[csrfCookieName] ?? generateToken();
  setCookieHeader(response, csrfCookieName, token, {
    httpOnly: false,
    sameSite: 'Lax',
    secure: isProduction,
    maxAge: sessionDurationSeconds,
  });
  response.json({ csrfToken: token });
});

app.use('/api/auth', authRateLimiter);

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
    SELECT player_sessions.user_id AS userId, users.active
    FROM player_sessions
    JOIN users ON users.id = player_sessions.user_id
    WHERE player_sessions.token_hash = ? AND player_sessions.expires_at > ?
  `).get(hashToken(token), new Date().toISOString());
  if (!session) {
    return response.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
  if (session.active !== 1) {
    return response.status(403).json({ error: 'This account is inactive.' });
  }

  request.playerId = session.userId;
  next();
}

app.post('/api/auth/signup', async (request, response) => {
  if (request.body?.honeypot === true || request.body?.honeypot === 'true' || request.body?.honeypot === 'on') {
    return response.status(400).json({ error: 'Unable to create account.' });
  }

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
        INSERT INTO users (id, username, email, password_hash, password_salt, active)
        VALUES (?, ?, ?, ?, ?, 1)
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

  clearFailedLoginAttempts(username);
  createSession(response, userId);
  response.status(201).json(publicAccount(userId));
});

app.post('/api/auth/login', async (request, response) => {
  const identifier = typeof request.body?.identifier === 'string' ? request.body.identifier.trim() : '';
  const password = typeof request.body?.password === 'string' ? request.body.password : '';
  if (!identifier || !password || identifier.length > 254 || password.length > 128) {
    return response.status(400).json({ error: 'Enter your username or email and password.' });
  }

  const lockoutMs = getRemainingLockoutMs(identifier);
  if (lockoutMs > 0) {
    const secondsRemaining = Math.max(1, Math.ceil(lockoutMs / 1000));
    return response.status(429).json({ error: `Too many failed login attempts. Please try again in ${secondsRemaining} seconds.` });
  }

  const user = playerDatabase.prepare(`
    SELECT id, password_hash AS passwordHash, password_salt AS passwordSalt, active
    FROM users WHERE username = ? OR email = ?
  `).get(identifier, identifier);
  if (!user) {
    registerFailedLoginAttempt(identifier);
    return response.status(401).json({ error: 'Username/email or password is incorrect.' });
  }

  const candidateHash = await scrypt(password, user.passwordSalt, 64);
  const storedHash = Buffer.from(user.passwordHash, 'hex');
  if (!timingSafeEqual(candidateHash, storedHash)) {
    registerFailedLoginAttempt(identifier);
    const remainingLockoutMs = getRemainingLockoutMs(identifier);
    if (remainingLockoutMs > 0) {
      const secondsRemaining = Math.max(1, Math.ceil(remainingLockoutMs / 1000));
      return response.status(429).json({ error: `Too many failed login attempts. Please try again in ${secondsRemaining} seconds.` });
    }
    return response.status(401).json({ error: 'Username/email or password is incorrect.' });
  }

  if (user.active !== 1) {
    return response.status(403).json({ error: 'This account is inactive.' });
  }

  clearFailedLoginAttempts(identifier);
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
  setLogoutCookie(response);
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
    WHERE users.active = 1
    ORDER BY totalExp DESC, users.username COLLATE NOCASE ASC
  `).all();
  const monstersDefeated = playerDatabase.prepare(`
    SELECT users.username, COALESCE(player_stats.monsters_defeated, 0) AS monstersDefeated
    FROM users
    LEFT JOIN player_stats ON player_stats.user_id = users.id
    WHERE users.active = 1
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
  const stats = playerStats(request.playerId);
  if (!stats) {
    return response.status(404).json({ error: 'Player stats could not be found.' });
  }
  if (!meetsDungeonLevelRequirement(selectedDungeon, stats.level)) {
    return response.status(403).json({
      error: `You must be at least level ${selectedDungeon.levelRequirement} to enter this dungeon.`,
    });
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

    const stats = playerDatabase.prepare(`
      SELECT total_exp AS totalExp FROM player_stats WHERE user_id = ?
    `).get(request.playerId);
    const killExp = getLevel(stats.totalExp) * 3;
    const completionBonus = stage === stageCount ? selectedDungeon.rewardExp : 0;
    const expAwarded = killExp + completionBonus;
    playerDatabase.prepare(`
      UPDATE player_stats
      SET total_exp = total_exp + ?,
        monsters_defeated = monsters_defeated + 1,
        updated_at = datetime('now')
      WHERE user_id = ?
    `).run(expAwarded, request.playerId);
    return expAwarded;
  });
  const expAwarded = clearStage();

  response.json({
    dungeon: dungeonRun(request.params.id, request.playerId),
    stats: playerStats(request.playerId),
    expAwarded,
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
