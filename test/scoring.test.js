import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreRound } from '../server/scoring.js';

const PLAYERS = ['maya', 'noah', 'sam', 'sarah', 'grandpa', 'lily', 'ben', 'dana'];

// The round drawn in the mockups: Maya frames Noah, Sam is the Vandal.
const mockupRound = () => ({
  framers: [{ id: 'maya', targetId: 'noah' }],
  vandalId: 'sam',
  accompliceId: null,
  votes: {
    sarah: { 0: 'noah' },
    grandpa: { 0: 'noah' },
    ben: { 0: 'noah' },
    noah: { 0: 'lily' },
    lily: { 0: 'maya' },
    dana: { 0: 'maya' },
  },
  vandalGuesses: { maya: 'sam' },
  challenged: [],
});

test('mockup round: Maya +10, Lily and Dana +3, Sam reversed to -2', () => {
  const { deltas } = scoreRound(mockupRound(), undefined, PLAYERS);
  assert.deepEqual(deltas, {
    maya: 10, // 3 on target x2 + 1 other + caught the Vandal 3
    noah: 0,
    sam: -2, // 2 catches, reversed
    sarah: 0,
    grandpa: 0,
    lily: 3,
    ben: 0,
    dana: 3,
  });
});

test('Vandal keeps their points when the Framer guesses wrong', () => {
  const round = mockupRound();
  round.vandalGuesses = { maya: 'grandpa' };
  const { deltas, vandal } = scoreRound(round, undefined, PLAYERS);
  assert.equal(deltas.sam, 2);
  assert.equal(deltas.maya, 7);
  assert.equal(vandal.reversed, false);
});

test('a caught Vandal with no catches scores 0, not -0', () => {
  const round = mockupRound();
  round.votes = { sarah: { 0: 'noah' }, lily: { 0: 'ben' } };
  const { deltas } = scoreRound(round, undefined, PLAYERS);
  assert.ok(Object.is(deltas.sam, 0));
});

test('Perfect Frame adds +5 on top of the per-vote points', () => {
  const round = {
    framers: [{ id: 'maya', targetId: 'noah' }],
    votes: { sarah: { 0: 'noah' }, ben: { 0: 'noah' }, lily: { 0: 'dana' } },
  };
  const { deltas, answers } = scoreRound(round, undefined, PLAYERS);
  assert.equal(answers[0].perfect, true);
  assert.equal(deltas.maya, 2 + 2 + 1 + 5);
});

test('no votes at all is not a Perfect Frame', () => {
  const round = { framers: [{ id: 'maya', targetId: 'noah' }], votes: {} };
  const { deltas, answers } = scoreRound(round, undefined, PLAYERS);
  assert.equal(answers[0].perfect, false);
  assert.equal(deltas.maya, 0);
});

test('a challenged answer gives the Framer 0, guessers keep their points', () => {
  const round = mockupRound();
  round.challenged = [0];
  const { deltas } = scoreRound(round, undefined, PLAYERS);
  assert.equal(deltas.maya, 0); // no frame points and no Vandal bonus
  assert.equal(deltas.lily, 3);
  assert.equal(deltas.dana, 3);
  assert.equal(deltas.sam, -2); // the Vandal was still caught
});

test('Accomplice: +2 per vote on themselves, -1 per vote on the Framer', () => {
  const round = {
    framers: [{ id: 'maya', targetId: 'noah' }],
    accompliceId: 'ben',
    votes: {
      sarah: { 0: 'ben' },
      grandpa: { 0: 'ben' },
      lily: { 0: 'maya' },
      dana: { 0: 'noah' },
    },
  };
  const { deltas, accomplice } = scoreRound(round, undefined, PLAYERS);
  assert.equal(accomplice.votesOnSelf, 2);
  assert.equal(accomplice.votesOnFramers, 1);
  assert.equal(deltas.ben, 2 * 2 - 1);
  assert.equal(deltas.maya, 1 + 1 + 2); // two votes on the Accomplice count as "anyone else"
});

test('Two Framers: votes per answer, catches per answer, Accomplice penalised for either', () => {
  const round = {
    framers: [
      { id: 'maya', targetId: 'noah' },
      { id: 'sam', targetId: 'maya' }, // a Framer may target the other Framer
    ],
    accompliceId: 'dana',
    votes: {
      sarah: { 0: 'maya', 1: 'maya' }, // catches Maya; on answer 1 falls for Sam's frame
      grandpa: { 0: 'noah', 1: 'sam' }, // falls for Maya's frame; catches Sam
      lily: { 0: 'dana', 1: 'dana' },
    },
  };
  const { deltas } = scoreRound(round, undefined, PLAYERS);
  assert.equal(deltas.sarah, 3);
  assert.equal(deltas.grandpa, 3);
  assert.equal(deltas.lily, 0);
  assert.equal(deltas.maya, 2 + 1); // answer 0: Noah x1 (+2), Dana x1 (+1)
  assert.equal(deltas.sam, 2 + 1); // answer 1: Maya x1 (+2), Dana x1 (+1)
  // Dana: 2 votes on herself (+4), 3 votes on a Framer (sarah x2 on Maya, grandpa on Sam) (-3)
  assert.equal(deltas.dana, 4 - 3);
});

test('Two Framers who both catch the Vandal each get +3; reversal happens once', () => {
  const round = {
    framers: [
      { id: 'maya', targetId: 'noah' },
      { id: 'sam', targetId: 'ben' },
    ],
    vandalId: 'lily',
    votes: {
      sarah: { 0: 'maya', 1: 'sam' },
      grandpa: { 0: 'noah', 1: 'ben' },
    },
    vandalGuesses: { maya: 'lily', sam: 'lily' },
  };
  const { deltas, vandal } = scoreRound(round, undefined, PLAYERS);
  assert.equal(vandal.earned, 2);
  assert.equal(deltas.lily, -2);
  assert.equal(deltas.maya, 2 + 3);
  assert.equal(deltas.sam, 2 + 3);
  assert.equal(deltas.sarah, 6);
});

test('custom point values are respected', () => {
  const { deltas } = scoreRound(mockupRound(), { catchFramer: 4, voteOnTarget: 3 }, PLAYERS);
  assert.equal(deltas.lily, 4);
  assert.equal(deltas.maya, 3 * 3 + 1 + 3);
});
