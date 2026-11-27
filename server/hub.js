// Game Night: a hub that holds the players and runs one game at a time.
//
// Everyone joins the hub once and stays in it. The admin picks a game in the
// lobby; every phone switches into it. When the game ends the admin can play
// it again or go back to the lobby and pick another. Each game keeps its own
// scores (they start at 0 every time a game starts); each game's settings and
// question/prompt bank are remembered between plays.
//
// A game is a module with: createState(config, random, now), saveConfig(state),
// join(state, name), setConnected(state, id, connected, now),
// removePlayer(state, id, now, random), applyAction(state, actor, action, now, random),
// tick(state, now, random), nextAlarm(state), isFinished(state), buildView(state, viewer).

import { normalizeName, isAdminName } from '../shared/protocol.js';
import { GameError, migrateState as migrateFrameit } from './game.js';
import * as frameit from './games/frameit.js';
import * as fomo from './games/fomo.js';

export const GAMES = {
  frameit: {
    module: frameit,
    name: 'FrameIt',
    tagline: 'One person answers honestly. How well do you know them?',
    bestWith: 3, // a suggestion only; any number can start
  },
  fomo: {
    module: fomo,
    name: 'FOMO',
    tagline: 'Everyone knows the prompt except the Faker. Give hints, find the Faker.',
    bestWith: 3,
  },
};

const MAX_NAME = 24;
const CONFIG_ACTIONS = new Set([
  'updateSettings',
  'addQuestion',
  'removeQuestion',
  'restoreQuestions',
  'addPrompt',
  'removePrompt',
  'restorePrompts',
]);

// What each game's Settings screen needs, built from its saved config, so the
// admin can edit settings from the lobby with no game running.
function gameSettingsViews(hub) {
  const out = {};
  for (const [id, entry] of Object.entries(GAMES)) {
    const source =
      hub.game && hub.gameId === id ? hub.game : entry.module.createState(hub.configs[id] ?? {}, () => 0, 0);
    out[id] = entry.module.buildView(source, { isAdmin: true, playerId: null }).admin;
  }
  return out;
}
const fail = (code, message) => {
  throw new GameError(code, message);
};

export function createHub() {
  return {
    v: 2,
    phase: 'lobby', // 'lobby' | 'playing'
    gameId: null,
    players: {}, // id -> { id, name, connected }
    adminConnected: false,
    game: null, // the running game's state
    configs: {}, // gameId -> saved settings / banks, remembered between plays
    notice: null,
  };
}

// Bring saved state up to date. A save from before the hub (a bare FrameIt
// game) becomes a hub in the lobby, keeping the players and FrameIt's settings.
export function migrateHub(saved) {
  if (!saved) return createHub();
  if (saved.v === 2) {
    if (saved.gameId === 'frameit' && saved.game) migrateFrameit(saved.game);
    return saved;
  }
  const hub = createHub();
  for (const p of Object.values(saved.players ?? {})) hub.players[p.id] = { id: p.id, name: p.name, connected: false };
  const old = migrateFrameit(saved);
  hub.configs.frameit = { settings: old.settings, customQuestions: old.customQuestions ?? [], removedQuestions: old.removedQuestions ?? [] };
  return hub;
}

const active = (hub) => (hub.gameId ? GAMES[hub.gameId].module : null);

// ---------- players ----------

export function join(hub, rawName) {
  const name = String(rawName ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
  const id = normalizeName(name);
  if (!id) fail('bad_name', 'Please enter a name.');
  if (isAdminName(name)) {
    hub.adminConnected = true;
    return { isAdmin: true, playerId: null };
  }
  const rejoined = Boolean(hub.players[id]);
  hub.players[id] = { id, name: hub.players[id]?.name ?? name, connected: true };
  if (hub.game) active(hub).join(hub.game, hub.players[id].name);
  return { isAdmin: false, playerId: id, rejoined };
}

export function setConnected(hub, playerId, connected, now) {
  const player = hub.players[playerId];
  if (!player) return;
  player.connected = connected;
  if (hub.game) active(hub).setConnected(hub.game, playerId, connected, now);
}

// ---------- timers ----------

export const nextAlarm = (hub) => (hub.game ? active(hub).nextAlarm(hub.game) : null);
export function tick(hub, now, random = Math.random) {
  if (hub.game) active(hub).tick(hub.game, now, random);
}

// ---------- actions ----------

function startGame(hub, gameId, now, random) {
  const entry = GAMES[gameId] ?? fail('bad_game', 'Unknown game.');
  const players = Object.values(hub.players); // any number, even none: handy for testing
  const game = entry.module.createState(hub.configs[gameId] ?? {}, random, now);
  for (const p of players) {
    entry.module.join(game, p.name);
    if (!p.connected) entry.module.setConnected(game, p.id, false, now);
  }
  hub.gameId = gameId;
  hub.game = game;
  hub.phase = 'playing';
  hub.notice = null;
}

function leaveGame(hub) {
  if (hub.game) hub.configs[hub.gameId] = active(hub).saveConfig(hub.game);
  hub.game = null;
  hub.gameId = null;
  hub.phase = 'lobby';
}

const hubActions = {
  // Lobby: start the chosen game.
  startHubGame(hub, { gameId }, now, random) {
    if (hub.phase !== 'lobby') fail('wrong_phase', 'A game is already running.');
    startGame(hub, gameId, now, random);
  },

  // After (or during) a game: same game again with fresh scores.
  playAgain(hub, _payload, now, random) {
    if (!hub.game) fail('wrong_phase', 'No game to replay.');
    const gameId = hub.gameId;
    leaveGame(hub);
    startGame(hub, gameId, now, random);
  },

  // Back to the lobby to pick a game.
  backToGames(hub) {
    if (!hub.game) fail('wrong_phase', 'Already in the lobby.');
    leaveGame(hub);
  },

  // Change a game's settings or question/prompt bank from the lobby, whether
  // or not that game is running. Only settings-type actions are allowed.
  configureGame(hub, { gameId, action }, now, random) {
    const entry = GAMES[gameId] ?? fail('bad_game', 'Unknown game.');
    if (!CONFIG_ACTIONS.has(action?.type)) fail('unknown_action', 'That is not a settings change.');
    const admin = { isAdmin: true, playerId: null };
    if (hub.game && hub.gameId === gameId) return entry.module.applyAction(hub.game, admin, action, now, random);
    const scratch = entry.module.createState(hub.configs[gameId] ?? {}, random, now);
    entry.module.applyAction(scratch, admin, action, now, random);
    hub.configs[gameId] = entry.module.saveConfig(scratch);
  },

  kick(hub, { playerId }, now, random) {
    if (!hub.players[playerId]) fail('bad_player', 'Unknown player.');
    if (hub.game) active(hub).removePlayer(hub.game, playerId, now, random);
    delete hub.players[playerId];
    return { kicked: playerId };
  },

  // Start fresh: remove every player and end any game; keep settings and banks.
  resetGame(hub) {
    if (hub.game) hub.configs[hub.gameId] = active(hub).saveConfig(hub.game);
    const { configs } = hub;
    const fresh = createHub();
    for (const key of Object.keys(hub)) delete hub[key];
    Object.assign(hub, fresh, { configs, adminConnected: true });
    return { reset: true };
  },
};

// Hub actions are the admin's; anything else goes to the running game.
export function applyAction(hub, actor, action, now, random = Math.random) {
  const type = action?.type;
  if (Object.hasOwn(hubActions, type)) {
    if (!actor.isAdmin) fail('not_admin', 'Only the admin can do that.');
    return hubActions[type](hub, action, now, random);
  }
  if (!hub.game) fail('wrong_phase', 'Wait for the admin to pick a game.');
  return active(hub).applyAction(hub.game, actor, action, now, random);
}

// ---------- views ----------

export function buildView(hub, viewer) {
  const info = {
    phase: hub.phase,
    gameId: hub.gameId,
    games: Object.entries(GAMES).map(([id, g]) => ({ id, name: g.name, tagline: g.tagline, bestWith: g.bestWith })),
  };
  if (hub.game) {
    return { ...active(hub).buildView(hub.game, viewer), hub: info };
  }
  const players = Object.values(hub.players)
    .map(({ id, name, connected }) => ({ id, name, connected, score: 0, waiting: false }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const base = { phase: 'hub', roundNumber: 0, deadline: null, pausedRemaining: null, timerTotal: null, players, notice: hub.notice, hub: info };
  if (viewer?.isAdmin) return { ...base, you: { isAdmin: true }, admin: { gameSettings: gameSettingsViews(hub) } };
  const me = hub.players[viewer?.playerId];
  return { ...base, you: me ? { id: me.id, name: me.name, score: 0, role: null } : null, round: null };
}
