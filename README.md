# FrameIt

A phone-based party game for the family Chanukah party. Each round, a secret
Framer answers a question truthfully while trying to make everyone believe
someone else wrote it. Everyone else tries to work out who the Framer is.

- Players join on their phones (installable as a home-screen web app).
- The admin runs the game from their own phone.
- Optional secret roles: the Vandal, the Accomplice, and Two-Framer rounds.

## Stack

- React + Vite (JavaScript), installable as a PWA
- Cloudflare Workers + one PartyServer Durable Object holding the game state
- One deploy: `npm run deploy`

## Development

```sh
npm test        # unit tests (Node's built-in test runner)
```

More scripts arrive as the server and client are added.
