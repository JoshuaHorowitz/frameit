import { useState } from 'react';
import { Screen, TopBar, PlayerGrid, Waiting, Avatar, nameOf, signed, deltaClass } from './ui.jsx';
import { StandingsScreen } from './PlayerScreens.jsx';
import { GameOverButtons } from './AdminScreens.jsx';

// ============ Players ============

function FirstHint({ view }) {
  const first = view.round?.firstId;
  if (!first) return null;
  return (
    <p className="body center">
      First hint: <b style={{ color: 'var(--text)' }}>{first === view.you.id ? 'you!' : nameOf(view, first)}</b>, then go around the circle.
    </p>
  );
}

function PromptScreen({ game }) {
  const { view } = game;
  return (
    <Screen>
      <TopBar game={game} />
      <div className="card center" style={{ marginTop: '8vh', alignItems: 'center', padding: '28px 18px' }}>
        <span className="label">The prompt is</span>
        <h1 className="h1" style={{ fontSize: 40, color: 'var(--gold)', overflowWrap: 'anywhere' }}>{view.round.prompt}</h1>
      </div>
      <p className="body center">
        When it&apos;s your turn, say a <b style={{ color: 'var(--text)' }}>one- or two-word hint</b> out loud. Don&apos;t make it too obvious:
        the Faker is listening!
      </p>
      <FirstHint view={view} />
    </Screen>
  );
}

function FakerScreen({ game }) {
  const { view } = game;
  return (
    <Screen theme="vandal">
      <TopBar game={game} />
      <div className="card center" style={{ marginTop: '8vh', alignItems: 'center', padding: '28px 18px', background: 'var(--danger)' }}>
        <span className="label" style={{ color: '#fff' }}>Shh…</span>
        <h1 className="h1" style={{ fontSize: 40, color: '#fff' }}>You&apos;re the Faker!</h1>
      </div>
      <p className="body center">
        Everyone was given the same prompt <b style={{ color: 'var(--text)' }}>except you</b>. Figure out what the prompt is so you
        don&apos;t make yourself too obvious when it&apos;s your turn.
      </p>
      <p className="body center">
        For every player that doesn&apos;t choose you during the voting, you get{' '}
        <b style={{ color: 'var(--gold)' }}>+{view.round.fakerPoints ?? 2} points</b>!
      </p>
      <FirstHint view={view} />
    </Screen>
  );
}

// The Faker doesn't vote; they watch the votes come in.
function FakerVotingScreen({ game }) {
  const { view } = game;
  const r = view.round;
  return (
    <Screen theme="vandal">
      <TopBar game={game} left={<span className="chip">Vote</span>} />
      <div className="stack center" style={{ marginTop: '18vh' }}>
        <h1 className="h1">Everyone&apos;s voting…</h1>
        <p className="body">
          You don&apos;t vote this round. Keep a straight face: +{r.fakerPoints ?? 2} for every player who doesn&apos;t choose you!
        </p>
      </div>
      <p className="small center push-down">{r.votesIn} of {r.votesExpected} votes in</p>
    </Screen>
  );
}

function VoteScreen({ game }) {
  const { view, send } = game;
  const r = view.round;
  const others = view.players.filter((p) => p.id !== view.you.id && !p.waiting);
  return (
    <Screen>
      <TopBar game={game} left={<span className="chip">Vote</span>} />
      <h1 className="h1" style={{ marginTop: 8 }}>Who&apos;s the Faker?</h1>
      <PlayerGrid players={others} selected={r.myVote} onPick={(id) => send('castVote', { suspectId: id })} />
      <div className="push-down stack">
        <p className="small center">You can change your vote until the admin reveals.</p>
        <p className="small center">{r.votesIn} of {r.votesExpected} votes in</p>
      </div>
    </Screen>
  );
}

function RevealScreen({ game }) {
  const { view } = game;
  const r = view.round;
  const me = view.you.id;
  const n = (id) => nameOf(view, id);
  const myDelta = r.deltas?.[me] ?? 0;
  const iAmFaker = r.fakerId === me;
  const fooled = Object.values(r.votes).filter((v) => v !== r.fakerId).length;
  const myVote = r.votes[me];
  let headline;
  if (iAmFaker) headline = fooled === 0 ? 'They found you!' : `You fooled ${fooled} ${fooled === 1 ? 'person' : 'people'}!`;
  else if (!myVote) headline = "You didn't vote.";
  else headline = myVote === r.fakerId ? 'You found the Faker!' : `Not quite. You voted for ${n(myVote)}.`;
  return (
    <Screen>
      <TopBar game={game} />
      <div className="stack center" style={{ marginTop: 8 }}>
        <h1 className="h1" style={{ fontSize: 34 }}>{headline}</h1>
      </div>
      <div className="card" style={{ alignItems: 'center', textAlign: 'center' }}>
        <span className="small" style={{ fontWeight: 600 }}>The Faker was</span>
        <Avatar id={r.fakerId} name={n(r.fakerId)} big />
        <span className="h2" style={{ fontSize: 30 }}>{n(r.fakerId)}</span>
        <span className="body">
          The prompt was <b style={{ color: 'var(--gold)' }}>{r.prompt}</b>
        </span>
      </div>
      <div className="spread" style={{ padding: '0 4px' }}>
        <span className="body">Your points this round</span>
        <span className={`h2 ${deltaClass(myDelta)}`} style={{ fontSize: 28 }}>{signed(myDelta)}</span>
      </div>
      <p className="small center push-down">Scores coming up…</p>
    </Screen>
  );
}

export function FomoPlayerApp({ game }) {
  const { view } = game;
  const role = view.you.role;
  switch (view.phase) {
    case 'setup':
      return <StandingsScreen game={game} title="FOMO" subtitle="The next round is being set up." />;
    case 'hints':
      if (role === 'faker') return <FakerScreen game={game} />;
      if (role === 'player') return <PromptScreen game={game} />;
      return <Waiting game={game} title="You'll join next round!" body="Listen in and see if you can spot the Faker." />;
    case 'voting':
      if (role === 'faker') return <FakerVotingScreen game={game} />;
      if (role === 'player') return <VoteScreen game={game} />;
      return <Waiting game={game} title="You'll join next round!" />;
    case 'reveal':
      return view.round?.revealed ? <RevealScreen game={game} /> : <Waiting game={game} title="Revealing…" />;
    case 'scoreboard':
      return <StandingsScreen game={game} title="Scores" deltas={view.round?.deltas} />;
    case 'final':
      return <StandingsScreen game={game} title="Final scores" subtitle="Thanks for playing FOMO!" deltas={{}} />;
    default:
      return <Waiting game={game} title="Loading…" />;
  }
}

// ============ Admin ============

const AdminChip = () => <span className="chip admin">ADMIN</span>;

function Header({ title }) {
  return (
    <div className="spread">
      <h1 className="h2" style={{ fontSize: 26 }}>{title}</h1>
      <AdminChip />
    </div>
  );
}

function AdminSetup({ game, openSettings }) {
  const { view, send } = game;
  const setup = view.admin.setup;
  const [text, setText] = useState('');
  const active = view.players.filter((p) => !p.waiting);
  const q = text.trim().toLowerCase();
  const matches = q ? setup.prompts.filter((p) => p.toLowerCase().includes(q)).slice(0, 6) : [];
  const exact = setup.prompts.some((p) => p.toLowerCase() === q);
  const use = (prompt) => {
    send('setPrompt', { text: prompt });
    setText('');
  };
  return (
    <Screen>
      <Header title={`FOMO · Round ${view.roundNumber}`} />
      {view.notice && <p className="warn" style={{ background: 'var(--surface-2)' }}>{view.notice.message}</p>}
      <div className="stack" style={{ gap: 8 }}>
        <h2 className="label">Prompt</h2>
        <div className="list-row" style={{ padding: '12px 6px 12px 14px' }}>
          <span style={{ flex: 1, fontWeight: 700, fontSize: 20 }}>
            {setup.prompt}
            {setup.customPrompt && <span className="chip gold" style={{ marginLeft: 8, padding: '2px 8px', fontSize: 11 }}>Typed</span>}
          </span>
          <button className="icon-btn" aria-label="Random prompt" onClick={() => send('setPrompt', { random: true })}>🎲</button>
        </div>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) use(matches[0] && exact ? matches[0] : text);
          }}
        >
          <input
            className="input"
            style={{ fontSize: 16, padding: '12px 14px' }}
            placeholder="Search or type your own prompt…"
            value={text}
            maxLength={80}
            onChange={(e) => setText(e.target.value)}
          />
        </form>
        {matches.map((p) => (
          <button key={p} className="list-row" style={{ border: 0, textAlign: 'left', minHeight: 44 }} onClick={() => use(p)}>
            {p}
          </button>
        ))}
        {q && !exact && (
          <button className="btn secondary small" onClick={() => use(text)}>
            Use “{text.trim()}”
          </button>
        )}
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <h2 className="label">Faker</h2>
        <label className="list-row" style={{ paddingRight: 8 }}>
          Faker
          <select
            value={setup.fakerChoice ?? ''}
            onChange={(e) => send('setFaker', { playerId: e.target.value || null })}
            style={{ marginLeft: 'auto', background: 'var(--surface-2)', color: 'var(--gold)', border: 0, borderRadius: 8, padding: '8px 10px', fontWeight: 600 }}
          >
            <option value="">Random</option>
            {active.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <p className="small">A random Faker stays hidden from you so you can play along.</p>
      </div>
      <div className="stack push-down">
        {active.length < 3 && <p className="small center" style={{ color: 'var(--red-soft)' }}>FOMO needs at least 3 players.</p>}
        <button className="btn" disabled={active.length < 3} onClick={() => send('startRound')}>Start round</button>
        <div className="grid2">
          <button className="btn secondary small" onClick={openSettings}>Settings</button>
          <button className="btn secondary small" onClick={() => window.confirm('End FOMO and show final scores?') && send('endGame')}>End game</button>
        </div>
      </div>
    </Screen>
  );
}

function AdminLive({ game }) {
  const { view, send } = game;
  const live = view.admin.live;
  const voting = view.phase === 'voting';
  return (
    <Screen>
      <Header title={voting ? 'Voting' : 'Hints going around'} />
      <div className="card center" style={{ alignItems: 'center' }}>
        <span className="label">The prompt</span>
        <span className="h1" style={{ fontSize: 32, color: 'var(--gold)' }}>{live.prompt}</span>
      </div>
      {!voting && <p className="body">First hint: <b style={{ color: 'var(--text)' }}>{nameOf(view, live.firstId)}</b>, then around the circle as many times as you like.</p>}
      {live.knownFakerId && <p className="small">You assigned the Faker: {nameOf(view, live.knownFakerId)}</p>}
      {voting && <div className="status-row">🗳️ Votes in: {live.votesIn} of {live.votesExpected}</div>}
      <div className="stack push-down">
        {voting ? (
          <button className="btn" onClick={() => send('reveal')}>End voting &amp; reveal</button>
        ) : (
          <button className="btn" onClick={() => send('startVoting')}>Start voting</button>
        )}
        <button className="btn danger" onClick={() => window.confirm('Cancel this round? Nobody gets points.') && send('cancelRound')}>
          Cancel round
        </button>
      </div>
    </Screen>
  );
}

function AdminReveal({ game }) {
  const { view, send } = game;
  const rv = view.admin.review;
  const n = (id) => nameOf(view, id);
  const deltas = Object.entries(rv.deltas).filter(([, d]) => d !== 0).sort((a, b) => b[1] - a[1]);
  return (
    <Screen>
      <Header title={`Round ${view.roundNumber} results`} />
      <div className="card">
        <span className="body">
          The Faker was <b style={{ color: 'var(--purple)' }}>{n(rv.fakerId)}</b>. The prompt was <b style={{ color: 'var(--gold)' }}>{rv.prompt}</b>.
        </span>
        <span className="body">
          {rv.right.length > 0 ? `${rv.right.map(n).join(', ')} found the Faker.` : 'Nobody found the Faker!'}{' '}
          {rv.fooled > 0 ? `${n(rv.fakerId)} fooled ${rv.fooled}.` : ''}
        </span>
      </div>
      <div className="stack" style={{ gap: 4 }}>
        <h2 className="label">Votes</h2>
        {Object.entries(rv.votes).map(([voter, suspect]) => (
          <div key={voter} className="spread" style={{ padding: '6px 0', borderBottom: '1px solid var(--surface-2)' }}>
            <span>{n(voter)}</span>
            <span style={{ color: suspect === rv.fakerId ? 'var(--green)' : 'var(--text-soft)' }}>{n(suspect)}</span>
          </div>
        ))}
        {Object.keys(rv.votes).length === 0 && <p className="small">No votes.</p>}
      </div>
      <div className="stack" style={{ gap: 4 }}>
        <h2 className="label">Points</h2>
        {deltas.map(([id, d]) => (
          <div key={id} className="spread" style={{ padding: '6px 0', borderBottom: '1px solid var(--surface-2)' }}>
            <span>{n(id)}</span>
            <b className={deltaClass(d)}>{signed(d)}</b>
          </div>
        ))}
      </div>
      <button className="btn push-down" onClick={() => send('showScoreboard')}>Show scoreboard</button>
    </Screen>
  );
}

function AdminScores({ game, final = false }) {
  const { view, send } = game;
  return (
    <Screen>
      <Header title={final ? 'Final scores' : 'Scoreboard'} />
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
      <div className="stack push-down">
        {final ? (
          <GameOverButtons send={send} />
        ) : (
          <>
            <button className="btn secondary" onClick={() => window.confirm('End FOMO and show final scores?') && send('endGame')}>
              End game &amp; show final scores
            </button>
            <button className="btn" onClick={() => send('nextRound')}>Next round</button>
          </>
        )}
      </div>
    </Screen>
  );
}

function AdminSettings({ game, back }) {
  const { view, send } = game;
  const P = view.admin.settings.points;
  const num = (label, value, key) => (
    <label className="spread" style={{ minHeight: 44 }}>
      <span>{label}</span>
      <input
        className="num-input"
        type="number"
        inputMode="decimal"
        min="0"
        defaultValue={value}
        onBlur={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v !== value) send('updateSettings', { settings: { points: { [key]: v } } });
        }}
      />
    </label>
  );
  return (
    <Screen>
      <div className="spread">
        <button className="btn secondary small" style={{ width: 'auto' }} onClick={back}>‹ Back</button>
        <AdminChip />
      </div>
      <h1 className="h2">FOMO points</h1>
      <div className="card" style={{ gap: 4 }}>
        {num('Each player who finds the Faker', P.catchFaker, 'catchFaker')}
        {num('Faker: per player fooled', P.fakerPerMiss, 'fakerPerMiss')}
      </div>
    </Screen>
  );
}

export function FomoAdminApp({ game }) {
  const { view } = game;
  const [settings, setSettings] = useState(false);
  if (settings) return <AdminSettings game={game} back={() => setSettings(false)} />;
  switch (view.phase) {
    case 'setup':
      return <AdminSetup game={game} openSettings={() => setSettings(true)} />;
    case 'hints':
    case 'voting':
      return <AdminLive game={game} />;
    case 'reveal':
      return <AdminReveal game={game} />;
    case 'scoreboard':
      return <AdminScores game={game} />;
    case 'final':
      return <AdminScores game={game} final />;
    default:
      return <Waiting game={game} title="Loading…" />;
  }
}
