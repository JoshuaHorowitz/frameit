import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, join, applyAction, tick, nextAlarm, setConnected, GameError } from '../server/game.js';
import { buildView } from '../server/views.js';

// Deterministic random numbers for repeatable tests.
function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const ADMIN = { isAdmin: true, playerId: null };
const as = (id) => ({ isAdmin: false, playerId: id });
const NAMES = ['Maya', 'Noah', 'Sam', 'Aunt Sarah', 'Grandpa', 'Lily', 'Ben', 'Dana'];

function setupGame({ now = 1_000_000, random = seeded() } = {}) {
  const state = createState();
  for (const n of NAMES) join(state, n);
  join(state, 'Josh Horowitz');
  const act = (actor, type, payload = {}, at = now) => applyAction(state, actor, { type, ...payload }, at, random);
  act(ADMIN, 'startGame');
  return { state, act, random, now };
}

// Maya frames Noah with Sam as Vandal: the mockup round.
function startMockupRound(ctx) {
  const { act } = ctx;
  act(ADMIN, 'configureRound', {
    addOns: { vandal: true },
    roles: { framers: ['maya'], vandal: 'sam' },
  });
  act(ADMIN, 'startRound');
  const maya = ctx.state.round.framers[0];
  if (!maya.targetOptions.includes('noah')) maya.targetOptions[0] = 'noah'; // keep the test independent of shuffling
  act(as('maya'), 'pickTarget', { targetId: 'noah' });
}

test('joining: names normalise, the admin name opens the admin view', () => {
  const state = createState();
  assert.deepEqual(join(state, '  Aunt   Sarah '), { isAdmin: false, playerId: 'auntsarah', rejoined: false });
  assert.equal(state.players.auntsarah.name, 'Aunt Sarah');
  assert.equal(join(state, 'AUNT SARAH').rejoined, true);
  assert.deepEqual(join(state, 'josh horowitz'), { isAdmin: true, playerId: null });
  assert.equal(state.players.joshhorowitz, undefined);
  assert.throws(() => join(state, '   '), GameError);
});

test('a player joining mid-round waits, starting at the lowest score', () => {
  const ctx = setupGame();
  ctx.state.players.maya.score = 12;
  ctx.state.players.noah.score = 5;
  for (const p of Object.values(ctx.state.players)) if (p.score === 0) p.score = 7;
  startMockupRound(ctx);
  join(ctx.state, 'Cousin Eli');
  assert.equal(ctx.state.players.cousineli.waiting, true);
  assert.equal(ctx.state.players.cousineli.score, 5);
  assert.equal(buildView(ctx.state, as('cousineli')).you.role, 'waiting');
});

test('only the admin can run admin actions', () => {
  const { act } = setupGame();
  assert.throws(() => act(as('maya'), 'startRound'), { code: 'not_admin' });
});

test('full round: roles -> answering -> voting -> review -> recap -> scoreboard', () => {
  const ctx = setupGame();
  const { state, act, now } = ctx;
  startMockupRound(ctx);
  assert.equal(state.phase, 'answering');
  assert.equal(nextAlarm(state), now + 30_000);

  act(as('lily'), 'sendMessage', { text: 'stop smiling' });
  assert.throws(() => act(as('maya'), 'sendMessage', { text: 'hi' }), { code: 'not_allowed' });
  act(as('maya'), 'submitAnswer', { text: 'Spiders. Big ones.' });

  tick(state, now + 30_000, ctx.random);
  assert.equal(state.phase, 'voting');

  const voting = now + 31_000;
  const votes = { auntsarah: 'noah', grandpa: 'noah', ben: 'noah', noah: 'lily', lily: 'maya' };
  for (const [voter, suspect] of Object.entries(votes)) {
    act(as(voter), 'castVote', { answerIndex: 0, suspectId: suspect }, voting);
  }
  assert.throws(() => act(as('sam'), 'castVote', { answerIndex: 0, suspectId: 'maya' }, voting), { code: 'not_voter' });
  act(as('maya'), 'guessVandal', { suspectId: 'sam' }, voting);
  assert.equal(state.phase, 'voting'); // Dana hasn't voted yet
  act(as('dana'), 'castVote', { answerIndex: 0, suspectId: 'maya' }, voting);
  assert.equal(state.phase, 'review', 'voting ends early once every vote and guess is in');

  assert.equal(state.round.result.deltas.maya, 10);
  assert.equal(state.players.maya.score, 0, 'scores are applied at reveal, not review');
  act(ADMIN, 'reveal');
  assert.equal(state.phase, 'recap');
  assert.equal(state.players.maya.score, 10);
  assert.equal(state.players.sam.score, -2);
  assert.equal(state.roundNumber, 1);
  act(ADMIN, 'showScoreboard');
  act(ADMIN, 'nextRound');
  assert.equal(state.phase, 'setup');
  assert.equal(state.round.number, 2);
});

test('challenge zeroes the Framer before reveal and can be undone', () => {
  const ctx = setupGame();
  startMockupRound(ctx);
  ctx.act(as('maya'), 'submitAnswer', { text: 'Spiders' });
  tick(ctx.state, ctx.now + 30_000, ctx.random);
  ctx.act(ADMIN, 'cancelRound'); // sanity: cancel works mid-voting
  assert.equal(ctx.state.phase, 'setup');
  assert.equal(ctx.state.notice.code, 'round_cancelled');

  startMockupRound(ctx);
  ctx.act(as('maya'), 'submitAnswer', { text: 'Spiders' });
  tick(ctx.state, ctx.now + 30_000, ctx.random);
  ctx.act(as('ben'), 'castVote', { suspectId: 'maya' });
  tick(ctx.state, ctx.now + 90_000, ctx.random);
  assert.equal(ctx.state.phase, 'review');
  ctx.act(ADMIN, 'challenge', { answerIndex: 0 });
  assert.equal(ctx.state.round.result.deltas.maya, 0);
  assert.equal(ctx.state.round.result.deltas.ben, 3);
  ctx.act(ADMIN, 'unchallenge', { answerIndex: 0 });
  assert.deepEqual(ctx.state.round.challenged, []);
});

test('a setup with nobody left to vote is refused', () => {
  const state = createState();
  join(state, 'Maya');
  join(state, 'Sam');
  const act = (type, payload = {}) => applyAction(state, ADMIN, { type, ...payload }, 0, seeded());
  act('startGame');
  act('configureRound', { addOns: { vandal: true } });
  assert.throws(() => act('startRound'), { code: 'no_voters' });
  assert.equal(state.phase, 'setup');
});

test('a Framer who never picks gets a random target from their options', () => {
  const ctx = setupGame();
  ctx.act(ADMIN, 'configureRound', { roles: { framers: ['maya'] } });
  ctx.act(ADMIN, 'startRound');
  tick(ctx.state, ctx.now + 15_000, ctx.random);
  const maya = ctx.state.round.framers[0];
  assert.equal(ctx.state.phase, 'answering');
  assert.ok(maya.targetOptions.includes(maya.targetId));
  assert.equal(maya.targetOptions.length, 3);
});

test('an unsubmitted draft is used at the deadline; an empty one cancels the round', () => {
  const ctx = setupGame();
  startMockupRound(ctx);
  ctx.act(as('maya'), 'draftAnswer', { text: 'Spiders. Big' });
  tick(ctx.state, ctx.now + 30_000, ctx.random);
  assert.equal(ctx.state.phase, 'voting');
  assert.equal(ctx.state.round.framers[0].answer, 'Spiders. Big');

  ctx.act(ADMIN, 'cancelRound');
  startMockupRound(ctx);
  tick(ctx.state, ctx.now + 30_000, ctx.random);
  assert.equal(ctx.state.phase, 'setup');
  assert.match(ctx.state.notice.message, /without an answer/);
});

test('a Framer who drops gets a 20 s grace period', () => {
  const ctx = setupGame();
  startMockupRound(ctx);
  const t = ctx.now + 5_000;
  setConnected(ctx.state, 'maya', false, t);
  assert.equal(nextAlarm(ctx.state), t + 20_000);
  setConnected(ctx.state, 'maya', true, t + 10_000);
  tick(ctx.state, t + 21_000, ctx.random);
  assert.equal(ctx.state.phase, 'answering', 'came back in time');

  setConnected(ctx.state, 'maya', false, t + 22_000);
  tick(ctx.state, t + 42_000, ctx.random);
  assert.equal(ctx.state.phase, 'setup');
  assert.match(ctx.state.notice.message, /Maya left/);
});

test('pause, resume and add time', () => {
  const ctx = setupGame();
  startMockupRound(ctx);
  const { state, act, now } = ctx;
  act(ADMIN, 'pause', {}, now + 10_000);
  assert.equal(state.round.pausedRemaining, 20_000);
  assert.equal(nextAlarm(state), null);
  act(ADMIN, 'addTime', { seconds: 15 }, now + 50_000);
  act(ADMIN, 'resume', {}, now + 60_000);
  assert.equal(state.round.deadline, now + 60_000 + 35_000);
});

test('kicking a voter mid-vote removes their vote; kicking the Framer cancels', () => {
  const ctx = setupGame();
  startMockupRound(ctx);
  ctx.act(as('maya'), 'submitAnswer', { text: 'Spiders' });
  tick(ctx.state, ctx.now + 30_000, ctx.random);
  ctx.act(as('ben'), 'castVote', { suspectId: 'noah' });
  assert.deepEqual(ctx.act(ADMIN, 'kick', { playerId: 'ben' }), { kicked: 'ben' });
  assert.equal(ctx.state.round.votes.ben, undefined);
  assert.ok(!ctx.state.round.voterIds.includes('ben'));
  ctx.act(ADMIN, 'kick', { playerId: 'maya' });
  assert.equal(ctx.state.phase, 'setup');
});

test('two-framer round with random roles and the Accomplice', () => {
  const ctx = setupGame();
  ctx.act(ADMIN, 'configureRound', { addOns: { twoFramers: true, accomplice: true } });
  ctx.act(ADMIN, 'startRound');
  const r = ctx.state.round;
  assert.equal(r.framers.length, 2);
  assert.ok(r.accompliceId);
  assert.equal(r.voterIds.length, NAMES.length - 3);
  const ids = [r.framers[0].id, r.framers[1].id, r.accompliceId];
  assert.equal(new Set(ids).size, 3, 'nobody holds two roles');
});

test('resetGame clears players, scores and rounds but keeps settings and custom questions', () => {
  const ctx = setupGame();
  const { state, act } = ctx;
  act(ADMIN, 'updateSettings', { settings: { timers: { voting: 90 } } });
  act(ADMIN, 'addQuestion', { text: 'Who makes the best latkes?' });
  startMockupRound(ctx);
  state.players.maya.score = 12;
  assert.throws(() => act(as('maya'), 'resetGame'), { code: 'not_admin' });
  assert.deepEqual(act(ADMIN, 'resetGame'), { reset: true });
  assert.equal(state.phase, 'lobby');
  assert.deepEqual(state.players, {});
  assert.equal(state.round, null);
  assert.equal(state.roundNumber, 0);
  assert.equal(state.settings.timers.voting, 90);
  assert.deepEqual(state.customQuestions, ['Who makes the best latkes?']);
  join(state, 'Maya');
  assert.equal(state.players.maya.score, 0);
});

test('updateSettings only accepts known numeric settings', () => {
  const { state, act } = setupGame();
  act(ADMIN, 'updateSettings', { settings: { points: { catchFramer: 4, bogus: 9 }, timers: { voting: 'x' } } });
  assert.equal(state.settings.points.catchFramer, 4);
  assert.equal(state.settings.points.bogus, undefined);
  assert.equal(state.settings.timers.voting, 60);
});
