# Game Night

A phone-based party game hub for the family Chanukah party. Everyone joins
once on their phone; the admin (joining as **Josh Horowitz**) picks a game,
and every phone switches into it. After a game, play it again or pick another.

## Games

- **FrameIt:** one secret Framer answers a question honestly; everyone else
  works out who wrote it. Optional Saboteur, Doppelganger and Two-Framer rounds.
- **FOMO:** everyone gets a prompt except one secret Faker. Go around the
  circle giving one- or two-word hints out loud, then vote for the Faker.

Each game keeps its own scores, which start at 0 every time it starts. Each
game's settings and question/prompt bank are remembered between plays.

## Stack

- React + Vite (JavaScript), installable as a PWA
- Cloudflare Workers + one PartyServer Durable Object (`GameRoom`) holding the game
- One deploy: `npm run deploy`

## First-time setup

```sh
npm run setup     # installs React, Vite, PartyServer, Wrangler and friends (latest versions)
npx wrangler login
```

`npm run setup` adds the dependencies to `package.json`; commit that change.

## Run it locally

```sh
npm run dev
```

This builds once, then runs `wrangler dev` (the game server on :8787) and Vite
(the app on :5173, forwarding the game socket to Wrangler). Vite prints a
network URL so phones on the same Wi-Fi can join.

## Deploy

```sh
npm run deploy
```

Wrangler prints the `https://frameit.<you>.workers.dev` URL to share.

## Tests

```sh
npm test
```

Uses Node's built-in test runner; no dependencies needed. Covers scoring, the
recap text, the full round flow, timers, edge cases, and what every role can
see in every phase.

## Layout

```
shared/     protocol.js, questions.js (FrameIt), fomoPrompts.js (FOMO)
server/     hub.js (players, game picker), GameRoom.js (Durable Object), index.js (Worker)
            games/frameit.js + game.js, views.js, scoring.js, recap.js (FrameIt)
            games/fomo.js (FOMO)
src/        React app: useGame.js, App.jsx, HubScreens.jsx,
            PlayerScreens.jsx + AdminScreens.jsx (FrameIt), FomoScreens.jsx
test/       unit tests
```

The hub and games have no Cloudflare dependencies; `GameRoom.js` is a thin
adapter that stores state, schedules alarms for timers and sends each phone its
private view. To add a game, write a module with the same functions as
`server/games/fomo.js`, register it in `GAMES` in `server/hub.js`, and add its
screens to `src/App.jsx`.
