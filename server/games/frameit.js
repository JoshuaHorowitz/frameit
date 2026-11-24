// FrameIt as a Game Night game: a thin wrapper that gives the existing engine
// (server/game.js) and views (server/views.js) the shape the hub expects.

import { PHASES } from '../../shared/protocol.js';
import * as engine from '../game.js';
import { buildView as frameitView } from '../views.js';

export function createState(config = {}, random = Math.random, now = Date.now()) {
  const state = engine.createState(config.settings);
  state.customQuestions = [...(config.customQuestions ?? [])];
  state.removedQuestions = [...(config.removedQuestions ?? [])];
  // Skip FrameIt's own lobby: the hub already has everyone. Go straight to setup.
  engine.applyAction(state, { isAdmin: true }, { type: 'startGame' }, now, random);
  return state;
}

export function saveConfig(state) {
  return {
    settings: state.settings,
    customQuestions: state.customQuestions,
    removedQuestions: state.removedQuestions,
  };
}

export function join(state, name) {
  return engine.join(state, name);
}

export const setConnected = engine.setConnected;
export const nextAlarm = engine.nextAlarm;
export const tick = engine.tick;
export const isFinished = (state) => state.phase === PHASES.FINAL;

export function removePlayer(state, playerId, now, random) {
  if (state.players[playerId]) engine.applyAction(state, { isAdmin: true }, { type: 'kick', playerId }, now, random);
}

// The hub handles starting fresh and kicking, so those FrameIt actions are not
// reachable from a phone here.
const HUB_OWNED = new Set(['resetGame', 'kick', 'startGame']);

export function applyAction(state, actor, action, now, random) {
  if (HUB_OWNED.has(action?.type)) throw new engine.GameError('unknown_action', `Unknown action: ${action.type}`);
  return engine.applyAction(state, actor, action, now, random);
}

export const buildView = frameitView;
