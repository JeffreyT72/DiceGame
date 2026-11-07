# Blackjack Survivors

Blackjack Survivors is a browser-based dungeon game where blackjack hands decide attacks and survival. Play alone or team up in real-time multiplayer, earn experience, improve your character, and customize your appearance and table.

## Features

- Single-player dungeons with staged monster encounters, boss fights, loot, and persistent character progression.
- Infinite Tower solo runs with a ten-floor climb, recurring bosses, and escalating monster stats.
- Blackjack combat actions including hit, stand, double down, split, wagers, and character-stat bonuses.
- Multiplayer rooms for up to four signed-in players, with shared encounters and turn-based rounds.
- Character and table customization, a store, and tabbed leaderboards (Total EXP by default, Monsters defeated, Highest tower floor) showing the top 50 players plus your own rank, refreshed about once a minute.
- Five daily quests are randomly selected from ten possible blackjack, betting, double-down, dealer-bust, split, monster, boss, and dungeon-clear goals. Each completed quest can be claimed for 100 gold; quests reset at midnight UTC.

## Requirements

- Node.js 20 or newer
- npm

## Run locally

```sh
npm install
npm run dev
```

Open the Vite URL printed in the terminal (usually <http://localhost:5173>). The Vite development server proxies API requests and multiplayer WebSocket connections to the app server at <http://localhost:3000>.

## Test and build

```sh
npm test
npm run build
```

Tests use Node's built-in test runner. `npm run build` creates the production frontend in `dist/`.

To run the production server locally, build first and then run:

```sh
npm start
```

The app is served at <http://localhost:3000>.

## Gameplay and configuration

Single-player dungeon definitions, including stage counts, level requirements, encounters, bosses, and experience rewards, live in [`shared/dungeon-config.js`](./shared/dungeon-config.js). Tower encounters, scaling, and floor rewards are in [`shared/tower-config.js`](./shared/tower-config.js). Multiplayer dungeon definitions are separate in [`shared/dungeon-multiplayer-config.js`](./shared/dungeon-multiplayer-config.js). Combat rules and item definitions are in `shared/`; the server validates and resolves gameplay outcomes.

Each dungeon run starts at stage 1 and is temporary. Clearing the final boss awards the configured dungeon experience; a defeated character loses the run. Character level-ups grant a stat point for strength, agility, constitution, or luck. Run items do not persist after the run ends.

The Character screen includes generated tunic colors for the Chibi paper-doll model. The selected top is saved to the account; other character sprites keep their original art.

Multiplayer rooms support two to four signed-in players. The host starts the dungeon, the party shares monster health and each blackjack round's dealer hand, and players take turns. Room membership and active progress are held in server memory and are lost if the server restarts. WebSocket connections use the signed-in session and require a same-host browser origin.

Infinite Tower reuses the dungeon monster roster and battle scene. A boss appears every tenth floor; monster health, attack, and defense increase by 20% each ten-floor block. The ten-floor progress track resets after each boss while the overall floor count continues. Tower progress is temporary and is not saved for resuming, but each player's highest cleared floor is recorded for the tower leaderboard; cleared floors award EXP and loot, with each floor's EXP capped at five times the EXP required for the player's next level.

## Accounts and data

The server creates its SQLite databases automatically:

- `data/blackjack.sqlite` for active blackjack-game state.
- `data/player-accounts.sqlite` for accounts, sessions, progression, purchases, and player settings.

Set `DATABASE_PATH` or `PLAYER_DATABASE_PATH` to change the database file locations, or `PORT` to change the server port (default `3000`). Set `REDIS_URL` (for example `redis://127.0.0.1:6379`) to cache leaderboard rankings in Redis for 60 seconds; without it, or while Redis is unreachable, the leaderboard is read live from SQLite. The local `data/` directory is ignored by Git; back up database files before moving or replacing them.

## Deployment

The Docker image builds the frontend and runs the production server on port `3000`. [`docker-compose.tunnel.yml`](./docker-compose.tunnel.yml) mounts `./data` for persistence and attaches the service to the `blackjack-tunnel` network. The Redis leaderboard cache is currently disabled there (no `REDIS_URL`, Redis service commented out), so the leaderboard reads SQLite; uncomment it to run Redis on the compose project's default network, which the tunnel network cannot reach.

In production, the server redirects HTTP requests to HTTPS. When TLS terminates at a reverse proxy or tunnel, configure it to overwrite and forward `X-Forwarded-Proto: https`, and forward WebSocket upgrade requests to the app. The proxy and app must use the same host for browser-origin checks.

## Project layout

```text
client/
  index.html             App screens and UI markup
  src/
    main.js              Client setup and single-player orchestration
    game/                Phaser scenes, combat presentation, characters
    services/            HTTP API and WebSocket clients
    ui/                  Authentication, screens, progression, and menus
    styles/              Application styles
server/
  server.js              Express API, accounts, persistence, and WebSockets
  blackjack.js           Blackjack hand state and actions
  multiplayer.js         In-memory multiplayer room state
shared/                  Gameplay rules, dungeon configs, items, and themes
data/                    Runtime SQLite databases (not committed)
```
