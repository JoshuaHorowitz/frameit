import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreRound } from '../server/scoring.js';
import { buildRecap, joinNames } from '../server/recap.js';

const NAMES = {
  maya: 'Maya', noah: 'Noah', sam: 'Sam', sarah: 'Aunt Sarah',
  grandpa: 'Grandpa', lily: 'Lily', ben: 'Ben', dana: 'Dana',
};

test('joinNames reads naturally', () => {
  assert.equal(joinNames([]), '');
  assert.equal(joinNames(['A']), 'A');
  assert.equal(joinNames(['A', 'B']), 'A and B');
  assert.equal(joinNames(['A', 'B', 'C']), 'A, B and C');
});

test('mockup round recap matches the admin Recap screen', () => {
  const result = scoreRound({
    framers: [{ id: 'maya' }],
    vandalId: 'sam',
    votes: {
      sarah: { 0: 'noah' }, grandpa: { 0: 'noah' }, ben: { 0: 'noah' },
      noah: { 0: 'lily' }, lily: { 0: 'maya' }, dana: { 0: 'maya' },
    },
    vandalGuesses: { maya: 'sam' },
  });
  const { paragraphs, totals } = buildRecap(result, NAMES);

  assert.deepEqual(paragraphs, [
    'Maya was the Framer this round. Sam was the Snitch, secretly trying to get everyone to figure out it was Maya.',
    'Aunt Sarah, Grandpa and Ben fell for it and voted for Noah, which gives Maya +1 each. Noah fell for it and voted for Lily, which gives Maya +1. Lily and Dana caught Maya: +3 each.',
    "That earns Sam +1 for each player who caught Maya. But Maya figured out Sam was the Snitch! Maya gets +3, and Sam's +2 is reversed to −2.",
  ]);
  assert.deepEqual(totals, [
    { id: 'maya', name: 'Maya', delta: 7 },
    { id: 'dana', name: 'Dana', delta: 3 },
    { id: 'lily', name: 'Lily', delta: 3 },
    { id: 'sam', name: 'Sam', delta: -2 },
  ]);
});

test('Perfect Frame and challenge sentences', () => {
  const perfect = buildRecap(
    scoreRound({ framers: [{ id: 'maya' }], votes: { ben: { 0: 'noah' } } }),
    NAMES
  );
  assert.match(perfect.paragraphs[1], /Nobody caught Maya, a Perfect Frame: \+5!/);
  assert.match(perfect.paragraphs[1], /Ben fell for it and voted for Noah, which gives Maya \+1\./);

  const challenged = buildRecap(
    scoreRound({ framers: [{ id: 'maya' }], votes: { ben: { 0: 'maya' } }, challenged: [0] }),
    NAMES
  );
  assert.match(challenged.paragraphs[1], /Ben caught Maya: \+3\./);
  assert.match(challenged.paragraphs[1], /challenged, so Maya gets no points/);
});

test('Two-Framer recap has a paragraph per answer and an Accomplice line', () => {
  const result = scoreRound({
    framers: [{ id: 'maya' }, { id: 'sam' }],
    accompliceId: 'dana',
    votes: { sarah: { 0: 'dana', 1: 'sam' }, grandpa: { 0: 'noah', 1: 'dana' } },
  });
  const { paragraphs } = buildRecap(result, NAMES);
  assert.match(paragraphs[0], /^Maya was a Framer this round\. Sam was a Framer this round\./);
  assert.match(paragraphs[0], /Dana was the Accomplice, trying to take the heat off Maya and Sam\./);
  assert.match(paragraphs[1], /^On Maya's answer:/);
  assert.match(paragraphs[2], /^On Sam's answer:/);
  assert.equal(
    paragraphs[3],
    'Dana drew 2 votes (+2 each), and 1 vote landed on Maya and Sam (−1 each): +3 for Dana.'
  );
});
