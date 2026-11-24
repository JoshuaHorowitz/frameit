// FOMO: everyone gets a prompt except one secret Faker. Players go around the
// circle out loud, each giving a one- or two-word hint. The Faker has to work
// out the prompt from the hints and blend in. Then everyone votes for who they
// think the Faker is.
//
// The phones do very little: show the prompt (or "you're the Faker"), then a
// voting screen, then the reveal. All the hints happen in person.
//
// Scoring: +3 for each player who votes for the Faker; the Faker gets +2 for
// every player who votes for someone else. The Faker doesn't vote.

import { GameError } from '../game.js';
import { normalizeName } from '../../shared/protocol.js';
import { FOMO_PROMPTS } from '../../shared/fomoPrompts.js';

export const PHASES = Object.freeze({
  SETUP: 'setup',
  HINTS: 'hints',
  VOTING: 'voting',
  REVEAL: 'reveal',
  SCOREBOARD: 'scoreboard',
  FINAL: 'final',
});
const P = PHASES;

export const DEFAULT_FOMO_SETTINGS = Object.freeze({
  points: Object.freeze({
    catchFaker: 3, // each player who votes for the Faker
    fakerPerMiss: 2, // the Faker, per player who votes for someone else
  }),
});

const MAX_PROMPT = 80;
const fail = (code, message) => {
  throw new GameError(code, message);
};
const pickOne = (list, random) => list[Math.floor(random() * list.length)];
const cleanText = (text, max) => String(text ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

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

// ---------- state ----------

export function createState(config = {}, random = Math.random) {
  const state = {
    phase: P.SETUP,
    roundNumber: 0,
    players: {},
    settings: mergeSettings(DEFAULT_FOMO_SETTINGS, config.settings),
    usedPrompts: [],
    round: null,
    notice: null,
  };
  prepareRound(state, random);
  return state;
}

export function saveConfig(state) {
  return { settings: state.settings };
}

const playerList = (state) => Object.values(state.players);
const activeIds = (state) => playerList(state).filter((p) => !p.waiting).map((p) => p.id);
const lowestScore = (state) => {
  const scores = playerList(state).map((p) => p.score);
  return scores.length ? Math.min(...scores) : 0;
};

function drawPrompt(state, random) {
  let pool = FOMO_PROMPTS.filter((p) => !state.usedPrompts.includes(p));
  if (pool.length === 0) {
    state.usedPrompts = [];
    pool = FOMO_PROMPTS;
  }
  const prompt = pickOne(pool, random);
  state.usedPrompts.push(prompt);
  return prompt;
}

function prepareRound(state, random) {
  for (const p of playerList(state)) p.waiting = false;
  state.round = {
    number: state.roundNumber + 1,
    prompt: drawPrompt(state, random),
    customPrompt: false,
    fakerChoice: null, // admin-assigned Faker id, or null for random
    fakerId: null,
    assignedByAdmin: false,
    firstId: null, // who gives the first hint
    voterIds: [],
    votes: {},
    result: null,
  };
  state.phase = P.SETUP;
}

// ---------- players ----------

export function join(state, name) {
  const id = normalizeName(name);
  const existing = state.players[id];
  if (existing) {
    existing.connected = true;
    return { playerId: id };
  }
  const midRound = state.phase !== P.SETUP;
  state.players[id] = { id, name, score: lowestScore(state), connected: true, waiting: midRound };
  return { playerId: id };
}

export function setConnected(state, playerId, connected) {
  if (state.players[playerId]) state.players[playerId].connected = connected;
}

export function removePlayer(state, playerId, now, random) {
  const round = state.round;
  if (round && (state.phase === P.HINTS || state.phase === P.VOTING) && round.fakerId === playerId) {
    state.notice = { code: 'round_cancelled', message: `${state.players[playerId].name} (the Faker) was removed, so the round was cancelled.`, at: now };
    delete state.players[playerId];
    prepareRound(state, random);
    return;
  }
  if (round) {
    round.voterIds = round.voterIds.filter((id) => id !== playerId);
    delete round.votes[playerId];
  }
  delete state.players[playerId];
}

// No timers: the admin moves the game along.
export const nextAlarm = () => null;
export const tick = () => {};
export const isFinished = (state) => state.phase === P.FINAL;

// ---------- scoring ----------

export function scoreRound(round, points, playerIds = []) {
  const p = { ...DEFAULT_FOMO_SETTINGS.points, ...points };
  const deltas = Object.fromEntries(playerIds.map((id) => [id, 0]));
  const add = (id, n) => (deltas[id] = (deltas[id] ?? 0) + n);
  const right = [];
  const wrong = {}; // suspectId -> voterIds
  for (const voterId of round.voterIds) {
    const suspect = round.votes[voterId];
    if (!suspect) continue;
    if (suspect === round.fakerId) right.push(voterId);
    else (wrong[suspect] ??= []).push(voterId);
  }
  for (const id of right) add(id, p.catchFaker);
  const fooled = Object.values(wrong).reduce((n, list) => n + list.length, 0);
  add(round.fakerId, fooled * p.fakerPerMiss);
  return { deltas, right, wrong, fooled };
}

// ---------- actions ----------

function requirePhase(state, ...phases) {
  if (!phases.includes(state.phase)) fail('wrong_phase', 'You cannot do that right now.');
}

const playerActions = {
  castVote(state, actor, { suspectId }) {
    requirePhase(state, P.VOTING);
    const round = state.round;
    // The Faker doesn't vote.
    if (!round.voterIds.includes(actor.playerId)) fail('not_voter', 'You are not voting this round.');
    if (!state.players[suspectId] || suspectId === actor.playerId) fail('bad_suspect', 'Pick someone else.');
    round.votes[actor.playerId] = suspectId;
  },
};

const adminActions = {
  setPrompt(state, actor, { text, random: useRandom }, now, random) {
    requirePhase(state, P.SETUP);
    if (useRandom) {
      state.round.prompt = drawPrompt(state, random);
      state.round.customPrompt = false;
      return;
    }
    const prompt = cleanText(text, MAX_PROMPT);
    if (!prompt) fail('bad_prompt', 'Type a prompt first.');
    state.round.prompt = prompt;
    state.round.customPrompt = !FOMO_PROMPTS.includes(prompt);
  },

  setFaker(state, actor, { playerId }) {
    requirePhase(state, P.SETUP);
    if (playerId && !state.players[playerId]) fail('bad_role', 'Unknown player.');
    state.round.fakerChoice = playerId || null;
  },

  startRound(state, actor, _payload, now, random) {
    requirePhase(state, P.SETUP);
    const round = state.round;
    const active = activeIds(state);
    if (active.length < 3) fail('not_enough_players', 'FOMO needs at least 3 players.');
    if (!round.prompt) fail('bad_prompt', 'Pick a prompt first.');
    const connected = active.filter((id) => state.players[id].connected);
    let fakerId = round.fakerChoice;
    if (fakerId && !active.includes(fakerId)) fail('bad_role', 'That player is not in the game.');
    if (!fakerId) fakerId = pickOne(connected.length ? connected : active, random);
    round.fakerId = fakerId;
    round.assignedByAdmin = Boolean(round.fakerChoice);
    round.voterIds = active.filter((id) => id !== fakerId);
    round.firstId = pickOne(active, random);
    round.votes = {};
    state.notice = null;
    state.phase = P.HINTS;
  },

  startVoting(state) {
    requirePhase(state, P.HINTS);
    state.phase = P.VOTING;
  },

  reveal(state) {
    requirePhase(state, P.VOTING);
    const round = state.round;
    round.result = scoreRound(round, state.settings.points, Object.keys(state.players));
    for (const [id, delta] of Object.entries(round.result.deltas)) {
      if (state.players[id]) state.players[id].score += delta;
    }
    state.roundNumber = round.number;
    state.phase = P.REVEAL;
  },

  showScoreboard(state) {
    requirePhase(state, P.REVEAL);
    state.phase = P.SCOREBOARD;
  },

  cancelRound(state, actor, _payload, now, random) {
    requirePhase(state, P.HINTS, P.VOTING);
    state.notice = { code: 'round_cancelled', message: 'The admin cancelled the round.', at: now };
    prepareRound(state, random);
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

  updateSettings(state, actor, { settings }) {
    state.settings = mergeSettings(state.settings, settings);
  },
};

export function applyAction(state, actor, action, now, random = Math.random) {
  const type = action?.type;
  if (Object.hasOwn(adminActions, type)) {
    if (!actor.isAdmin) fail('not_admin', 'Only the admin can do that.');
    return adminActions[type](state, actor, action, now, random);
  }
  if (Object.hasOwn(playerActions, type)) return playerActions[type](state, actor, action, now, random);
  fail('unknown_action', `Unknown action: ${type}`);
}

// ---------- views ----------

const publicPlayers = (state) =>
  playerList(state)
    .map(({ id, name, score, connected, waiting }) => ({ id, name, score, connected, waiting }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

function roleOf(state, id) {
  const round = state.round;
  if (!round?.fakerId || state.phase === P.SETUP) return null;
  if (state.players[id]?.waiting) return 'waiting';
  if (round.fakerId === id) return 'faker';
  return round.voterIds.includes(id) ? 'player' : 'waiting';
}

function votesIn(round) {
  return {
    votesIn: round.voterIds.filter((id) => round.votes[id]).length,
    votesExpected: round.voterIds.length,
  };
}

function revealed(state) {
  const round = state.round;
  return {
    revealed: true,
    prompt: round.prompt,
    fakerId: round.fakerId,
    votes: round.votes,
    deltas: round.result?.deltas ?? {},
  };
}

export function buildView(state, viewer) {
  const { phase, round } = state;
  const base = {
    phase,
    roundNumber: round?.number ?? state.roundNumber,
    deadline: null,
    pausedRemaining: null,
    timerTotal: null,
    players: publicPlayers(state),
    notice: state.notice,
  };

  if (viewer?.isAdmin) {
    const admin = { settings: state.settings };
    if (phase === P.SETUP) {
      admin.setup = { prompt: round.prompt, customPrompt: round.customPrompt, fakerChoice: round.fakerChoice, prompts: FOMO_PROMPTS };
    } else if (phase === P.HINTS || phase === P.VOTING) {
      admin.live = {
        prompt: round.prompt,
        firstId: round.firstId,
        knownFakerId: round.assignedByAdmin ? round.fakerId : null,
        ...votesIn(round),
      };
    } else if (round?.result) {
      admin.review = { ...revealed(state), right: round.result.right, wrong: round.result.wrong, fooled: round.result.fooled };
    }
    return { ...base, you: { isAdmin: true }, admin };
  }

  const me = state.players[viewer?.playerId];
  if (!me) return { ...base, you: null, round: null };
  const role = roleOf(state, me.id);
  let r = null;
  if ((phase === P.REVEAL || phase === P.SCOREBOARD || phase === P.FINAL) && round?.result) {
    r = revealed(state);
  } else if (phase === P.HINTS || phase === P.VOTING) {
    r = { firstId: round.firstId };
    if (role === 'faker') r.fakerPoints = state.settings.points.fakerPerMiss;
    // The whole game: everyone sees the prompt except the Faker.
    if (role === 'player') r.prompt = round.prompt;
    if (phase === P.VOTING && role === 'player') r.myVote = round.votes[me.id] ?? null;
    if (phase === P.VOTING && (role === 'player' || role === 'faker')) Object.assign(r, votesIn(round));
  }
  return { ...base, you: { id: me.id, name: me.name, score: me.score, role }, round: r };
}
