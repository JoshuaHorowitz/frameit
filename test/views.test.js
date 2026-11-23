// Secrets must never reach the wrong phone. These tests walk a Snitch +
// Accomplice round and check what each role can see in each phase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createState, join, applyAction, tick } from '../server/game.js';
import { buildView } from '../server/views.js';

const ADMIN = { isAdmin: true, playerId: null };
const as = (id) => ({ isAdmin: false, playerId: id });

function seeded(seed = 7) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

// Collect every key anywhere in an object.
function keysDeep(value, out = new Set()) {
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysDeep(v, out);
    }
  }
  return out;
}

function makeRound({ adminAssignsFramer = true } = {}) {
  const state = createState();
  for (const n of ['Maya', 'Noah', 'Sam', 'Lily', 'Ben', 'Dana']) join(state, n);
  const random = seeded();
  const now = 0;
  const act = (actor, type, payload = {}, at = now) => applyAction(state, actor, { type, ...payload }, at, random);
  act(ADMIN, 'startGame');
  act(ADMIN, 'configureRound', {
    addOns: { vandal: true, accomplice: true },
    roles: { framers: [adminAssignsFramer ? 'maya' : null], vandal: 'sam', accomplice: null },
  });
  act(ADMIN, 'startRound');
  return { state, act, random };
}

test('voters learn nothing; Snitch and Accomplice see the Framer', () => {
  const { state, act } = makeRound();
  const framerId = state.round.framers[0].id;
  act(as(framerId), 'ready');
  // now answering
  const accompliceId = state.round.accompliceId;
  const voterId = state.round.voterIds[0];

  const voter = buildView(state, as(voterId));
  assert.equal(voter.you.role, 'voter');
  for (const k of ['framers', 'vandalId', 'vandalPushId', 'myPushId', 'accompliceId', 'question', 'messages', 'vandalPresent']) {
    assert.ok(!keysDeep(voter.round).has(k), `voter must not see ${k}`);
  }

  const vandal = buildView(state, as('sam'));
  assert.equal(vandal.you.role, 'vandal');
  assert.deepEqual(vandal.round.framers, [{ id: framerId }]);
  assert.equal(vandal.round.question, state.round.question, 'the Saboteur sees the question to choose who to push');
  act(as('sam'), 'choosePush', { suspectId: voterId });
  assert.equal(buildView(state, as('sam')).round.myPushId, voterId);
  assert.ok(!keysDeep(buildView(state, as(framerId)).round).has('myPushId'), 'the Framer never sees who is being pushed');
  assert.ok(!keysDeep(vandal.round).has('accompliceId'), 'the Snitch does not learn about the Accomplice');

  const acc = buildView(state, as(accompliceId));
  assert.equal(acc.you.role, 'accomplice');
  assert.equal(acc.round.framers[0].id, framerId);

  const framer = buildView(state, as(framerId));
  assert.equal(framer.round.question, state.round.question);
  assert.ok(!keysDeep(framer.round).has('vandalPresent'), 'the Snitch is a surprise until voting');
  assert.ok(!keysDeep(framer.round).has('accompliceId'));
});

test('teasing messages: the Framer sees all with names, senders see only their own', () => {
  const { state, act } = makeRound();
  const framer = state.round.framers[0];
  act(as(framer.id), 'ready');
  const [a, b] = state.round.voterIds;
  act(as(a), 'sendMessage', { text: 'from a' });
  act(as(b), 'sendMessage', { text: 'from b' });

  assert.deepEqual(buildView(state, as(framer.id)).round.messages.map((m) => [m.fromId, m.text]), [[a, 'from a'], [b, 'from b']]);
  assert.deepEqual(buildView(state, as(a)).round.myMessages.map((m) => m.text), ['from a']);
  assert.equal(buildView(state, ADMIN).admin.live.framerScreen.messages.length, 2);
});

test('voting: answers have no author; the Framer now learns a Snitch exists (not who)', () => {
  const { state, act, random } = makeRound();
  const framer = state.round.framers[0];
  act(as(framer.id), 'ready');
  act(as(framer.id), 'submitAnswer', { text: 'Spiders' });
  tick(state, 30_000, random);
  assert.equal(state.phase, 'voting');

  const voter = buildView(state, as(state.round.voterIds[0]));
  assert.deepEqual(voter.round.answers, [{ index: 0, text: 'Spiders' }]);
  assert.equal(voter.round.votesExpected, state.round.voterIds.length);

  const f = buildView(state, as(framer.id));
  assert.equal(f.round.vandalPresent, true);
  assert.ok(!keysDeep(f.round).has('vandalId'), 'the Framer is not told who the Snitch is');
  assert.equal(f.round.myVandalGuess, null);
  assert.ok(!keysDeep(f.round).has('accompliceId'));
});

test('admin: random roles stay hidden until Review, assigned roles are shown', () => {
  const assigned = makeRound({ adminAssignsFramer: true });
  const live = buildView(assigned.state, ADMIN).admin.live;
  assert.deepEqual(live.knownRoles.framers, ['maya']);
  assert.equal(live.knownRoles.vandalId, 'sam');
  assert.equal(live.knownRoles.accompliceId, null, 'the Accomplice was random');

  const random = makeRound({ adminAssignsFramer: false });
  const hidden = buildView(random.state, ADMIN).admin.live;
  assert.equal(hidden.knownRoles.framers, null);
  assert.equal(hidden.framersReady, 0);
  assert.ok(!keysDeep(hidden).has('id'), 'no player ids at all while roles are random');
});

test('review keeps players in the dark; reveal shows everyone everything', () => {
  const { state, act, random } = makeRound();
  const framer = state.round.framers[0];
  act(as(framer.id), 'ready');
  act(as(framer.id), 'submitAnswer', { text: 'Spiders' });
  tick(state, 30_000, random);
  tick(state, 90_000, random);
  assert.equal(state.phase, 'review');

  const voterId = state.round.voterIds[0];
  assert.deepEqual(buildView(state, as(voterId)).round, { waitingForReveal: true });
  const review = buildView(state, ADMIN).admin.review;
  assert.equal(review.framers[0].id, framer.id);
  assert.ok(review.recap.paragraphs.length > 0);

  act(ADMIN, 'reveal');
  const after = buildView(state, as(voterId)).round;
  assert.equal(after.revealed, true);
  assert.equal(after.vandalId, 'sam');
  assert.equal(after.accompliceId, state.round.accompliceId);
  assert.equal(after.framers[0].answer, 'Spiders');
});
