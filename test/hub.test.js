import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHub, migrateHub, join, applyAction, buildView, setConnected } from '../server/hub.js';
import { createState as createFrameit } from '../server/game.js';

const ADMIN = { isAdmin: true, playerId: null };
const as = (id) => ({ isAdmin: false, playerId: id });
function seeded(seed = 3) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

function hubWith(names = ['Maya', 'Noah', 'Lily', 'Ben']) {
  const hub = createHub();
  for (const n of names) join(hub, n);
  join(hub, 'Josh Horowitz');
  const random = seeded();
  const act = (actor, type, payload = {}) => applyAction(hub, actor, { type, ...payload }, 1000, random);
  return { hub, act };
}

test('players join the hub once; the lobby lists the games', () => {
  const { hub } = hubWith();
  const view = buildView(hub, as('maya'));
  assert.equal(view.phase, 'hub');
  assert.deepEqual(view.hub.games.map((g) => g.id), ['frameit', 'fomo']);
  assert.equal(view.players.length, 4);
  assert.equal(buildView(hub, ADMIN).you.isAdmin, true);
});

test('the admin picks a game, everyone is in it, scores start at 0', () => {
  const { hub, act } = hubWith();
  assert.throws(() => act(as('maya'), 'startHubGame', { gameId: 'fomo' }), { code: 'not_admin' });
  act(ADMIN, 'startHubGame', { gameId: 'fomo' });
  assert.equal(hub.phase, 'playing');
  assert.equal(buildView(hub, as('noah')).hub.gameId, 'fomo');
  assert.equal(buildView(hub, as('noah')).phase, 'setup');
  assert.deepEqual(Object.keys(hub.game.players).sort(), ['ben', 'lily', 'maya', 'noah']);
});

test('play again restarts the same game with fresh scores; back to games returns to the lobby', () => {
  const { hub, act } = hubWith();
  act(ADMIN, 'startHubGame', { gameId: 'frameit' });
  act(ADMIN, 'updateSettings', { settings: { timers: { voting: 90 } } });
  hub.game.players.maya.score = 9;
  act(ADMIN, 'playAgain');
  assert.equal(hub.gameId, 'frameit');
  assert.equal(hub.game.players.maya.score, 0);
  assert.equal(hub.game.settings.timers.voting, 90, 'settings are remembered');
  act(ADMIN, 'backToGames');
  assert.equal(hub.phase, 'lobby');
  assert.equal(hub.game, null);
  act(ADMIN, 'startHubGame', { gameId: 'frameit' });
  assert.equal(hub.game.settings.timers.voting, 90, 'and remembered across visits to the lobby');
});

test('joining mid-game puts the player into the running game too', () => {
  const { hub, act } = hubWith();
  act(ADMIN, 'startHubGame', { gameId: 'fomo' });
  join(hub, 'Cousin Eli');
  assert.ok(hub.players.cousineli);
  assert.ok(hub.game.players.cousineli);
  setConnected(hub, 'cousineli', false, 0);
  assert.equal(hub.game.players.cousineli.connected, false);
});

test('kick and reset work from the hub', () => {
  const { hub, act } = hubWith();
  act(ADMIN, 'startHubGame', { gameId: 'frameit' });
  assert.deepEqual(act(ADMIN, 'kick', { playerId: 'ben' }), { kicked: 'ben' });
  assert.equal(hub.players.ben, undefined);
  assert.equal(hub.game.players.ben, undefined);
  assert.throws(() => act(as('maya'), 'resetGame'), { code: 'not_admin' });
  assert.deepEqual(act(ADMIN, 'resetGame'), { reset: true });
  assert.equal(hub.phase, 'lobby');
  assert.deepEqual(hub.players, {});
  assert.ok(hub.configs.frameit, 'FrameIt settings are kept');
});

test('a game can start with any number of players, even none', () => {
  const { hub, act } = hubWith([]);
  act(ADMIN, 'startHubGame', { gameId: 'fomo' });
  assert.equal(hub.phase, 'playing');
});

test('game settings can be changed from the lobby, before anyone joins', () => {
  const { hub, act } = hubWith([]);
  act(ADMIN, 'configureGame', { gameId: 'frameit', action: { type: 'updateSettings', settings: { timers: { voting: 45 } } } });
  act(ADMIN, 'configureGame', { gameId: 'frameit', action: { type: 'addQuestion', text: 'Who would win a pillow fight?' } });
  act(ADMIN, 'configureGame', { gameId: 'fomo', action: { type: 'removePrompt', text: 'Pizza' } });
  assert.throws(() => act(ADMIN, 'configureGame', { gameId: 'fomo', action: { type: 'startRound' } }), { code: 'unknown_action' });
  assert.throws(() => act(as('maya'), 'configureGame', { gameId: 'fomo', action: { type: 'updateSettings' } }), { code: 'not_admin' });
  const settings = buildView(hub, ADMIN).admin.gameSettings;
  assert.equal(settings.frameit.settings.timers.voting, 45);
  assert.ok(settings.frameit.questions.some((q) => q.text === 'Who would win a pillow fight?'));
  assert.ok(!settings.fomo.prompts.some((p) => p.text === 'Pizza'));
  act(ADMIN, 'startHubGame', { gameId: 'frameit' });
  assert.equal(hub.game.settings.timers.voting, 45, 'the game starts with the lobby settings');
  act(ADMIN, 'configureGame', { gameId: 'frameit', action: { type: 'updateSettings', settings: { timers: { voting: 50 } } } });
  assert.equal(hub.game.settings.timers.voting, 50, 'and lobby-style changes reach a running game');
});

test('a save from before the hub becomes a hub lobby, keeping players and FrameIt settings', () => {
  const old = createFrameit({ timers: { voting: 75 } });
  old.players = { maya: { id: 'maya', name: 'Maya', score: 4, connected: true, waiting: false } };
  old.customQuestions = ['Who would win a pillow fight?'];
  const hub = migrateHub(old);
  assert.equal(hub.v, 2);
  assert.equal(hub.phase, 'lobby');
  assert.deepEqual(hub.players.maya, { id: 'maya', name: 'Maya', connected: false });
  assert.equal(hub.configs.frameit.settings.timers.voting, 75);
  assert.deepEqual(hub.configs.frameit.customQuestions, ['Who would win a pillow fight?']);
});
