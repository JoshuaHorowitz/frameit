import { useLayoutEffect, useRef } from 'react';
import { useCountdown } from './useGame.js';

const AVATAR_COLORS = ['#6ea8fe', '#5fd39a', '#ff9f7a', '#f5c451', '#e2b8ff', '#4fd1c5', '#ffb3c7', '#b8d86b'];

export function colorFor(id = '') {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function Avatar({ id, name, big = false }) {
  return (
    <span className={`avatar${big ? ' big' : ''}`} style={{ background: colorFor(id) }} aria-hidden="true">
      {(name || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function Logo() {
  return (
    <span className="logo">
      Frame<span>It</span>
    </span>
  );
}

export function Screen({ theme, children }) {
  return <main className={`screen${theme ? ` theme-${theme}` : ''}`}>{children}</main>;
}

// Top bar: a left element (logo or chip) and the countdown when a timer runs.
export function TopBar({ left, game, showBar = true }) {
  const { view, clockOffset } = game;
  const t = useCountdown(view, clockOffset);
  const total = view?.timerTotal || 0;
  return (
    <>
      <div className="spread">
        {left ?? <Logo />}
        {t ? (
          <span className={`timer${t.paused ? ' paused' : ''}`}>{t.paused ? `Paused ${fmt(t.seconds)}` : fmt(t.seconds)}</span>
        ) : (
          <span className="chip">Round {view?.roundNumber || 1}</span>
        )}
      </div>
      {t && showBar && total > 0 && <TimerBar view={view} clockOffset={clockOffset} />}
    </>
  );
}

// The draining bar is one CSS transition from "now" to empty, run by the
// browser's compositor. That stays smooth on slow phones and in low-power
// modes, where redrawing from JavaScript every frame stutters. It restarts
// only when the deadline changes (new phase, +15 s, pause/resume).
function TimerBar({ view, clockOffset }) {
  const fill = useRef(null);
  const totalMs = (view.timerTotal || 0) * 1000;
  useLayoutEffect(() => {
    const el = fill.current;
    if (!el || !totalMs) return;
    const paused = view.pausedRemaining != null;
    const remaining = paused ? view.pausedRemaining : Math.max(0, view.deadline - (Date.now() + clockOffset));
    el.style.transition = 'none';
    el.style.transform = `scaleX(${Math.min(1, remaining / totalMs)})`;
    if (paused || remaining <= 0) return;
    el.getBoundingClientRect(); // commit the starting width before animating
    el.style.transition = `transform ${remaining}ms linear`;
    el.style.transform = 'scaleX(0)';
  }, [view.deadline, view.pausedRemaining, totalMs, clockOffset]);
  return (
    <div className="bar" aria-hidden="true">
      <div ref={fill} />
    </div>
  );
}

export const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '+0');
export const deltaClass = (n) => (n > 0 ? 'plus' : n < 0 ? 'minus' : 'zero');

export function nameOf(view, id) {
  return view?.players?.find((p) => p.id === id)?.name ?? id ?? 'Someone';
}

// A grid of player buttons; `selected` is the chosen id.
export function PlayerGrid({ players, selected, onPick, purple = false, disabled = false }) {
  return (
    <div className="grid2">
      {players.map((p) => {
        const on = p.id === selected;
        return (
          <button
            key={p.id}
            type="button"
            className={`pick${on ? (purple ? ' on-purple' : ' on') : ''}`}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onPick(p.id)}
          >
            {on ? '✓ ' : ''}
            {p.name}
          </button>
        );
      })}
    </div>
  );
}

export function Scoreboard({ view, deltas = {}, highlightId }) {
  const players = [...view.players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return (
    <div className="stack" style={{ gap: 8 }}>
      {players.map((p, i) => {
        const d = deltas[p.id] ?? 0;
        return (
          <div key={p.id} className={`list-row${i === 0 ? ' lead' : ''}${p.id === highlightId ? ' me' : ''}`}>
            <span className="small" style={{ width: 20 }}>{i + 1}</span>
            <span style={{ fontWeight: p.id === highlightId ? 700 : 500 }}>
              {p.name}
              {p.id === highlightId ? ' (you)' : ''}
            </span>
            <span className={`delta ${deltaClass(d)}`} style={{ marginLeft: 'auto' }}>{signed(d)}</span>
            <span className="score" style={{ marginLeft: 0 }}>{p.score}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Waiting({ game, title, body }) {
  return (
    <Screen>
      <TopBar game={game} />
      <div className="stack center" style={{ marginTop: '30vh' }}>
        <h1 className="h2">{title}</h1>
        {body && <p className="body">{body}</p>}
      </div>
    </Screen>
  );
}
