# Dungeon Run

A single-player roguelike built with a Node.js/Express API, SQLite persistence, and a JavaScript frontend rendered with Phaser.

## Requirements

- Node.js 20 or newer
- npm

## Run locally

```sh
npm install
npm run dev
```

Open the Vite URL shown in the terminal (usually <http://localhost:5173>). The frontend proxies `/api` requests and `/ws` WebSocket connections to the backend at <http://localhost:3000>.

## Production build

```sh
npm run build
npm start
```

The server serves the built frontend and API from <http://localhost:3000> in local development. In production, HTTP requests are redirected to HTTPS. When TLS terminates at a reverse proxy or tunnel, it must overwrite and forward `X-Forwarded-Proto`; the server redirects unless its value is `https`. The tunnel-to-container connection can remain HTTP on its private network.

## Dungeon rules

- The suggested character level follows your current level (capped at level 10). Each dungeon's `levelRequirement` sets the minimum actual character level required to enter; the suggested level does not override that requirement.
- Choose a dungeon from the Dungeons page. Each definition in `shared/dungeon-config.js` contains its configured stage count, minimum character level, mob encounters, boss, and EXP reward. Mob encounters repeat as needed until the final configured stage, which uses the boss. The server enforces the minimum character level.
- Every mob and boss defines HP, attack power, and defense. HP sets monster health, attack power adds to its blackjack attack, and defense reduces damage from player attacks (to a minimum of 1).
- Combat uses blackjack hands. On the initial two-card turn, the player can double down to draw exactly one card and end their turn. If the hand wins, the attack deals double damage; if it loses, the player takes double damage. Each hit press in a hand increases the player's attack multiplier: the first hit is 1.2x, the second is 1.4x, and each additional hit adds 0.2x. Winning with matching ranks in the initial two cards multiplies attack damage by 1.5; winning with exactly five cards without busting doubles attack damage on top of hit multipliers. If the player does not hit, monster damage is reduced by 50%. Luck can increase a winning attack to 1.5x on a critical hit. Winning deals the player's hand score plus STR and item attack, reduced by monster defense (minimum 1 damage). Losing deals the dealer's score plus monster attack power to the player, and AGI provides a chance to dodge.
- Before each hand, optionally wager 10%, 25%, or 50% of current HP, or skip the wager. A wager stake is deducted immediately and is not refunded; a winning attack gains bonus damage equal to twice the wager percentage (20%, 50%, or 100%). Skipping costs no HP and adds no damage bonus.
- After each cleared stage except the final boss, choose one of three distinct items drawn by configurable chance from `client/src/items.js`. Item effects stack for the current dungeon run only and are removed when the run ends. The six starting items add attack, damage reduction, maximum HP, dodge chance, critical chance, or healing on a successful hit.
- A defeated character loses the run. Clearing a dungeon awards the EXP reward configured for that dungeon.
- Character progression and allocated stats are saved to the player's account. Each level gained grants one stat point to allocate to STR (+1 damage), AGI (+5% dodge chance), CON (+20 maximum HP), or Luck (+3% critical chance).

Dungeon progress is temporary and is not saved for recovery. Entering a dungeon always starts at stage 1; leaving the dungeon or completing the final stage removes the run and its battle records. Dungeon stage clears are recorded on the server while the run is active and must be completed in order. The server awards the configured clear reward once, when the final boss is defeated.

## Multiplayer

Open Multiplayer from the game menu to create a room or join one with its six-character room code. Rooms support up to four signed-in players. The host starts the dungeon once at least two players have joined. Room membership and dungeon progress live in server memory and are lost if the server restarts.

Multiplayer runs the full dungeon in `shared/dungeon-multiplayer-config.js`. The party shares each monster's HP, and up to four players sit at one blackjack table facing a shared dealer hand and shoe for each round. Each round starts with a shared 30-second betting window; players can wager 10%, 25%, or 50% of their HP, or skip. Bets are spent immediately, and a win earns the corresponding damage bonus. After the opening deal, players take turns in room order with 30 seconds each; the dealer stays hidden until every living player has finished deciding. The dealer then reveals, and the party resolves the round against the monster. A player at zero HP is defeated and no longer takes turns. After each cleared stage, every surviving player has 30 seconds to make an individual item choice; missed bets default to no wager and missed item choices take the first offered item. Each surviving player receives the per-monster EXP and, for clearing the final boss, the dungeon's configured EXP reward.

WebSocket connections use the same signed-in session cookie as the HTTP API and require a same-host browser origin. Production reverse proxies must forward WebSocket upgrade requests to the app.

## Accounts and storage

Create an account or sign in before playing. Player accounts, password hashes, login sessions, and progression are stored in `data/player-accounts.sqlite`. Active dungeon stages and blackjack hands are stored temporarily in the respective databases and removed when a run ends. Both databases are created automatically.

Set `DATABASE_PATH` or `PLAYER_DATABASE_PATH` to use other SQLite files, or `PORT` to change the server port. Passwords are hashed with Node's scrypt; login sessions use expiring, HttpOnly cookies, and the server sets secure same-site cookie flags in production. The app also adds HTTP security headers, request throttling, CSRF protection on non-GET requests, and login lockouts after repeated failures.

## API

- `POST /api/auth/signup` creates an account and starts a session.
- `POST /api/auth/login` signs in with a username or email and password.
- `GET /api/auth/me` returns the signed-in account and player stats.
- `POST /api/auth/logout` ends the current session.
- `GET /api/player/stats` returns the signed-in player's stats and costume (`character`, `title`, and `frame`).
- `PATCH /api/player/costume` saves one or more costume fields for the signed-in player.
- `GET /api/player/leaderboard` returns separate username rankings by total EXP and monsters defeated.
- `POST /api/player/stats/allocate` accepts `{ "stat": "strength" }`, `"agility"`, `"constitution"`, or `"luck"` and spends one available stat point.
- `POST /api/dungeons` starts a run with `{ "dungeonKey": "verdant-hollow", "suggestedLevel": 1 }` (suggested level valid values: 1–10; dungeon key defaults to `verdant-hollow`).
- `DELETE /api/dungeons/:id` removes the signed-in player's run and its battle records. An optional `{ "gameId": "..." }` removes the current hand as well.
- `POST /api/dungeons/:id/clear-stage` accepts `{ "stage": 1, "gameId": "..." }`; only a completed winning hand can clear the next stage, and clearing the final configured stage awards the dungeon EXP reward.
- `POST /api/games` starts a blackjack hand.
- `POST /api/games/:id/actions` accepts `{ "action": "hit" }`, `{ "action": "stand" }`, or `{ "action": "double_down" }`. Double down is only available on the player's initial two-card turn.
- `WS /ws/multiplayer` provides authenticated room actions for creating and joining rooms, starting the dungeon, playing a turn, choosing loot, and leaving the room.

## Project structure

```text
client/
  src/
    main.js             App setup and dungeon orchestration
    game/combat.js      Blackjack combat resolution
    services/api.js     Shared API requests
    services/multiplayer.js WebSocket client connection
    ui/auth.js          Sign-in, sign-up, and session controls
    ui/character-lab.js Character progression and stat allocation
    ui/dungeon-catalog.js Dungeon and monster catalog page
    ui/leaderboard.js   Leaderboard loading and rendering
    ui/loot.js          Run inventory and item-choice rendering
    ui/multiplayer.js   Multiplayer room controls and party display
    ui/screens.js       Lobby, dungeon catalog, Lab, leaderboard, and screen navigation
    blackjack-scene.js  Phaser dungeon battlefield and multiplayer table
server/                 Express API, blackjack rules, accounts, and WebSocket rooms
shared/dungeon-multiplayer-config.js Multiplayer dungeon encounters
shared/dungeon-config.js Dungeon definitions and mob/boss attributes
data/                   SQLite databases (created at runtime)
```

Add a single-player dungeon by appending a definition to `shared/dungeon-config.js`; multiplayer encounters are configured separately in `shared/dungeon-multiplayer-config.js`. After signing in, the game menu links to the character-stat Lab, leaderboards ranked by total EXP and monsters defeated, character selection in Settings, and Multiplayer rooms. The selected character is saved in the browser.
