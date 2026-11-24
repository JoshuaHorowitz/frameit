import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, join, applyAction, buildView, scoreRound } from '../server/games/fomo.js';

const ADMIN = { isAdmin: true, playerId: null };
const as = (id) => ({ isAdmin: false, playerId: id });
function seeded(seed = 5) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

function setup(names = ['Maya', 'Noah', 'Lily', 'Ben', 'Dana']) {
  const random = seeded();
  const state = createState({}, random);
  for (const n of names) join(state, n);
  const act = (actor, type, payload = {}) => applyAction(state, actor, { type, ...payload }, 0, random);
  return { state, act };
}

test('scoring: +3 per player who finds the Faker, Faker +2 per player fooled', () => {
  const round = { fakerId: 'ben', voterIds: ['maya', 'noah', 'lily', 'dana'], votes: { maya: 'ben', noah: 'ben', lily: 'dana', dana: 'lily' } };
  const { deltas, right, fooled } = scoreRound(round, undefined, ['maya', 'noah', 'lily', 'ben', 'dana']);
  assert.deepEqual(right, ['maya', 'noah']);
  assert.equal(fooled, 2);
  assert.deepEqual(deltas, { maya: 3, noah: 3, lily: 0, ben: 4, dana: 0 });
});

test('a full round: prompt hidden only from the Faker, then votes and reveal', () => {
  const { state, act } = setup();
  act(ADMIN, 'setPrompt', { text: '  The   Beach ' });
  assert.equal(state.round.prompt, 'The Beach');
  act(ADMIN, 'setFaker', { playerId: 'ben' });
  assert.throws(() => act(as('maya'), 'startRound'), { code: 'not_admin' });
  act(ADMIN, 'startRound');
  assert.equal(state.phase, 'hints');

  assert.equal(buildView(state, as('maya')).round.prompt, 'The Beach');
  assert.equal(buildView(state, as('maya')).you.role, 'player');
  const faker = buildView(state, as('ben'));
  assert.equal(faker.you.role, 'faker');
  assert.equal(faker.round.prompt, undefined, 'the Faker never sees the prompt');
  assert.ok(!JSON.stringify(faker).includes('Beach'));
  assert.ok(!JSON.stringify(buildView(state, as('maya'))).includes('"fakerId"'), 'nobody is told who the Faker is');
  assert.equal(buildView(state, ADMIN).admin.live.knownFakerId, 'ben', 'the admin assigned the Faker, so the admin knows');

  assert.throws(() => act(as('maya'), 'castVote', { suspectId: 'ben' }), { code: 'wrong_phase' });
  act(ADMIN, 'startVoting');
  act(as('maya'), 'castVote', { suspectId: 'ben' });
  act(as('noah'), 'castVote', { suspectId: 'ben' });
  act(as('lily'), 'castVote', { suspectId: 'dana' });
  assert.throws(() => act(as('ben'), 'castVote', { suspectId: 'maya' }), { code: 'not_voter' }, 'the Faker does not vote');
  const fakerView = buildView(state, as('ben')).round;
  assert.deepEqual([fakerView.votesIn, fakerView.votesExpected, fakerView.myVote], [3, 4, undefined]);
  assert.equal(buildView(state, as('maya')).round.myVote, 'ben');
  assert.throws(() => act(as('dana'), 'castVote', { suspectId: 'dana' }), { code: 'bad_suspect' });

  act(ADMIN, 'reveal');
  assert.equal(state.phase, 'reveal');
  assert.equal(state.players.maya.score, 3);
  assert.equal(state.players.ben.score, 2); // Lily was fooled; Dana didn't vote
  const seen = buildView(state, as('lily')).round;
  assert.equal(seen.fakerId, 'ben');
  assert.equal(seen.prompt, 'The Beach');
  assert.equal(seen.votes.ben, undefined, 'the Faker never voted');

  act(ADMIN, 'showScoreboard');
  act(ADMIN, 'nextRound');
  assert.equal(state.phase, 'setup');
  assert.equal(state.round.number, 2);
  act(ADMIN, 'endGame');
  assert.equal(state.phase, 'final');
});

test('a random Faker stays hidden from the admin; random prompts can be rerolled', () => {
  const { state, act } = setup();
  const first = state.round.prompt;
  act(ADMIN, 'setPrompt', { random: true });
  assert.notEqual(state.round.prompt, first);
  act(ADMIN, 'startRound');
  assert.ok(state.round.fakerId);
  assert.equal(buildView(state, ADMIN).admin.live.knownFakerId, null);
});

test('FOMO needs at least 3 players; latecomers wait for the next round', () => {
  const small = setup(['Maya', 'Noah']);
  assert.throws(() => small.act(ADMIN, 'startRound'), { code: 'not_enough_players' });
  const { state, act } = setup();
  act(ADMIN, 'startRound');
  join(state, 'Eli');
  assert.equal(buildView(state, as('eli')).you.role, 'waiting');
  assert.equal(buildView(state, as('eli')).round.prompt, undefined);
});
