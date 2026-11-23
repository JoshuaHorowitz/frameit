// Builds the private snapshot each phone receives. This is the ONLY place
// state leaves the server, so every secret is gated here, by role and phase.
// See "What each phone sees" in the technical design doc.

import { PHASES as P } from '../shared/protocol.js';
import { ROUND_PHASES, REVEALED_PHASES, roleOf, framerIndexOf, votesProgress } from './game.js';

const TIMER_FOR_PHASE = { [P.ROLES]: 'roles', [P.ANSWERING]: 'answering', [P.VOTING]: 'voting' };

const publicPlayers = (state) =>
  Object.values(state.players)
    .map(({ id, name, score, connected, waiting }) => ({ id, name, score, connected, waiting }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

function revealedRound(round) {
  return {
    question: round.question,
    framers: round.framers.map(({ id, answer }) => ({ id, answer })),
    vandalId: round.vandalId,
    vandalPushId: round.vandalPushId ?? null,
    accompliceId: round.accompliceId,
    votes: round.votes,
    vandalGuesses: round.vandalGuesses,
    challenged: round.challenged,
    deltas: round.result?.deltas ?? {},
  };
}

const answersFor = (round) => round.framers.map((f, index) => ({ index, text: f.answer }));
const myMessages = (round, id) => round.messages.filter((m) => m.fromId === id).map(({ text, at }) => ({ text, at }));

function playerRoundView(state, id, role) {
  const { round, phase } = state;
  if (!round || phase === P.LOBBY || phase === P.SETUP) return null;
  if (REVEALED_PHASES.has(phase) && round.result) return { revealed: true, ...revealedRound(round) };
  if (phase === P.REVIEW || role === 'waiting') return { waitingForReveal: phase === P.REVIEW };

  const view = {};
  const voting = phase === P.VOTING;
  const answeringOrLater = phase === P.ANSWERING || voting;
  if (voting) Object.assign(view, votesProgress(round));

  if (role === 'framer') {
    const f = round.framers[framerIndexOf(round, id)];
    view.secondFramerExists = round.framers.length > 1;
    view.ready = f.ready;
    if (answeringOrLater) {
      view.question = round.question;
      view.myAnswer = f.answer;
      view.myDraft = f.draft;
      view.messages = round.messages.map(({ fromId, text, at }) => ({ fromId, text, at }));
    }
    if (voting && round.vandalId) {
      view.vandalPresent = true;
      view.myVandalGuess = round.vandalGuesses[id] ?? null;
    }
    return view;
  }

  if (role === 'vandal' || role === 'accomplice') {
    view.framers = round.framers.map(({ id: fid }) => ({ id: fid }));
  }
  if (role === 'vandal') {
    // The Saboteur needs the question to choose who to push.
    view.question = round.question;
    view.myPushId = round.vandalPushId ?? null;
  }
  if (phase === P.ANSWERING) view.myMessages = myMessages(round, id);
  if (voting) {
    view.question = round.question;
    view.answers = answersFor(round);
    if (role === 'voter') view.myVotes = round.votes[id] ?? {};
  }
  return view;
}

function adminView(state) {
  const { round, phase } = state;
  const view = {
    settings: state.settings,
    customQuestions: state.customQuestions,
  };
  if (!round) return view;

  if (phase === P.SETUP) {
    view.setup = { question: round.question, ...round.config };
    return view;
  }
  if (ROUND_PHASES.has(phase)) {
    const known = round.assignedByAdmin;
    view.live = {
      addOns: round.config.addOns,
      framerCount: round.framers.length,
      framersReady: round.framers.filter((f) => f.ready).length,
      answersSubmitted: round.framers.filter((f) => f.answer).length,
      messageCount: round.messages.length,
      ...votesProgress(round),
      vandalGuessIn: round.vandalId ? round.framers.every((f) => round.vandalGuesses[f.id]) : null,
      saboteurChose: round.vandalId ? Boolean(round.vandalPushId) : null,
      knownRoles: {
        framers: known.framers ? round.framers.map((f) => f.id) : null,
        vandalId: known.vandal ? round.vandalId : null,
        accompliceId: known.accomplice ? round.accompliceId : null,
      },
      // The Framer screen: the question and the teasing, but never who the Framer is.
      framerScreen:
        phase === P.ROLES
          ? null
          : { question: round.question, messages: round.messages.map(({ fromId, text, at }) => ({ fromId, text, at })) },
    };
    return view;
  }
  if (round.result) {
    view.review = {
      ...revealedRound(round),
      answers: round.result.answers,
      vandal: round.result.vandal,
      accomplice: round.result.accomplice,
      recap: round.result.recap,
    };
  }
  return view;
}

// viewer = { isAdmin, playerId }
export function buildView(state, viewer) {
  const { round, phase } = state;
  const base = {
    phase,
    roundNumber: round?.number ?? state.roundNumber,
    deadline: ROUND_PHASES.has(phase) ? round?.deadline ?? null : null,
    pausedRemaining: ROUND_PHASES.has(phase) ? round?.pausedRemaining ?? null : null,
    timerTotal: ROUND_PHASES.has(phase) ? state.settings.timers[TIMER_FOR_PHASE[phase]] : null,
    players: publicPlayers(state),
    notice: state.notice,
  };
  if (viewer?.isAdmin) return { ...base, you: { isAdmin: true }, admin: adminView(state) };

  const me = state.players[viewer?.playerId];
  if (!me) return { ...base, you: null, round: null };
  const role = roleOf(state, me.id);
  return {
    ...base,
    you: { id: me.id, name: me.name, score: me.score, role },
    round: playerRoundView(state, me.id, role),
  };
}
