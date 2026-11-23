// Pure scoring for one FrameIt round. No I/O, no clock, no randomness:
// the same round always scores the same way, so it is easy to test.
//
// round = {
//   framers: [{ id, targetId }],                  // one, or two in a Two-Framer round
//   vandalId: string | null,
//   accompliceId: string | null,
//   votes: { [voterId]: { [answerIndex]: suspectId } },
//   vandalGuesses: { [framerId]: suspectId },
//   challenged: number[],                          // answer indexes the admin challenged
// }
//
// Returns { deltas, answers, vandal, accomplice }:
//   deltas      per-player point change for the round ({ [playerId]: number })
//   answers     one event object per answer, for the recap
//   vandal      Vandal event object, or null
//   accomplice  Accomplice event object, or null

import { DEFAULT_POINTS } from '../shared/protocol.js';

export function scoreRound(round, points = DEFAULT_POINTS, playerIds = []) {
  const p = { ...DEFAULT_POINTS, ...points };
  const framers = round.framers ?? [];
  const votes = round.votes ?? {};
  const guesses = round.vandalGuesses ?? {};
  const challenged = new Set(round.challenged ?? []);
  const framerIds = new Set(framers.map((f) => f.id));

  const deltas = {};
  for (const id of playerIds) deltas[id] = 0;
  const add = (id, n) => {
    if (!id) return;
    deltas[id] = (deltas[id] ?? 0) + n;
  };

  // Every ballot cast, across all answers: { voterId, answerIndex, suspectId }.
  const ballots = [];
  for (const [voterId, byAnswer] of Object.entries(votes)) {
    for (const [index, suspectId] of Object.entries(byAnswer ?? {})) {
      if (suspectId) ballots.push({ voterId, answerIndex: Number(index), suspectId });
    }
  }

  const answers = framers.map((framer, answerIndex) => {
    const cast = ballots.filter((b) => b.answerIndex === answerIndex);
    const catchers = cast.filter((b) => b.suspectId === framer.id).map((b) => b.voterId);
    const onTarget = cast.filter((b) => b.suspectId === framer.targetId).map((b) => b.voterId);

    const onOthers = {}; // suspectId -> voterIds
    for (const b of cast) {
      if (b.suspectId === framer.id || b.suspectId === framer.targetId) continue;
      (onOthers[b.suspectId] ??= []).push(b.voterId);
    }
    const otherCount = Object.values(onOthers).reduce((n, list) => n + list.length, 0);

    for (const voterId of catchers) add(voterId, p.catchFramer);

    const perfect = cast.length > 0 && catchers.length === 0;
    const isChallenged = challenged.has(answerIndex);
    const framerPoints = isChallenged
      ? 0
      : onTarget.length * p.voteOnTarget + otherCount * p.voteOnOther + (perfect ? p.perfectFrame : 0);
    add(framer.id, framerPoints);

    return {
      answerIndex,
      framerId: framer.id,
      targetId: framer.targetId,
      voteCount: cast.length,
      onTarget,
      onOthers,
      catchers,
      perfect,
      challenged: isChallenged,
      framerPoints,
    };
  });

  let vandal = null;
  if (round.vandalId) {
    const catches = answers.reduce((n, a) => n + a.catchers.length, 0);
    const earned = catches * p.vandalPerCatch;
    const caughtBy = framers.filter((f) => guesses[f.id] === round.vandalId).map((f) => f.id);
    const reversed = caughtBy.length > 0;
    // Reversal happens once, however many Framers caught the Vandal.
    // (Avoid -0, which is a different value from 0 to strict equality.)
    const vandalPoints = reversed && earned !== 0 ? -earned : earned;
    add(round.vandalId, vandalPoints);

    // Each Framer who caught the Vandal gets the bonus, unless their answer was challenged.
    const bonusTo = [];
    framers.forEach((f, i) => {
      if (caughtBy.includes(f.id) && !challenged.has(i)) {
        add(f.id, p.catchVandal);
        bonusTo.push(f.id);
      }
    });

    vandal = { id: round.vandalId, catches, earned, reversed, caughtBy, bonusTo, points: vandalPoints };
  }

  let accomplice = null;
  if (round.accompliceId) {
    const votesOnSelf = ballots.filter((b) => b.suspectId === round.accompliceId).length;
    const votesOnFramers = ballots.filter((b) => framerIds.has(b.suspectId)).length;
    const accPoints = votesOnSelf * p.accompliceVote - votesOnFramers * p.accomplicePenalty;
    add(round.accompliceId, accPoints);
    accomplice = { id: round.accompliceId, votesOnSelf, votesOnFramers, points: accPoints };
  }

  return { deltas, answers, vandal, accomplice };
}
