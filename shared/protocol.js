// Shared constants used by both the server and the phones.

export const ADMIN_NAME = 'Josh Horowitz';

// A player's id is their name, lowercased with all whitespace removed,
// so "Sam", "sam " and "S am" are the same player.
export function normalizeName(name) {
  return String(name ?? '').toLowerCase().replace(/\s+/g, '');
}

export function isAdminName(name) {
  return normalizeName(name) === normalizeName(ADMIN_NAME);
}

export const PHASES = Object.freeze({
  LOBBY: 'lobby',
  SETUP: 'setup',
  ROLES: 'roles',
  ANSWERING: 'answering',
  VOTING: 'voting',
  REVIEW: 'review',
  RECAP: 'recap',
  SCOREBOARD: 'scoreboard',
  FINAL: 'final',
});

export const DEFAULT_POINTS = Object.freeze({
  catchFramer: 3, // each voter who picks the Framer
  voteOnOther: 1, // Framer, per vote on anyone but them
  perfectFrame: 5, // Framer bonus when nobody caught them
  vandalPerCatch: 1, // Vandal, per player who caught a Framer
  catchVandal: 3, // Framer bonus for guessing the Vandal
  accompliceVote: 2, // Accomplice, per vote on themselves
  accomplicePenalty: 1, // Accomplice loses this per vote on any Framer
});

export const DEFAULT_SETTINGS = Object.freeze({
  timers: Object.freeze({ roles: 8, answering: 30, voting: 60 }), // seconds
  framerGraceSeconds: 20,
  randomChances: Object.freeze({ vandal: 0.3, accomplice: 0.25, twoFramers: 0.15 }),
  points: DEFAULT_POINTS,
});
