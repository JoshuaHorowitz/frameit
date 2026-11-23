import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreRound } from '../server/scoring.js';

const PLAYERS = ['maya', 'noah', 'sam', 'sarah', 'grandpa', 'lily', 'ben', 'dana'];

// The round drawn in the mockups: Maya answers, Sam is the Snitch.
const mockupRound = () => ({
  framers: [{ id: 'maya' }],
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

test('mockup round: Maya +5, Lily and Dana +3, Sam reversed to -2', () => {
  const { deltas } = scoreRound(mockupRound(), undefined, PLAYERS);
  assert.deepEqual(deltas, {
    maya: 5, // 2 people picked her (+1 each) + spotted the Snitch (+3)
    noah: 0,
    sam: -2, // 2 picks, reversed
    sarah: 0,
    grandpa: 0,
    lily: 3,
    ben: 0,
    dana: 3,
  });
});

test('wrong guesses score nothing for anyone', () => {
  const round = { framers: [{ id: 'maya' }], votes: { sarah: { 0: 'noah' }, ben: { 0: 'noah' }, lily: { 0: 'dana' } } };
  const { deltas, answers } = scoreRound(round, undefined, PLAYERS);
  assert.equal(deltas.maya, 0);
  assert.equal(deltas.noah, 0);
  assert.deepEqual(answers[0].catchers, []);
});

test('the Snitch keeps their points when the Framer guesses wrong', () => {
  const round = mockupRound();
  round.vandalGuesses = { maya: 'grandpa' };
  const { deltas, vandal } = scoreRound(round, undefined, PLAYERS);
  assert.equal(deltas.sam, 2);
  assert.equal(deltas.maya, 2);
  assert.equal(vandal.reversed, false);
});

test('a caught Snitch with no picks scores 0, not -0', () => {
  const round = mockupRound();
  round.votes = { sarah: { 0: 'noah' }, lily: { 0: 'ben' } };
  const { deltas } = scoreRound(round, undefined, PLAYERS);
  assert.ok(Object.is(deltas.sam, 0));
  assert.equal(deltas.maya, 3);
});

test('no votes at all scores nothing', () => {
  const { deltas } = scoreRound({ framers: [{ id: 'maya' }], votes: {} }, undefined, PLAYERS);
  assert.equal(deltas.maya, 0);
});

test('a challenged answer gives the Framer 0, guessers keep their points', () => {
  const round = mockupRound();
  round.challenged = [0];
  const { deltas } = scoreRound(round, undefined, PLAYERS);
  assert.equal(deltas.maya, 0); // no pick points and no Snitch bonus
  assert.equal(deltas.lily, 3);
  assert.equal(deltas.dana, 3);
  assert.equal(deltas.sam, -2); // the Snitch was still spotted
});

test('Accomplice: +2 per vote on themselves, -1 per vote on the Framer', () => {
  const round = {
    framers: [{ id: 'maya' }],
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
  assert.equal(deltas.maya, 1);
  assert.equal(deltas.lily, 3);
});

test('Two Framers: picks per answer, Accomplice penalised for votes on either', () => {
  const round = {
    framers: [{ id: 'maya' }, { id: 'sam' }],
    accompliceId: 'dana',
    votes: {
      sarah: { 0: 'maya', 1: 'maya' }, // right on answer 0, wrong on answer 1
      grandpa: { 0: 'noah', 1: 'sam' }, // wrong on answer 0, right on answer 1
      lily: { 0: 'dana', 1: 'dana' },
    },
  };
  const { deltas } = scoreRound(round, undefined, PLAYERS);
  assert.equal(deltas.sarah, 3);
  assert.equal(deltas.grandpa, 3);
  assert.equal(deltas.lily, 0);
  assert.equal(deltas.maya, 1);
  assert.equal(deltas.sam, 1);
  // Dana: 2 votes on herself (+4), 3 votes on a Framer (Sarah x2 on Maya, Grandpa on Sam) (-3)
  assert.equal(deltas.dana, 4 - 3);
});

test('Two Framers who both spot the Snitch each get +3; reversal happens once', () => {
  const round = {
    framers: [{ id: 'maya' }, { id: 'sam' }],
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
  assert.equal(deltas.maya, 1 + 3);
  assert.equal(deltas.sam, 1 + 3);
  assert.equal(deltas.sarah, 6);
});

test('custom point values are respected', () => {
  const { deltas } = scoreRound(mockupRound(), { catchFramer: 4, framerPerCatch: 2 }, PLAYERS);
  assert.equal(deltas.lily, 4);
  assert.equal(deltas.maya, 2 * 2 + 3);
});
