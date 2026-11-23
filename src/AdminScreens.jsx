import { useState } from 'react';
import { Screen, TopBar, nameOf, signed, deltaClass } from './ui.jsx';

const AdminChip = () => <span className="chip admin">ADMIN</span>;

function Header({ game, title, right }) {
  return (
    <div className="spread">
      <h1 className="h2" style={{ fontSize: 28 }}>{title}</h1>
      {right ?? <AdminChip />}
    </div>
  );
}

const ADD_ONS = [
  ['vandal', 'Vandal'],
  ['accomplice', 'Accomplice'],
  ['twoFramers', 'Two Framers'],
];

// ---------- Lobby ----------

export function AdminLobby({ game, openSettings }) {
  const { view, send } = game;
  return (
    <Screen>
      <Header game={game} title="Lobby" />
      <p className="small">{view.players.length} players</p>
      <PlayerAdminList game={game} />
      <div className="stack push-down">
        <button className="btn secondary" onClick={openSettings}>Questions &amp; settings</button>
        <button className="btn" onClick={() => send('startGame')}>Start game</button>
      </div>
    </Screen>
  );
}

function PlayerAdminList({ game }) {
  const { view, send } = game;
  return (
    <div className="stack" style={{ gap: 6 }}>
      {view.players.map((p) => (
        <div key={p.id} className="list-row">
          <span className={`dot${p.connected ? '' : ' off'}`} />
          {p.name}
          {!p.connected && <span className="small">offline</span>}
          {p.waiting && <span className="small">next round</span>}
          <button
            className="icon-btn"
            style={{ marginLeft: 'auto' }}
            aria-label={`Kick ${p.name}`}
            onClick={() => window.confirm(`Remove ${p.name} from the game?`) && send('kick', { playerId: p.id })}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// ---------- Setup ----------

export function AdminSetup({ game, openSettings }) {
  const { view, send } = game;
  const setup = view.admin.setup;
  const { addOns, roles } = setup;
  const active = view.players.filter((p) => !p.waiting);
  const roleCount = (addOns.twoFramers ? 2 : 1) + (addOns.vandal ? 1 : 0) + (addOns.accomplice ? 1 : 0);
  const voters = active.length - roleCount;

  const setRole = (patch) => send('configureRound', { roles: patch });
  const roleSelect = (label, value, onChange) => (
    <label className="list-row" style={{ paddingRight: 8 }}>
      {label}
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        style={{ marginLeft: 'auto', background: 'var(--surface-2)', color: 'var(--gold)', border: 0, borderRadius: 8, padding: '8px 10px', fontWeight: 600 }}
      >
        <option value="">Random</option>
        {active.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </label>
  );

  return (
    <Screen>
      <Header game={game} title={`Round ${view.roundNumber} setup`} />
      {view.notice && <p className="warn" style={{ background: 'var(--surface-2)' }}>{view.notice.message}</p>}
      <div className="stack">
        <h2 className="label">Additional player types</h2>
        <div className="grid3">
          {ADD_ONS.map(([key, label]) => (
            <button
              key={key}
              className={`pick${addOns[key] ? ' on-purple' : ''}`}
              style={{ fontSize: 14 }}
              aria-pressed={addOns[key]}
              onClick={() => send('configureRound', { addOns: { [key]: !addOns[key] } })}
            >
              {addOns[key] ? '✓ ' : ''}
              {label}
            </button>
          ))}
        </div>
        <p className="small">Tap to add or remove. Nothing selected = a standard round.</p>
        <button className="btn secondary small" onClick={() => send('randomizeAddOns')}>🎲 Randomize player types</button>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <h2 className="label">Roles · tap to assign</h2>
        {roleSelect(addOns.twoFramers ? 'Framer 1' : 'Framer', roles.framers[0], (id) => setRole({ framers: [id, roles.framers[1]] }))}
        {addOns.twoFramers && roleSelect('Framer 2', roles.framers[1], (id) => setRole({ framers: [roles.framers[0], id] }))}
        {addOns.vandal && roleSelect('Vandal', roles.vandal, (id) => setRole({ vandal: id }))}
        {addOns.accomplice && roleSelect('Accomplice', roles.accomplice, (id) => setRole({ accomplice: id }))}
        <p className="small">Random roles stay hidden from you so you can play along.</p>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <h2 className="label">Question</h2>
        <div className="list-row" style={{ padding: '12px 6px 12px 14px' }}>
          <span style={{ flex: 1, fontWeight: 600, fontSize: 17, lineHeight: 1.35 }}>{setup.question}</span>
          <button className="icon-btn" aria-label="New question" onClick={() => send('rerollQuestion')}>↻</button>
        </div>
      </div>
      <div className="stack push-down">
        {voters < 1 && <p className="small center" style={{ color: 'var(--red-soft)' }}>Not enough players: nobody would be left to vote.</p>}
        <button className="btn" disabled={voters < 1} onClick={() => send('startRound')}>Start round</button>
        <div className="grid2">
          <button className="btn secondary small" onClick={openSettings}>Settings</button>
          <button className="btn secondary small" onClick={() => window.confirm('End the game and show final scores?') && send('endGame')}>End game</button>
        </div>
      </div>
    </Screen>
  );
}

// ---------- Live round ----------

const PHASE_STEPS = [
  ['roles', 'Roles'],
  ['answering', 'Answering'],
  ['voting', 'Voting'],
];

export function AdminLive({ game, openFramerScreen }) {
  const { view, send } = game;
  const live = view.admin.live;
  const types = ADD_ONS.filter(([k]) => live.addOns[k]).map(([, l]) => l);
  const stepIndex = PHASE_STEPS.findIndex(([p]) => p === view.phase);
  const paused = view.pausedRemaining != null;
  const known = live.knownRoles;
  const n = (id) => nameOf(view, id);

  return (
    <Screen>
      <TopBar game={game} left={<span className="chip purple">Round {view.roundNumber} · {types.join(' + ') || 'Standard'}</span>} />
      <div className="grid3" style={{ gap: 6 }}>
        {PHASE_STEPS.map(([p, label], i) => (
          <span key={p} className="center small" style={{ fontWeight: 600, color: i < stepIndex ? 'var(--green)' : i === stepIndex ? 'var(--gold)' : 'var(--muted)' }}>
            {i < stepIndex ? '✓ ' : ''}
            {label}
          </span>
        ))}
      </div>
      {(known.framers || known.vandalId || known.accompliceId) && (
        <p className="small">
          You assigned: {known.framers ? `Framer ${known.framers.map(n).join(' & ')}` : ''}
          {known.vandalId ? ` · Vandal ${n(known.vandalId)}` : ''}
          {known.accompliceId ? ` · Accomplice ${n(known.accompliceId)}` : ''}
        </p>
      )}
      <div className="stack" style={{ gap: 8 }}>
        <div className="status-row">{live.targetsPicked === live.framerCount ? '✅' : '⏳'} Targets picked: {live.targetsPicked} of {live.framerCount}</div>
        <div className="status-row">{live.answersSubmitted === live.framerCount ? '✅' : '⏳'} Answers submitted: {live.answersSubmitted} of {live.framerCount}</div>
        {view.phase === 'voting' && <div className="status-row">🗳️ Votes in: {live.votesIn} of {live.votesExpected}</div>}
        {view.phase === 'voting' && live.vandalGuessIn !== null && (
          <div className="status-row">{live.vandalGuessIn ? '✅' : '⏳'} Vandal guess {live.vandalGuessIn ? 'in' : 'pending'}</div>
        )}
        {live.framerScreen && (
          <button className="status-row" style={{ border: '2px solid var(--border-strong)', textAlign: 'left' }} onClick={openFramerScreen}>
            💬 See Framer screen ({live.messageCount} messages)<span style={{ marginLeft: 'auto' }}>›</span>
          </button>
        )}
      </div>
      <p className="small center">Contents stay hidden until Review.</p>
      <div className="grid2 push-down">
        <button className="btn secondary" onClick={() => send('addTime', { seconds: 15 })}>+15 seconds</button>
        <button className="btn secondary" onClick={() => send(paused ? 'resume' : 'pause')}>{paused ? 'Resume' : 'Pause'}</button>
        <button className="btn danger" style={{ gridColumn: 'span 2' }} onClick={() => window.confirm('Cancel this round? Nobody gets points.') && send('cancelRound')}>
          Cancel round
        </button>
      </div>
    </Screen>
  );
}

export function AdminFramerScreen({ game, back }) {
  const { view } = game;
  const fs = view.admin.live?.framerScreen;
  return (
    <Screen>
      <TopBar game={game} left={<button className="btn secondary small" style={{ width: 'auto' }} onClick={back}>‹ Live round</button>} />
      <div className="stack">
        <h1 className="h2" style={{ fontSize: 28 }}>Framer&apos;s screen</h1>
        <p className="small">What the Framer sees, minus their typing. Who they are stays hidden.</p>
      </div>
      {fs ? (
        <>
          <div className="card">
            <span className="label">The question</span>
            <span className="h2" style={{ fontSize: 22 }}>{fs.question}</span>
          </div>
          <h2 className="small" style={{ fontWeight: 600 }}>Messages to the Framer · {fs.messages.length}</h2>
          <div className="feed">
            {fs.messages.map((m, i) => (
              <div key={i} className="bubble">
                <div className="from" style={{ color: 'var(--blue)' }}>{nameOf(view, m.fromId)}</div>
                <div>{m.text}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="body">The Framer hasn&apos;t started answering yet.</p>
      )}
    </Screen>
  );
}

// ---------- Review ----------

export function AdminReview({ game }) {
  const { view, send } = game;
  const rv = view.admin.review;
  const n = (id) => nameOf(view, id);
  const deltas = Object.entries(rv.deltas).filter(([, d]) => d !== 0).sort((a, b) => b[1] - a[1]);
  return (
    <Screen>
      <Header game={game} title="Review" />
      {rv.answers.map((a, i) => {
        const f = rv.framers[i];
        const byOthers = Object.entries(a.onOthers);
        return (
          <div key={i} className="stack" style={{ gap: 10 }}>
            <div className="card">
              <span className="small">{rv.question}</span>
              <p className="answer" style={{ fontSize: 24 }}>“{f.answer}”</p>
              <span style={{ fontSize: 15 }}>
                <b>{n(f.id)}</b> framed <b style={{ color: 'var(--blue)' }}>{n(f.targetId)}</b>
                {a.challenged && <b style={{ color: 'var(--red-soft)' }}> · challenged</b>}
              </span>
            </div>
            <div className="stack" style={{ gap: 4 }}>
              <h2 className="label">Votes</h2>
              {a.onTarget.length > 0 && <VoteLine label={`${n(f.targetId)} (target)`} voters={a.onTarget.map(n)} />}
              {a.catchers.length > 0 && <VoteLine label={`${n(f.id)} (caught)`} voters={a.catchers.map(n)} />}
              {byOthers.map(([id, voters]) => <VoteLine key={id} label={n(id)} voters={voters.map(n)} />)}
              {a.voteCount === 0 && <p className="small">No votes.</p>}
            </div>
            <button
              className={`btn ${a.challenged ? 'secondary' : 'danger'} small`}
              onClick={() => send(a.challenged ? 'unchallenge' : 'challenge', { answerIndex: i })}
            >
              {a.challenged ? 'Undo challenge' : `Challenge answer (${n(f.id)} gets 0)`}
            </button>
          </div>
        );
      })}
      {rv.vandal && (
        <p className="body">
          Vandal <b style={{ color: 'var(--purple)' }}>{n(rv.vandal.id)}</b>{rv.vandal.reversed ? ' (caught)' : ''}
        </p>
      )}
      {rv.accomplice && <p className="body">Accomplice <b style={{ color: 'var(--orange)' }}>{n(rv.accomplice.id)}</b></p>}
      <div className="stack" style={{ gap: 4 }}>
        <h2 className="label">Points preview</h2>
        {deltas.map(([id, d]) => (
          <div key={id} className="spread" style={{ padding: '6px 0', borderBottom: '1px solid var(--surface-2)' }}>
            <span>{n(id)}</span>
            <b className={deltaClass(d)}>{signed(d)}</b>
          </div>
        ))}
        {deltas.length === 0 && <p className="small">Nobody scores this round.</p>}
      </div>
      <button className="btn push-down" onClick={() => send('reveal')}>Reveal to players</button>
    </Screen>
  );
}

function VoteLine({ label, voters }) {
  return (
    <div className="spread" style={{ fontSize: 15, padding: '6px 0', borderBottom: '1px solid var(--surface-2)' }}>
      <span>{label}</span>
      <span style={{ color: 'var(--text-soft)', textAlign: 'right' }}>{voters.join(', ')}</span>
    </div>
  );
}

// ---------- Recap ----------

export function AdminRecap({ game }) {
  const { view, send } = game;
  const recap = view.admin.review.recap;
  return (
    <Screen>
      <Header game={game} title={`Round ${view.roundNumber} recap`} />
      <p className="small">Read this out loud while everyone sees the reveal.</p>
      <div className="card" style={{ gap: 14 }}>
        {recap.paragraphs.map((p, i) => (
          <p key={i} style={{ fontSize: 17, lineHeight: 1.5 }}>{p}</p>
        ))}
      </div>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
        {recap.totals.map((t) => (
          <span key={t.id} className={`chip ${deltaClass(t.delta)}`} style={{ fontSize: 15, fontWeight: 700, background: 'var(--surface)' }}>
            {t.name} {signed(t.delta)}
          </span>
        ))}
      </div>
      <button className="btn push-down" onClick={() => send('showScoreboard')}>Show scoreboard</button>
    </Screen>
  );
}

// ---------- Scoreboard ----------

export function AdminScoreboard({ game, final = false }) {
  const { view, send } = game;
  return (
    <Screen>
      <Header game={game} title={final ? 'Final scores' : 'Scoreboard'} />
      <p className="small">{final ? 'Thanks for playing!' : `After round ${view.roundNumber} · tap − / + to adjust a score`}</p>
      <div className="stack" style={{ gap: 6 }}>
        {view.players.map((p, i) => (
          <div key={p.id} className={`list-row${i === 0 ? ' lead' : ''}`} style={{ gap: 8 }}>
            <span className="small" style={{ width: 18 }}>{i + 1}</span>
            {p.name}
            {!final && <button className="icon-btn filled" style={{ marginLeft: 'auto' }} aria-label={`Lower ${p.name}'s score`} onClick={() => send('adjustScore', { playerId: p.id, delta: -1 })}>−</button>}
            <span className="score" style={final ? undefined : { marginLeft: 0, textAlign: 'center' }}>{p.score}</span>
            {!final && <button className="icon-btn filled" aria-label={`Raise ${p.name}'s score`} onClick={() => send('adjustScore', { playerId: p.id, delta: 1 })}>+</button>}
          </div>
        ))}
      </div>
      {!final && (
        <div className="stack push-down">
          <button className="btn secondary" onClick={() => window.confirm('End the game and show final scores?') && send('endGame')}>
            End game &amp; show final scores
          </button>
          <button className="btn" onClick={() => send('nextRound')}>Next round</button>
        </div>
      )}
    </Screen>
  );
}

// ---------- Settings & questions ----------

export function AdminSettings({ game, back }) {
  const { view, send } = game;
  const { settings, customQuestions } = view.admin;
  const [question, setQuestion] = useState('');
  const num = (label, value, onSet, step = 1) => (
    <label className="spread" style={{ minHeight: 44 }}>
      <span>{label}</span>
      <input
        className="num-input"
        type="number"
        inputMode="decimal"
        min="0"
        step={step}
        defaultValue={value}
        onBlur={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v !== value) onSet(v);
        }}
      />
    </label>
  );
  const set = (patch) => send('updateSettings', { settings: patch });
  const P = settings.points;
  return (
    <Screen>
      <div className="spread">
        <button className="btn secondary small" style={{ width: 'auto' }} onClick={back}>‹ Back</button>
        <AdminChip />
      </div>
      <h1 className="h2">Questions</h1>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (question.trim()) send('addQuestion', { text: question });
          setQuestion('');
        }}
      >
        <input className="input" placeholder="Add a question…" value={question} maxLength={200} onChange={(e) => setQuestion(e.target.value)} />
        <button className="btn" style={{ width: 'auto' }} type="submit">Add</button>
      </form>
      {customQuestions.length > 0 && (
        <details>
          <summary>{customQuestions.length} custom questions</summary>
          <ul className="small">{customQuestions.map((q) => <li key={q}>{q}</li>)}</ul>
        </details>
      )}
      <h1 className="h2">Timers (seconds)</h1>
      <div className="card" style={{ gap: 4 }}>
        {num('Pick a target', settings.timers.pickTarget, (v) => set({ timers: { pickTarget: v } }))}
        {num('Answering', settings.timers.answering, (v) => set({ timers: { answering: v } }))}
        {num('Discuss & vote', settings.timers.voting, (v) => set({ timers: { voting: v } }))}
      </div>
      <h1 className="h2">Points</h1>
      <div className="card" style={{ gap: 4 }}>
        {num('Catching the Framer', P.catchFramer, (v) => set({ points: { catchFramer: v } }))}
        {num('Framer: vote on target', P.voteOnTarget, (v) => set({ points: { voteOnTarget: v } }))}
        {num('Framer: vote on anyone else', P.voteOnOther, (v) => set({ points: { voteOnOther: v } }))}
        {num('Perfect Frame bonus', P.perfectFrame, (v) => set({ points: { perfectFrame: v } }))}
        {num('Vandal: per catch', P.vandalPerCatch, (v) => set({ points: { vandalPerCatch: v } }))}
        {num('Framer catches Vandal', P.catchVandal, (v) => set({ points: { catchVandal: v } }))}
        {num('Accomplice: per vote on them', P.accompliceVote, (v) => set({ points: { accompliceVote: v } }))}
        {num('Accomplice: penalty per Framer vote', P.accomplicePenalty, (v) => set({ points: { accomplicePenalty: v } }))}
      </div>
      <h1 className="h2">Randomize chances (0–1)</h1>
      <div className="card" style={{ gap: 4 }}>
        {num('Vandal', settings.randomChances.vandal, (v) => set({ randomChances: { vandal: Math.min(1, v) } }), 0.05)}
        {num('Accomplice', settings.randomChances.accomplice, (v) => set({ randomChances: { accomplice: Math.min(1, v) } }), 0.05)}
        {num('Two Framers', settings.randomChances.twoFramers, (v) => set({ randomChances: { twoFramers: Math.min(1, v) } }), 0.05)}
      </div>
      <h1 className="h2">Players</h1>
      <PlayerAdminList game={game} />
    </Screen>
  );
}
