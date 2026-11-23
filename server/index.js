// Worker entry point. WebSocket traffic for /parties/game-room/<room> goes to
// the GameRoom Durable Object; everything else is the built React app.

import { routePartykitRequest } from 'partyserver';

export { GameRoom } from './GameRoom.js';

export default {
  async fetch(request, env) {
    const response = await routePartykitRequest(request, env);
    if (response) return response;
    return env.ASSETS.fetch(request);
  },
};
