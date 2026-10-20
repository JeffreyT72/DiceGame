# Dungeon Run

A single-player, 10-stage roguelike built with a Node.js/Express API, SQLite persistence, and a JavaScript frontend rendered with Phaser.

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

- The read-only suggested character level follows your current level (capped at level 10) and does not restrict entry.
- Clear 10 stages in order. Stages 1–9 have a 20 HP mob; stage 10 has a 100 HP boss.
- The stage count is shared by the client and server in `shared/dungeon-config.js`; change `dungeonStageCount` there to adjust the run length.
- Combat uses blackjack hands. Winning deals the player's hand score plus STR as damage; Luck can increase that damage to 1.5x on a critical hit. Losing deals the dealer's score to the player, and AGI provides a chance to dodge.
- After each cleared stage except the final boss, choose one of three distinct items drawn by configurable chance from `client/src/items.js`. Item effects stack for the current dungeon run only and are removed when the run ends. The six starting items add attack, damage reduction, maximum HP, dodge chance, critical chance, or healing on a successful hit.
- A defeated character loses the run. Clearing stage 10 awards one 1,000 EXP dungeon-clear reward.
- Character progression and allocated stats are saved to the player's account. Each level gained grants one stat point to allocate to STR (+1 damage), AGI (+5% dodge chance), CON (+20 maximum HP), or Luck (+3% critical chance).

Combat health, dungeon stage, pending stage saves, and selected items are stored in the browser for run recovery. Dungeon stage clears are also recorded on the server and must be completed in order. The server awards the clear reward once, when stage 10 is won.

## Accounts and storage

Create an account or sign in before playing. Player accounts, password hashes, sessions, player progression, and dungeon stage records are stored in `data/player-accounts.sqlite`. Blackjack hands are stored in `data/blackjack.sqlite`. Both databases are created automatically.

Set `DATABASE_PATH` or `PLAYER_DATABASE_PATH` to use other SQLite files, or `PORT` to change the server port. Passwords are hashed with Node's scrypt; login sessions use expiring, HttpOnly cookies.

## API

- `POST /api/auth/signup` creates an account and starts a session.
- `POST /api/auth/login` signs in with a username or email and password.
- `GET /api/auth/me` returns the signed-in account and player stats.
- `POST /api/auth/logout` ends the current session.
- `GET /api/player/stats` returns the signed-in player's stats.
- `GET /api/player/leaderboard` returns separate username rankings by total EXP and monsters defeated.
- `POST /api/player/stats/allocate` accepts `{ "stat": "strength" }`, `"agility"`, `"constitution"`, or `"luck"` and spends one available stat point.
- `POST /api/dungeons` starts a run with `{ "suggestedLevel": 1 }` (valid values: 1–10).
- `GET /api/dungeons/:id` returns the signed-in player's run progress.
- `POST /api/dungeons/:id/clear-stage` accepts `{ "stage": 1, "gameId": "..." }`; only a completed winning hand can clear the next stage, and clearing stage 10 awards the dungeon EXP reward.
- `POST /api/games` starts a blackjack hand.
- `GET /api/games/:id` returns a saved hand, hiding the dealer's hole card until the hand ends.
- `POST /api/games/:id/actions` accepts `{ "action": "hit" }` or `{ "action": "stand" }`.

## Project structure

```text
client/
  src/
    main.js             Game flow and dungeon orchestration
    services/api.js     Shared API requests
    ui/auth.js          Sign-in, sign-up, and session controls
    ui/character-lab.js Character progression and stat allocation
    ui/screens.js       Lobby, Lab, leaderboard, and placeholder navigation
    blackjack-scene.js  Phaser dungeon battlefield
server/                 Express API, blackjack rules, accounts, and dungeon progression
data/                   SQLite databases (created at runtime)
```

After signing in, the game menu links to the dungeon, the character-stat Lab, leaderboards ranked by total EXP and monsters defeated, and placeholder Multiplayer and Settings screens.
