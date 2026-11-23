// Turns a scoreRound() result into the plain-English script the admin
// reads out loud on the Recap screen.
//
// buildRecap(result, names, points) -> { paragraphs: string[], totals: [{ id, name, delta }] }
//   result  the object returned by scoreRound()
//   names   { [playerId]: display name }
//   points  the point values used for scoring (for the numbers in the text)

import { DEFAULT_POINTS } from '../shared/protocol.js';

export function joinNames(list) {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
}

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function buildRecap(result, names = {}, points = DEFAULT_POINTS) {
  const p = { ...DEFAULT_POINTS, ...points };
  const name = (id) => names[id] ?? id;
  const names_ = (ids) => joinNames(ids.map(name));
  const { answers, vandal, accomplice } = result;
  const two = answers.length > 1;
  const framerNames = joinNames(answers.map((a) => name(a.framerId)));
  const paragraphs = [];

  // Who was who.
  const intro = answers.map(
    (a) => `${name(a.framerId)} was ${two ? 'a' : 'the'} Framer this round.`
  );
  if (vandal) {
    intro.push(
      `${name(vandal.id)} was the Vandal, secretly trying to get everyone to figure out it was ${framerNames}.`
    );
  }
  if (accomplice) {
    intro.push(`${name(accomplice.id)} was the Accomplice, trying to take the heat off ${framerNames}.`);
  }
  paragraphs.push(intro.join(' '));

  // What happened to each answer.
  for (const a of answers) {
    const framer = name(a.framerId);
    const lines = [];
    if (two) lines.push(`On ${framer}'s answer:`);

    if (a.voteCount === 0) {
      lines.push(`Nobody voted on ${framer}'s answer.`);
    } else {
      for (const [suspectId, voters] of Object.entries(a.onOthers)) {
        lines.push(
          `${names_(voters)} fell for it and voted for ${name(suspectId)}, which gives ${framer} +${p.voteOnOther}${voters.length > 1 ? ' each' : ''}.`
        );
      }
      if (a.catchers.length > 0) {
        lines.push(
          `${names_(a.catchers)} caught ${framer}: +${p.catchFramer}${a.catchers.length > 1 ? ' each' : ''}.`
        );
      } else if (a.perfect) {
        lines.push(`Nobody caught ${framer}, a Perfect Frame: +${p.perfectFrame}!`);
      }
    }
    if (a.challenged) lines.push(`The answer was challenged, so ${framer} gets no points for it.`);
    paragraphs.push(lines.join(' '));
  }

  // How the secret roles did.
  if (vandal) {
    const lines = [];
    const vandalName = name(vandal.id);
    if (vandal.catches > 0) {
      lines.push(
        `That earns ${vandalName} +${p.vandalPerCatch} for each player who caught ${two ? 'a Framer' : framerNames}.`
      );
    } else {
      lines.push(`Nobody caught ${two ? 'a Framer' : framerNames}, so ${vandalName} earns nothing as the Vandal.`);
    }
    if (vandal.reversed) {
      const catchers = joinNames(vandal.caughtBy.map(name));
      const bonus =
        vandal.bonusTo.length > 0
          ? `${joinNames(vandal.bonusTo.map(name))} ${vandal.bonusTo.length > 1 ? 'each get' : 'gets'} +${p.catchVandal}`
          : null;
      const reversal =
        vandal.earned > 0
          ? `${vandalName}'s +${vandal.earned} is reversed to ${signed(vandal.points)}`
          : `${vandalName} had nothing to lose`;
      lines.push(
        `But ${catchers} figured out ${vandalName} was the Vandal! ${bonus ? `${bonus}, and ${reversal}.` : `${reversal}.`}`
      );
    }
    paragraphs.push(lines.join(' '));
  }

  if (accomplice) {
    const accName = name(accomplice.id);
    paragraphs.push(
      `${accName} drew ${plural(accomplice.votesOnSelf, 'vote')} (+${p.accompliceVote} each), and ${plural(accomplice.votesOnFramers, 'vote')} landed on ${framerNames} (−${p.accomplicePenalty} each): ${signed(accomplice.points)} for ${accName}.`
    );
  }

  const totals = Object.entries(result.deltas)
    .filter(([, delta]) => delta !== 0)
    .map(([id, delta]) => ({ id, name: name(id), delta }))
    .sort((x, y) => y.delta - x.delta || x.name.localeCompare(y.name));

  return { paragraphs, totals };
}
