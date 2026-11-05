import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import test from 'node:test';

async function getFreePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

test('paper-doll tops are validated and persisted per account', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'dicegame-paper-doll-'));
  const playerDatabasePath = join(directory, 'players.sqlite');
  const legacyDatabase = new Database(playerDatabasePath);
  legacyDatabase.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE player_stats (
      user_id TEXT PRIMARY KEY,
      total_exp INTEGER NOT NULL DEFAULT 0,
      strength INTEGER NOT NULL DEFAULT 0,
      agility INTEGER NOT NULL DEFAULT 0,
      constitution INTEGER NOT NULL DEFAULT 0,
      luck INTEGER NOT NULL DEFAULT 0,
      currency INTEGER NOT NULL DEFAULT 0,
      games_played INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      pushes INTEGER NOT NULL DEFAULT 0,
      monsters_defeated INTEGER NOT NULL DEFAULT 0,
      character_name TEXT NOT NULL DEFAULT '',
      character TEXT NOT NULL DEFAULT 'chibi',
      title TEXT NOT NULL DEFAULT '0',
      frame TEXT NOT NULL DEFAULT '',
      table_theme TEXT NOT NULL DEFAULT 'default',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  legacyDatabase.prepare(`
    INSERT INTO users (id, username, email, password_hash, password_salt)
    VALUES ('legacy-user', 'legacy_user', 'legacy@example.test', 'unused', 'unused')
  `).run();
  legacyDatabase.prepare(`
    INSERT INTO player_stats (user_id) VALUES ('legacy-user')
  `).run();
  legacyDatabase.close();

  const port = await getFreePort();
  const serverPath = fileURLToPath(new URL('./server.js', import.meta.url));
  const server = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: join(directory, 'blackjack.sqlite'),
      PLAYER_DATABASE_PATH: playerDatabasePath,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let serverErrors = '';
  server.stderr.setEncoding('utf8');
  server.stderr.on('data', (chunk) => { serverErrors += chunk; });
  t.after(async () => {
    if (server.exitCode === null) {
      server.kill('SIGTERM');
      await new Promise((resolve) => server.once('exit', resolve));
    }
    await rm(directory, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  let csrfResponse;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Test server exited during startup: ${serverErrors}`);
    }
    try {
      csrfResponse = await fetch(`${baseUrl}/api/csrf-token`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert.ok(csrfResponse?.ok, `Test server did not start: ${serverErrors}`);
  const migratedDatabase = new Database(playerDatabasePath, { readonly: true });
  const migratedStats = migratedDatabase.prepare(`
    SELECT character, top FROM player_stats WHERE user_id = 'legacy-user'
  `).get();
  migratedDatabase.close();
  assert.deepEqual(migratedStats, { character: 'chibi', top: 'crimson' });

  const csrfToken = (await csrfResponse.json()).csrfToken;
  const csrfCookie = `blackjack_csrf=${csrfToken}`;
  const signupResponse = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: csrfCookie,
      'x-csrf-token': csrfToken,
    },
    body: JSON.stringify({
      username: 'paper_doll_test',
      characterName: 'Paper Doll',
      email: 'paper-doll@example.test',
      password: 'valid-test-password',
    }),
  });
  assert.equal(signupResponse.status, 201, `${await signupResponse.text()} ${serverErrors}`);
  const sessionCookie = signupResponse.headers.get('set-cookie').match(/blackjack_session=([^;,]+)/)?.[1];
  assert.ok(sessionCookie);
  const cookie = `${csrfCookie}; blackjack_session=${sessionCookie}`;
  const requestOptions = {
    headers: { Cookie: cookie, 'x-csrf-token': csrfToken },
  };

  const invalidTopResponse = await fetch(`${baseUrl}/api/player/costume`, {
    ...requestOptions,
    method: 'PATCH',
    headers: { ...requestOptions.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ top: 'not-a-top' }),
  });
  assert.equal(invalidTopResponse.status, 400);

  const updateResponse = await fetch(`${baseUrl}/api/player/costume`, {
    ...requestOptions,
    method: 'PATCH',
    headers: { ...requestOptions.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ top: 'azure' }),
  });
  assert.equal(updateResponse.status, 200);
  assert.equal((await updateResponse.json()).stats.top, 'azure');

  const statsResponse = await fetch(`${baseUrl}/api/player/stats`, requestOptions);
  assert.equal((await statsResponse.json()).stats.top, 'azure');
});
