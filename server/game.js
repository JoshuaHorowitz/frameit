// The FrameIt game engine: a plain state object and the functions that change it.
// It knows nothing about WebSockets or Cloudflare, so it can be unit-tested
// with Node alone. GameRoom.js wires it to PartyServer.
//
// Every function that needs the time or randomness takes them as arguments
// (`now` in ms, `random` returning [0, 1)), so tests are deterministic.

import { PHASES as P, DEFAULT_SETTINGS, normalizeName, isAdminName } from '../shared/protocol.js';
import { QUESTIONS } from '../shared/questions.js';
import { scoreRound } from './scoring.js';
import { buildRecap } from './recap.js';

export const ROUND_PHASES = new Set([P.ROLES, P.ANSWERING, P.VOTING]);
export const REVEALED_PHASES = new Set([P.RECAP, P.SCOREBOARD, P.FINAL]);

const MAX_NAME = 24;
const MAX_ANSWER = 200;
const MAX_MESSAGE = 120;
const MAX_MESSAGES_PER_PLAYER = 40;
const MAX_QUESTION = 200;

export class GameError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.code = code;
  }
}
const fail = (code, message) => {
  throw new GameError(code, message);
};

// ---------- state ----------

// Bring a saved state up to date with the current settings shape, so a game
// stored by an older deploy keeps working (unknown keys are dropped, new ones
// get their defaults).
export function migrateState(state) {
  state.settings = mergeSettings(DEFAULT_SETTINGS, state.settings);
  state.removedQuestions ??= [];
  return state;
}

export function createState(settings = {}) {
  return {
    phase: P.LOBBY,
    roundNumber: 0, // completed (revealed) rounds
    players: {},
    adminConnected: false,
    settings: mergeSettings(DEFAULT_SETTINGS, settings),
    customQuestions: [],
    removedQuestions: [], // built-in questions the admin deleted
    usedQuestions: [],
    round: null,
    notice: null, // { code, message, at } shown once to everyone, e.g. a cancelled round
  };
}

function mergeSettings(base, patch) {
  const out = structuredClone(base);
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (!(key in base)) continue;
    if (base[key] && typeof base[key] === 'object') {
      if (value && typeof value === 'object') out[key] = mergeSettings(base[key], value);
    } else if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      out[key] = value;
    }
  }
  return out;
}

const playerList = (state) => Object.values(state.players);
const activeIds = (state) => playerList(state).filter((p) => !p.waiting).map((p) => p.id);
const lowestScore = (state) => {
  const scores = playerList(state).map((p) => p.score);
  return scores.length ? Math.min(...scores) : 0;
};

const pickOne = (list, random) => list[Math.floor(random() * list.length)];

export function framerIndexOf(round, id) {
  return round?.framers?.findIndex((f) => f.id === id) ?? -1;
}

export function roleOf(state, id) {
  const { round, phase } = state;
  const player = state.players[id];
  if (!player) return null;
  if (!round || round.framers.length === 0 || phase === P.LOBBY || phase === P.SETUP) return null;
  if (framerIndexOf(round, id) >= 0) return 'framer';
  if (round.vandalId === id) return 'vandal';
  if (round.accompliceId === id) return 'accomplice';
  if (round.voterIds.includes(id)) return 'voter';
  return 'waiting';
}

export function votesProgress(round) {
  const complete = round.voterIds.filter((v) =>
    round.framers.every((_, i) => round.votes[v]?.[i] != null)
  ).length;
  return { votesIn: complete, votesExpected: round.voterIds.length };
}

// ---------- joining and connections ----------

export function join(state, rawName) {
  const name = String(rawName ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
  const id = normalizeName(name);
  if (!id) fail('bad_name', 'Please enter a name.');
  if (isAdminName(name)) {
    state.adminConnected = true;
    return { isAdmin: true, playerId: null };
  }
  const existing = state.players[id];
  if (existing) {
    existing.connected = true;
    if (state.round?.grace) delete state.round.grace[id];
    return { isAdmin: false, playerId: id, rejoined: true };
  }
  const midRound = state.phase !== P.LOBBY && state.phase !== P.SETUP;
  state.players[id] = { id, name, score: lowestScore(state), connected: true, waiting: midRound };
  return { isAdmin: false, playerId: id, rejoined: false };
}

// Called when a player's last connection closes (connected=false) or a new one opens.
export function setConnected(state, playerId, connected, now) {
  const player = state.players[playerId];
  if (!player) return;
  player.connected = connected;
  const round = state.round;
  if (!round) return;
  round.grace ??= {};
  if (connected) {
    delete round.grace[playerId];
  } else if (ROUND_PHASES.has(state.phase) && framerIndexOf(round, playerId) >= 0) {
    round.grace[playerId] = now + state.settings.framerGraceSeconds * 1000;
  }
}

// ---------- timers ----------

// The next time (ms) the engine needs tick() to run, or null.
export function nextAlarm(state) {
  const round = state.round;
  if (!round || !ROUND_PHASES.has(state.phase)) return null;
  const times = Object.values(round.grace ?? {});
  if (round.deadline != null) times.push(round.deadline);
  return times.length ? Math.min(...times) : null;
}

export function tick(state, now, random = Math.random) {
  const round = state.round;
  if (!round || !ROUND_PHASES.has(state.phase)) return;
  const gone = Object.entries(round.grace ?? {}).find(([, until]) => until <= now);
  if (gone) {
    const name = state.players[gone[0]]?.name ?? 'The Framer';
    cancelRound(state, random, now, `${name} left, so the round was cancelled.`);
    return;
  }
  if (round.deadline != null && round.deadline <= now) advance(state, now, random);
}

function setDeadline(state, now, seconds) {
  state.round.deadline = now + seconds * 1000;
  state.round.pausedRemaining = null;
}

// ---------- round lifecycle ----------

// Every question currently in play: built-ins the admin hasn't deleted, then custom ones.
export function questionBank(state) {
  const removed = new Set(state.removedQuestions ?? []);
  return [
    ...QUESTIONS.filter((q) => !removed.has(q)).map((text) => ({ text, custom: false })),
    ...state.customQuestions.map((text) => ({ text, custom: true })),
  ];
}

function drawQuestion(state, random) {
  const all = questionBank(state).map((q) => q.text);
  if (all.length === 0) return null; // the admin deleted every question
  let pool = all.filter((q) => !state.usedQuestions.includes(q));
  if (pool.length === 0) {
    state.usedQuestions = [];
    pool = all;
  }
  const question = pickOne(pool, random);
  state.usedQuestions.push(question);
  return question;
}

function prepareRound(state, random) {
  for (const p of playerList(state)) p.waiting = false;
  state.round = {
    number: state.roundNumber + 1,
    config: {
      addOns: { vandal: false, accomplice: false, twoFramers: false },
      roles: { framers: [null, null], vandal: null, accomplice: null },
    },
    question: drawQuestion(state, random),
    framers: [],
    vandalId: null, // the Saboteur
    vandalPushId: null, // who the Saboteur is pushing everyone toward
    accompliceId: null,
    voterIds: [],
    assignedByAdmin: { framers: false, vandal: false, accomplice: false },
    messages: [],
    votes: {},
    vandalGuesses: {},
    challenged: [],
    deadline: null,
    pausedRemaining: null,
    grace: {},
    result: null,
  };
  state.phase = P.SETUP;
}

function cancelRound(state, random, now, message) {
  state.notice = { code: 'round_cancelled', message, at: now };
  prepareRound(state, random);
}

function startRound(state, now, random) {
  if (!state.round.question) fail('no_questions', 'There are no questions left. Add one in Settings.');
  const round = state.round;
  const { addOns, roles } = round.config;
  const active = activeIds(state);
  const framerCount = addOns.twoFramers ? 2 : 1;

  const slots = [];
  for (let i = 0; i < framerCount; i++) slots.push({ kind: 'framer', fixed: roles.framers[i] ?? null });
  if (addOns.vandal) slots.push({ kind: 'vandal', fixed: roles.vandal ?? null });
  if (addOns.accomplice) slots.push({ kind: 'accomplice', fixed: roles.accomplice ?? null });

  const taken = new Set();
  for (const slot of slots) {
    if (!slot.fixed) continue;
    if (!active.includes(slot.fixed)) fail('bad_role', 'That player is not in the game.');
    if (taken.has(slot.fixed)) fail('duplicate_role', 'One player cannot have two roles.');
    taken.add(slot.fixed);
  }
  const connectedActive = active.filter((id) => state.players[id].connected);
  for (const slot of slots) {
    if (slot.fixed) {
      slot.id = slot.fixed;
      continue;
    }
    const pool = connectedActive.filter((id) => !taken.has(id));
    if (pool.length === 0) fail('not_enough_players', 'Not enough players for these roles.');
    slot.id = pickOne(pool, random);
    taken.add(slot.id);
  }

  const voterIds = active.filter((id) => !taken.has(id));
  if (voterIds.length === 0) fail('no_voters', 'This setup leaves nobody to vote.');

  const framerSlots = slots.filter((s) => s.kind === 'framer');
  round.framers = framerSlots.map((s) => ({ id: s.id, ready: false, draft: '', answer: '' }));
  round.vandalId = slots.find((s) => s.kind === 'vandal')?.id ?? null;
  round.accompliceId = slots.find((s) => s.kind === 'accomplice')?.id ?? null;
  round.voterIds = voterIds;
  round.assignedByAdmin = {
    framers: framerSlots.every((s) => s.fixed),
    vandal: Boolean(roles.vandal && addOns.vandal),
    accomplice: Boolean(roles.accomplice && addOns.accomplice),
  };
  state.notice = null;
  state.phase = P.ROLES;
  setDeadline(state, now, state.settings.timers.roles);
}

function advance(state, now, random) {
  const round = state.round;
  if (state.phase === P.ROLES) {
    state.phase = P.ANSWERING;
    setDeadline(state, now, state.settings.timers.answering);
  } else if (state.phase === P.ANSWERING) {
    for (const f of round.framers) f.answer = (f.answer || f.draft || '').trim();
    if (round.framers.some((f) => !f.answer)) {
      cancelRound(state, random, now, 'The Framer ran out of time without an answer, so the round was cancelled.');
      return;
    }
    state.phase = P.VOTING;
    setDeadline(state, now, state.settings.timers.voting);
  } else if (state.phase === P.VOTING) {
    finishVoting(state);
  }
}

function computeResult(state) {
  const round = state.round;
  const result = scoreRound(round, state.settings.points, Object.keys(state.players));
  const names = Object.fromEntries(playerList(state).map((p) => [p.id, p.name]));
  round.result = { ...result, recap: buildRecap(result, names, state.settings.points) };
}

function finishVoting(state) {
  state.round.deadline = null;
  state.round.pausedRemaining = null;
  state.round.grace = {};
  state.phase = P.REVIEW;
  computeResult(state);
}

function maybeEndVotingEarly(state) {
  const round = state.round;
  const { votesIn, votesExpected } = votesProgress(round);
  const guessesIn = !round.vandalId || round.framers.every((f) => round.vandalGuesses[f.id]);
  if (votesIn === votesExpected && guessesIn) finishVoting(state);
}

// ---------- actions ----------

function requirePhase(state, ...phases) {
  if (!phases.includes(state.phase)) fail('wrong_phase', 'You cannot do that right now.');
}
function requireAdmin(actor) {
  if (!actor.isAdmin) fail('not_admin', 'Only the admin can do that.');
}
function requirePlayer(state, actor) {
  const player = state.players[actor.playerId];
  if (!player) fail('not_joined', 'Join the game first.');
  return player;
}
function requireFramer(state, actor) {
  const index = framerIndexOf(state.round, actor.playerId);
  if (index < 0) fail('not_framer', 'Only the Framer can do that.');
  return state.round.framers[index];
}
const cleanText = (text, max) => String(text ?? '').trim().slice(0, max);

const playerActions = {
  // The Framer has read their briefing; once every Framer is ready the
  // question appears, without waiting for the rest of the roles timer.
  ready(state, actor, _payload, now, random) {
    requirePhase(state, P.ROLES);
    requireFramer(state, actor).ready = true;
    if (state.round.framers.every((f) => f.ready)) advance(state, now, random);
  },

  draftAnswer(state, actor, { text }) {
    requirePhase(state, P.ANSWERING);
    requireFramer(state, actor).draft = String(text ?? '').slice(0, MAX_ANSWER);
  },

  submitAnswer(state, actor, { text }) {
    requirePhase(state, P.ANSWERING);
    const framer = requireFramer(state, actor);
    const answer = cleanText(text, MAX_ANSWER);
    if (!answer) fail('empty_answer', 'Type an answer first.');
    framer.answer = answer;
    framer.draft = answer;
  },

  sendMessage(state, actor, { text }, now) {
    requirePhase(state, P.ANSWERING);
    requirePlayer(state, actor);
    const round = state.round;
    if (framerIndexOf(round, actor.playerId) >= 0) fail('not_allowed', 'The Framer cannot send messages.');
    if (roleOf(state, actor.playerId) === 'waiting') fail('not_allowed', 'Wait for the next round.');
    const message = cleanText(text, MAX_MESSAGE);
    if (!message) return;
    const sent = round.messages.filter((m) => m.fromId === actor.playerId).length;
    if (sent >= MAX_MESSAGES_PER_PLAYER) fail('too_many_messages', 'That is enough teasing for one round!');
    round.messages.push({ fromId: actor.playerId, text: message, at: now });
  },

  castVote(state, actor, { answerIndex, suspectId }) {
    requirePhase(state, P.VOTING);
    const round = state.round;
    if (!round.voterIds.includes(actor.playerId)) fail('not_voter', 'You are not voting this round.');
    const index = Number(answerIndex ?? 0);
    if (!Number.isInteger(index) || index < 0 || index >= round.framers.length) fail('bad_answer', 'No such answer.');
    if (!state.players[suspectId] || suspectId === actor.playerId) fail('bad_suspect', 'Pick someone else.');
    (round.votes[actor.playerId] ??= {})[index] = suspectId;
    maybeEndVotingEarly(state);
  },

  // The Saboteur chooses who to push everyone toward. They can change their
  // mind until voting starts.
  choosePush(state, actor, { suspectId }) {
    requirePhase(state, P.ROLES, P.ANSWERING);
    const round = state.round;
    if (round.vandalId !== actor.playerId) fail('not_saboteur', 'Only the Saboteur can do that.');
    if (!state.players[suspectId] || suspectId === actor.playerId) fail('bad_suspect', 'Pick someone else.');
    if (framerIndexOf(round, suspectId) >= 0) fail('bad_suspect', 'Pick someone who is not the Framer.');
    round.vandalPushId = suspectId;
  },

  guessVandal(state, actor, { suspectId }) {
    requirePhase(state, P.VOTING);
    const framer = requireFramer(state, actor);
    if (!state.round.vandalId) fail('no_vandal', 'There is no Saboteur this round.');
    if (!state.players[suspectId] || suspectId === actor.playerId) fail('bad_suspect', 'Pick someone else.');
    state.round.vandalGuesses[framer.id] = suspectId;
    maybeEndVotingEarly(state);
  },
};

const adminActions = {
  startGame(state, actor, _payload, now, random) {
    requirePhase(state, P.LOBBY);
    prepareRound(state, random);
  },

  configureRound(state, actor, { addOns, roles }) {
    requirePhase(state, P.SETUP);
    const config = state.round.config;
    if (addOns) {
      for (const key of ['vandal', 'accomplice', 'twoFramers']) {
        if (key in addOns) config.addOns[key] = Boolean(addOns[key]);
      }
    }
    if (roles) {
      const valid = (id) => (id == null || id === '' ? null : state.players[id] ? id : fail('bad_role', 'Unknown player.'));
      if (roles.framers) config.roles.framers = [valid(roles.framers[0]), valid(roles.framers[1])];
      if ('vandal' in roles) config.roles.vandal = valid(roles.vandal);
      if ('accomplice' in roles) config.roles.accomplice = valid(roles.accomplice);
    }
  },

  randomizeAddOns(state, actor, _payload, now, random) {
    requirePhase(state, P.SETUP);
    const chances = state.settings.randomChances;
    const addOns = state.round.config.addOns;
    for (const key of ['vandal', 'accomplice', 'twoFramers']) addOns[key] = random() < chances[key];
  },

  rerollQuestion(state, actor, _payload, now, random) {
    requirePhase(state, P.SETUP);
    state.round.question = drawQuestion(state, random);
  },

  startRound(state, actor, _payload, now, random) {
    requirePhase(state, P.SETUP);
    startRound(state, now, random);
  },

  addTime(state, actor, { seconds = 15 }) {
    requirePhase(state, ...ROUND_PHASES);
    const ms = Math.max(1, Math.min(300, Number(seconds) || 0)) * 1000;
    if (state.round.pausedRemaining != null) state.round.pausedRemaining += ms;
    else state.round.deadline += ms;
  },

  pause(state, actor, _payload, now) {
    requirePhase(state, ...ROUND_PHASES);
    const round = state.round;
    if (round.pausedRemaining != null) return;
    round.pausedRemaining = Math.max(0, round.deadline - now);
    round.deadline = null;
  },

  resume(state, actor, _payload, now) {
    requirePhase(state, ...ROUND_PHASES);
    const round = state.round;
    if (round.pausedRemaining == null) return;
    round.deadline = now + round.pausedRemaining;
    round.pausedRemaining = null;
  },

  cancelRound(state, actor, _payload, now, random) {
    requirePhase(state, ...ROUND_PHASES);
    cancelRound(state, random, now, 'The admin cancelled the round.');
  },

  // Move on without waiting for the timer. From answering this needs every
  // Framer to have marked their answer done, so nobody is cut off mid-sentence.
  skipAhead(state, actor, _payload, now, random) {
    requirePhase(state, ...ROUND_PHASES);
    const round = state.round;
    if (state.phase === P.ANSWERING && !round.framers.every((f) => f.answer)) {
      fail('not_ready', 'Wait until the Framer has marked their answer done.');
    }
    if (state.phase === P.VOTING) finishVoting(state);
    else advance(state, now, random);
  },

  challenge(state, actor, { answerIndex = 0 }) {
    requirePhase(state, P.REVIEW);
    const index = Number(answerIndex);
    if (!state.round.framers[index]) fail('bad_answer', 'No such answer.');
    if (!state.round.challenged.includes(index)) state.round.challenged.push(index);
    computeResult(state);
  },

  unchallenge(state, actor, { answerIndex = 0 }) {
    requirePhase(state, P.REVIEW);
    state.round.challenged = state.round.challenged.filter((i) => i !== Number(answerIndex));
    computeResult(state);
  },

  reveal(state) {
    requirePhase(state, P.REVIEW);
    for (const [id, delta] of Object.entries(state.round.result.deltas)) {
      if (state.players[id]) state.players[id].score += delta;
    }
    state.roundNumber = state.round.number;
    state.phase = P.RECAP;
  },

  showScoreboard(state) {
    requirePhase(state, P.RECAP);
    state.phase = P.SCOREBOARD;
  },

  nextRound(state, actor, _payload, now, random) {
    requirePhase(state, P.SCOREBOARD);
    prepareRound(state, random);
  },

  endGame(state) {
    requirePhase(state, P.SCOREBOARD, P.SETUP);
    state.phase = P.FINAL;
  },

  adjustScore(state, actor, { playerId, delta }) {
    const player = state.players[playerId] ?? fail('bad_player', 'Unknown player.');
    const n = Number(delta);
    if (!Number.isFinite(n)) fail('bad_delta', 'Not a number.');
    player.score += n;
  },

  kick(state, actor, { playerId }, now, random) {
    if (!state.players[playerId]) fail('bad_player', 'Unknown player.');
    const round = state.round;
    if (round && ROUND_PHASES.has(state.phase)) {
      if (framerIndexOf(round, playerId) >= 0) {
        cancelRound(state, random, now, `${state.players[playerId].name} was removed, so the round was cancelled.`);
      } else {
        if (round.vandalId === playerId) round.vandalId = null;
        if (round.accompliceId === playerId) round.accompliceId = null;
        round.voterIds = round.voterIds.filter((id) => id !== playerId);
        delete round.votes[playerId];
        if (state.phase === P.VOTING) maybeEndVotingEarly(state);
      }
    }
    delete state.players[playerId];
    return { kicked: playerId };
  },

  addQuestion(state, actor, { text }, now, random) {
    const question = cleanText(text, MAX_QUESTION);
    if (question.length < 3) fail('bad_question', 'That question is too short.');
    if (!state.customQuestions.includes(question)) state.customQuestions.push(question);
    state.removedQuestions = state.removedQuestions.filter((q) => q !== question);
    if (state.phase === P.SETUP && !state.round.question) state.round.question = drawQuestion(state, random);
  },

  // Delete one question: a custom one is gone for good; a built-in one can be
  // brought back with restoreQuestions.
  removeQuestion(state, actor, { text }, now, random) {
    if (state.customQuestions.includes(text)) {
      state.customQuestions = state.customQuestions.filter((q) => q !== text);
    } else if (QUESTIONS.includes(text)) {
      if (!state.removedQuestions.includes(text)) state.removedQuestions.push(text);
    } else {
      fail('bad_question', 'That question is not in the bank.');
    }
    // If it was the question lined up for the next round, line up another.
    if (state.phase === P.SETUP && state.round.question === text) state.round.question = drawQuestion(state, random);
  },

  restoreQuestions(state, actor, _payload, now, random) {
    state.removedQuestions = [];
    if (state.phase === P.SETUP && !state.round.question) state.round.question = drawQuestion(state, random);
  },

  updateSettings(state, actor, { settings }) {
    state.settings = mergeSettings(state.settings, settings);
  },

  // Wipe players, scores and rounds and go back to an empty lobby.
  // Settings and the admin's question bank (added and deleted questions) are kept.
  resetGame(state) {
    const { settings, customQuestions, removedQuestions } = state;
    const fresh = createState(settings);
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, fresh, { customQuestions, removedQuestions, adminConnected: true });
    return { reset: true };
  },
};

// Apply one action. `actor` is { isAdmin, playerId }.
// Returns an object of side effects for the adapter (e.g. { kicked }), or undefined.
// Throws GameError for anything invalid; the state is then unchanged.
export function applyAction(state, actor, action, now, random = Math.random) {
  const type = action?.type;
  if (Object.hasOwn(adminActions, type)) {
    requireAdmin(actor);
    return adminActions[type](state, actor, action, now, random);
  }
  if (Object.hasOwn(playerActions, type)) {
    return playerActions[type](state, actor, action, now, random);
  }
  fail('unknown_action', `Unknown action: ${type}`);
}
