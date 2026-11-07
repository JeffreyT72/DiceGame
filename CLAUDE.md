# CLAUDE.md

Blackjack Survivors: browser dungeon game where blackjack hands drive combat. Plain JS ES modules, no framework.
Client = Vite + Phaser 3 + vanilla DOM; server = Express 5 + better-sqlite3 + ws. Gameplay rules/setup/deploy are in README.md; read it before changing gameplay.

## Commands
- `npm run dev` – server (`node --watch`, :3000) + Vite (:5173, proxies `/api` and `/ws` to :3000)
- `npm test` – `node --test` (all `*.test.js`). Single file: `node --test server/blackjack.test.js`
- `npm run build` – Vite builds `client/` → `dist/`; `npm start` serves `dist/` + API on :3000
- No lint script. `eslint.config.js` pulls in TS/React presets that don't fit this plain-JS codebase; don't claim lint passed unless you ran `npx eslint` yourself.
- `vitest` is listed in dependencies but unused; tests use `node:test` + `node:assert/strict`.

## Architecture
- **Vite root is `client/`**; client imports shared code with relative paths (`../../shared/...`). Anything in `shared/` must stay browser-safe (no `node:` imports).
- **Single-player is split trust.** The server owns blackjack hands (`server/blackjack.js`, state stored as JSON in `blackjack_games`). The client computes HP, damage, items and run state (`client/src/game/combat.js` `resolveCombatRound`, `runState` in `client/src/main.js`). The server only checks clears (`/api/dungeons/:id/clear-stage`, `/api/tower-runs/:id/clear-floor`): the game must be complete and won, stages/floors must be cleared in order, and each `gameId` can be redeemed once across `dungeon_stage_clears` and `player_exp_awards`.
- **Multiplayer is fully server-authoritative** in `server/multiplayer.js` (`MultiplayerRooms`, in memory, lost on restart). The WebSocket is at `/ws/multiplayer`. Client messages are `create_room | join_room | start_game | action | bet | choose_item | leave_room`, and the server replies with `room_state` broadcasts. Upgrades require a same-host `Origin` and a valid session.
- **Tower runs** are in memory only (`server/tower-runs.js`).
- **`server/server.js` is one big file**: DB setup, migrations, middleware, every REST route, WS upgrade, and `listen()` all run at import time. It can't be imported in tests (see Testing).
- **Two SQLite DBs:** `data/blackjack.sqlite` (games) and `data/player-accounts.sqlite` (users, sessions, stats, purchases, runs, quests). The schema lives inline in `server.js` as `CREATE TABLE IF NOT EXISTS` plus additive migrations (check `PRAGMA table_info` columns, then `ALTER TABLE ADD COLUMN`, or a table-rebuild for constraint changes). Add schema changes the same way and preserve existing rows. `server/SQLite.sql` is a scratch file of ad-hoc admin queries, not the schema.
- **Auth:** `blackjack_session` httpOnly cookie, stored as a SHA-256 hash in `player_sessions`. The `requirePlayer` middleware sets `request.playerId`.
- **CSRF:** hand-rolled double-submit. The `blackjack_csrf` cookie must match the `x-csrf-token` header on every non-GET request. The client must call the API through `request()` in `client/src/services/api.js`, which attaches the token; raw `fetch` POSTs will get 403. (`csurf` is imported but not used.)
- **Client structure:** `client/src/main.js` is the orchestrator. It holds global state (`currentStats`, `runState`, `currentGame`) and wires the `client/src/ui/*` modules. Each module is a `createXController({ ...callbacks })` factory. Screens are `<section id="*-screen">` elements in `client/index.html`, toggled via `hidden` by `ui/screens.js`. DOM ids in the HTML and the `querySelector` calls must stay in sync.
- **Phaser:** `createBlackjackGame()` creates two `Phaser.Game` instances, `game.cards` (CardScene) and `game.battlefield` (BlackjackScene). Both register the scene key `'blackjack'`. Call into them with `game.cards.scene.getScene('blackjack')?.method()`. Initial settings go through `game.registry`. Multiplayer uses a separate `createBlackjackMultiplayerGame()` / `MultiplayerTableScene`.
- **Single-player vs multiplayer dungeons** are deliberately separate configs: `shared/dungeon-config.js` and `shared/dungeon-multiplayer-config.js`.

## Change-together checklist
- **Damage formula** is duplicated: `client/src/game/combat.js` `resolveCombatRound` (single-player) and `server/multiplayer.js` `resolveHand` (multiplayer). Shared hand modifiers live in `shared/combat-rules.js`.
- **Wager percentages `[0, 0.1, 0.25, 0.5]`** appear in `main.js` `startHand`, `POST /api/games`, `MultiplayerRooms.placeBet`, and the `data-wager` / `data-multiplayer-bet` buttons in `index.html`.
- **Winning outcomes `player_blackjack | player_win | dealer_bust`** are repeated in `combat.js`, `multiplayer.js`, and the `server.js` clear/quest handlers.
- **Character ids:** `characters` in `client/src/game/characters.js` must match the `costumeCharacters` set in `server.js`. The default (`chibi`) is also the DB column default.
- **Daily quest types** passed to `dailyQuests.record(userId, type)` must exist in `dailyQuestDefinitions` (`server/daily-quests.js`).
- **Store items** (titles, table themes, paper-doll tops) are defined in `shared/` and validated server-side by id.

## Testing
- Tests sit next to the code as `*.test.js`. Pure modules are tested directly, e.g. `combat.test.js` with plain-object `runState`, `PaperDoll` with fake sprites, `MultiplayerRooms` with `EventEmitter` fake sockets.
- `server/daily-quests.test.js` uses `new Database(':memory:')` and creates only the tables it needs.
- HTTP-level tests (`server/paper-doll.test.js`) spawn `server/server.js` as a child process. They pass a free `PORT` and temp `DATABASE_PATH` / `PLAYER_DATABASE_PATH`, and they're the template for testing routes or migrations.

## Rules
- This website served as a game. Focus on vistual, UI/UX, animation.
- Never edit, delete, or replace `data/*.sqlite*`. They hold real player accounts. Never commit DB files or secrets.
- Update README.md when setup, gameplay, config, or deploy behavior changes.
- `.github/prompts/`, `.github/skills/`, `.claude/skills/`, `ponytail/` and `.codegraph/` are AI-tooling, not app code; skip them when searching.
