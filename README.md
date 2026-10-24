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

Open the Vite URL shown in the terminal (usually <http://localhost:5173>). The frontend proxies `/api` requests to the backend at <http://localhost:3000>.

## Production build

```sh
npm run build
npm start
```

The server serves the built frontend and API from <http://localhost:3000>.

## Dungeon rules

- The suggested character level follows your current level (capped at level 10). Each dungeon's `levelRequirement` sets the minimum actual character level required to enter; the suggested level does not override that requirement.
- Choose a dungeon from the Dungeons page. Each definition in `shared/dungeon-config.js` contains its configured stage count, minimum character level, mob encounters, boss, and EXP reward. Mob encounters repeat as needed until the final configured stage, which uses the boss. The server enforces the minimum character level.
- Every mob and boss defines HP, attack power, and defense. HP sets monster health, attack power adds to its blackjack attack, and defense reduces damage from player attacks (to a minimum of 1).
- Combat uses blackjack hands. On the initial two-card turn, the player can double down to draw exactly one card and end their turn. If the hand wins, the attack deals double damage; if it loses, the player takes double damage. Each hit press in a hand increases the player's attack multiplier: the first hit is 1.2x, the second is 1.4x, and each additional hit adds 0.2x. Luck can increase a winning attack to 1.5x on a critical hit. Winning deals the player's hand score plus STR and item attack, reduced by monster defense (minimum 1 damage). Losing deals the dealer's score plus monster attack power to the player, and AGI provides a chance to dodge.
- Before each hand, optionally wager 10%, 25%, or 50% of current HP, or skip the wager. A wager stake is deducted immediately and is not refunded; a winning attack gains bonus damage equal to twice the wager percentage (20%, 50%, or 100%). Skipping costs no HP and adds no damage bonus.
- After each cleared stage except the final boss, choose one of three distinct items drawn by configurable chance from `client/src/items.js`. Item effects stack for the current dungeon run only and are removed when the run ends. The six starting items add attack, damage reduction, maximum HP, dodge chance, critical chance, or healing on a successful hit.
- A defeated character loses the run. Clearing a dungeon awards the EXP reward configured for that dungeon.
- Character progression and allocated stats are saved to the player's account. Each level gained grants one stat point to allocate to STR (+1 damage), AGI (+5% dodge chance), CON (+20 maximum HP), or Luck (+3% critical chance).

Dungeon progress is temporary and is not saved for recovery. Entering a dungeon always starts at stage 1; leaving the dungeon or completing the final stage removes the run and its battle records. Dungeon stage clears are recorded on the server while the run is active and must be completed in order. The server awards the configured clear reward once, when the final boss is defeated.

## Accounts and storage

Create an account or sign in before playing. Player accounts, password hashes, login sessions, and progression are stored in `data/player-accounts.sqlite`. Active dungeon stages and blackjack hands are stored temporarily in the respective databases and removed when a run ends. Both databases are created automatically.

Set `DATABASE_PATH` or `PLAYER_DATABASE_PATH` to use other SQLite files, or `PORT` to change the server port. Passwords are hashed with Node's scrypt; login sessions use expiring, HttpOnly cookies, and the server sets secure same-site cookie flags in production. The app also adds HTTP security headers, request throttling, CSRF protection on non-GET requests, and login lockouts after repeated failures.

## API

- `POST /api/auth/signup` creates an account and starts a session.
- `POST /api/auth/login` signs in with a username or email and password.
- `GET /api/auth/me` returns the signed-in account and player stats.
- `POST /api/auth/logout` ends the current session.
- `GET /api/player/stats` returns the signed-in player's stats.
- `GET /api/player/leaderboard` returns separate username rankings by total EXP and monsters defeated.
- `POST /api/player/stats/allocate` accepts `{ "stat": "strength" }`, `"agility"`, `"constitution"`, or `"luck"` and spends one available stat point.
- `POST /api/dungeons` starts a run with `{ "dungeonKey": "verdant-hollow", "suggestedLevel": 1 }` (suggested level valid values: 1–10; dungeon key defaults to `verdant-hollow`).
- `DELETE /api/dungeons/:id` removes the signed-in player's run and its battle records. An optional `{ "gameId": "..." }` removes the current hand as well.
- `POST /api/dungeons/:id/clear-stage` accepts `{ "stage": 1, "gameId": "..." }`; only a completed winning hand can clear the next stage, and clearing the final configured stage awards the dungeon EXP reward.
- `POST /api/games` starts a blackjack hand.
- `POST /api/games/:id/actions` accepts `{ "action": "hit" }`, `{ "action": "stand" }`, or `{ "action": "double_down" }`. Double down is only available on the player's initial two-card turn.

## Project structure

```text
client/
  src/
    main.js             App setup and dungeon orchestration
    game/combat.js      Blackjack combat resolution
    services/api.js     Shared API requests
    ui/auth.js          Sign-in, sign-up, and session controls
    ui/character-lab.js Character progression and stat allocation
    ui/dungeon-catalog.js Dungeon and monster catalog page
    ui/leaderboard.js   Leaderboard loading and rendering
    ui/loot.js          Run inventory and item-choice rendering
    ui/screens.js       Lobby, dungeon catalog, Lab, leaderboard, and placeholder navigation
    blackjack-scene.js  Phaser dungeon battlefield
server/                 Express API, blackjack rules, accounts, and dungeon progression
shared/dungeon-config.js Dungeon definitions and mob/boss attributes
data/                   SQLite databases (created at runtime)
```

Add a dungeon by appending a definition to `shared/dungeon-config.js` with its mob list, boss, and reward. The Dungeons page displays its encounters and monster attributes automatically. After signing in, the game menu also links to the character-stat Lab, leaderboards ranked by total EXP and monsters defeated, character selection in Settings, and placeholder Multiplayer features. The selected character is saved in the browser.
