# FrameIt

A phone-based party game for the family Chanukah party. Each round, a secret
Framer answers a question honestly, and everyone else tries to work out who
wrote it. How well do you really know each other?

- Players join on their phones (installable to the home screen as a PWA).
- The admin runs the game from their own phone by joining as **Josh Horowitz**.
- Optional secret roles: the Vandal, the Accomplice, and Two-Framer rounds.

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
shared/     protocol.js (phases, settings, points), questions.js
server/     game.js (state machine), views.js (per-phone snapshots),
            scoring.js, recap.js, GameRoom.js (Durable Object), index.js (Worker)
src/        React app: useGame.js, App.jsx, PlayerScreens.jsx, AdminScreens.jsx
test/       unit tests
```

The game engine (`server/game.js`) has no Cloudflare dependencies; `GameRoom.js`
is a thin adapter that stores state, schedules alarms for timers and sends each
phone its private view.
