# Blackjack

A small single-player blackjack game built with a Node.js/Express API, SQLite persistence, and a JavaScript frontend rendered with Phaser.

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

## Cloudflare Tunnel

Run the production app on a Docker network shared with the `cloudflared` connector:

```sh
docker compose -f docker-compose.tunnel.yml up --build -d
docker network connect blackjack-tunnel <cloudflared-container>
```

Set the tunnel's published application service URL to `http://blackjack:3000`. The container uses `data/` on the host for persistent SQLite storage and does not publish a host port.

## Rules

- Aces count as 1 or 11; face cards count as 10.
- The dealer stands on 17, including a soft 17.
- A two-card 21 is blackjack. A simultaneous dealer blackjack is a push.
- Splitting and doubling down are not included in this starter.

Create an account or sign in before playing. The hero and monster each start with 100 HP. Winning a hand deals the player's final hand score as damage to the monster; losing deals the dealer's final hand score to the player. A push deals no damage. Combat HP persists in the browser between hands and page refreshes. Starting a new hand does not restore HP; after either fighter is defeated, starting a new game resets both fighters to 100 HP.

Defeating a monster grants 50 EXP. The server awards it once per completed winning game and saves total EXP to the player's account in SQLite. Level progress is calculated from the database total after sign-in; browser storage only keeps battle health and retries for awards that could not be saved.

Games are stored in `data/blackjack.sqlite` and the current game is restored after refreshing the page. Player accounts, password hashes, sessions, and progression are stored separately in `data/player-accounts.sqlite`. Both databases are created automatically. Set `DATABASE_PATH` or `PLAYER_DATABASE_PATH` to use other SQLite files, or `PORT` to change the server port. Passwords are hashed with Node's scrypt; login sessions use expiring, HttpOnly cookies.

## API

- `POST /api/games` starts a shuffled game.
- `GET /api/games/:id` returns a saved game, hiding the dealer's hole card until the hand ends.
- `POST /api/games/:id/actions` accepts `{ "action": "hit" }` or `{ "action": "stand" }`.
- `POST /api/auth/signup` creates an account and starts a session.
- `POST /api/auth/login` signs in with a username or email and password.
- `GET /api/auth/me` returns the signed-in account and player stats.
- `POST /api/auth/logout` ends the current session.
- `GET /api/player/stats` returns the signed-in player's stats.
- `POST /api/player/progression` awards 50 EXP for a completed winning game, once per game and signed-in player.

The player stats table also includes counters for games played, wins, losses, pushes, and monsters defeated, ready for future stat tracking.

## Project structure

```text
client/       Vite app and Phaser blackjack table
server/       Express API, blackjack rules, and SQLite storage
data/         SQLite database (created at runtime)
```
