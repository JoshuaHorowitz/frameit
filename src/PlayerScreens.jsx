import { useEffect, useRef, useState } from 'react';
import { Screen, TopBar, Logo, Avatar, PlayerGrid, Scoreboard, Waiting, nameOf, signed, deltaClass } from './ui.jsx';

// ---------- Join ----------

export function JoinScreen({ onJoin, status, playerCount }) {
  const [name, setName] = useState('');
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches;
  return (
    <Screen>
      <div className="stack center" style={{ alignItems: 'center', marginTop: '10vh', gap: 18 }}>
        <svg width="88" height="88" viewBox="0 0 48 48" fill="none" stroke="#F5C451" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
          <path d="M6 16V6h10M32 6h10v10M42 32v10H32M16 42H6V32" />
          <circle cx="24" cy="21" r="6" />
          <path d="M14 36c2-5 6-8 10-8s8 3 10 8" />
        </svg>
        <h1 className="h1" style={{ fontSize: 52 }}>
          <Logo />
        </h1>
        <p className="body">
          Answer it. Frame someone.
          <br />
          Don&apos;t crack.
        </p>
      </div>
      <form
        className="stack push-down"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onJoin(name);
        }}
      >
        <label htmlFor="name" className="small" style={{ fontWeight: 600 }}>
          Your name
        </label>
        <input id="name" className="input" value={name} maxLength={24} autoComplete="given-name" onChange={(e) => setName(e.target.value)} />
        <button className="btn" type="submit" disabled={!name.trim() || status === 'connecting'}>
          {status === 'connecting' ? 'Joining…' : 'Join the party'}
        </button>
        {playerCount != null && <p className="small center">{playerCount} players in the lobby</p>}
        {isIos && !standalone && <p className="small center">Tip: Share → Add to Home Screen to play full-screen.</p>}
      </form>
    </Screen>
  );
}

// ---------- Between rounds ----------

export function LobbyScreen({ game }) {
  const { view } = game;
  return (
    <Screen>
      <TopBar game={game} left={<Logo />} />
      <div className="stack" style={{ marginTop: 12 }}>
        <h1 className="h1">You&apos;re in, {view.you.name}!</h1>
        <p className="body">Waiting for the game to start. Here&apos;s who&apos;s here so far:</p>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        {view.players.map((p) => (
          <div key={p.id} className="list-row">
            <span className={`dot${p.connected ? '' : ' off'}`} />
            {p.name}
          </div>
        ))}
      </div>
    </Screen>
  );
}

export function StandingsScreen({ game, title, subtitle, deltas }) {
  const { view } = game;
  return (
    <Screen>
      <TopBar game={game} />
      <div className="stack" style={{ marginTop: 4 }}>
        <h1 className="h1">{title}</h1>
        {subtitle && <p className="body">{subtitle}</p>}
      </div>
      <Scoreboard view={view} deltas={deltas} highlightId={view.you?.id} />
      {!deltas && <p className="small center push-down">Waiting for the next round…</p>}
    </Screen>
  );
}

// ---------- Roles ----------

export function FramerPickScreen({ game }) {
  const { view, send } = game;
  const r = view.round;
  const [choice, setChoice] = useState(r.targetOptions[0]);
  if (r.targetId) {
    return (
      <Waiting
        game={game}
        title={`You're framing ${nameOf(view, r.targetId)}.`}
        body={r.secondFramerExists ? 'Waiting for the other Framer to pick…' : 'Get ready to answer…'}
      />
    );
  }
  return (
    <Screen>
      <TopBar game={game} />
      <div className="stack" style={{ marginTop: 8 }}>
        <span className="chip gold" style={{ alignSelf: 'flex-start', letterSpacing: 1, fontWeight: 700 }}>
          SECRET · ONLY YOU SEE THIS
        </span>
        <h1 className="h1" style={{ fontSize: 40 }}>You&apos;re the Framer.</h1>
        <p className="body">
          Your answer has to be <b style={{ color: 'var(--text)' }}>true for you</b>, and believable for the person you frame.
        </p>
        {r.secondFramerExists && <p className="body">There&apos;s a second Framer this round. You don&apos;t know who.</p>}
      </div>
      <div className="stack" style={{ gap: 12 }}>
        <h2 className="small" style={{ fontWeight: 600 }}>Who do you want to frame?</h2>
        {r.targetOptions.map((id) => (
          <button key={id} type="button" className={`target${choice === id ? ' on' : ''}`} aria-pressed={choice === id} onClick={() => setChoice(id)}>
            <Avatar id={id} name={nameOf(view, id)} />
            {nameOf(view, id)}
          </button>
        ))}
      </div>
      <button className="btn push-down" onClick={() => send('pickTarget', { targetId: choice })}>
        Frame {nameOf(view, choice)}
      </button>
    </Screen>
  );
}

export function RoleBriefScreen({ game, role }) {
  const { view } = game;
  const r = view.round;
  const vandal = role === 'vandal';
  return (
    <Screen theme={role}>
      <TopBar game={game} showBar={false} />
      <div className="stack" style={{ marginTop: 8 }}>
        <h1 className="secret-head">
          SECRET!!
          <br />
          ONLY YOU SEE THIS
        </h1>
        <h2 className="h1" style={{ fontSize: 30 }}>You&apos;re the {vandal ? 'Vandal' : 'Accomplice'}.</h2>
        {vandal ? (
          <p className="body">
            You will get <b style={{ color: 'var(--text)' }}>+1 for every player that catches the Framer</b>. Drop hints and lead others to get the most points for yourself this round!
          </p>
        ) : (
          <p className="body">
            You will get <b style={{ color: 'var(--text)' }}>+2 for every player that votes for YOU</b>. That means acting suspicious and drawing attention away from the real Framer may help you out!
          </p>
        )}
      </div>
      <p className="warn">
        {vandal ? (
          <>
            But <b><i>be careful</i></b>: the Framer will reverse your points if they catch YOU!!
          </>
        ) : (
          <>
            But <b><i>be careful</i></b>, because for every vote for the Framer, YOU will get <b>−1</b>!
          </>
        )}
      </p>
      <FramerCards view={view} framers={r.framers} />
      <p className="small center push-down">Waiting for the Framer to answer…</p>
    </Screen>
  );
}

function FramerCards({ view, framers }) {
  return (
    <div className="stack">
      {framers.map((f) => (
        <div key={f.id} className="grid2">
          <div className="card" style={{ alignItems: 'center' }}>
            <span className="small">The Framer</span>
            <Avatar id={f.id} name={nameOf(view, f.id)} big />
            <b style={{ fontSize: 20 }}>{nameOf(view, f.id)}</b>
          </div>
          <div className="card" style={{ alignItems: 'center' }}>
            <span className="small">Is framing</span>
            {f.targetId ? (
              <>
                <Avatar id={f.targetId} name={nameOf(view, f.targetId)} big />
                <b style={{ fontSize: 20 }}>{nameOf(view, f.targetId)}</b>
              </>
            ) : (
              <span className="body" style={{ marginTop: 24 }}>Picking…</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Answering ----------

export function FramerAnswerScreen({ game }) {
  const { view, send } = game;
  const r = view.round;
  const [text, setText] = useState(r.myDraft || r.myAnswer || '');
  const draftTimer = useRef(null);
  const feedEnd = useRef(null);
  useEffect(() => {
    feedEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [r.messages.length]);

  const onChange = (value) => {
    setText(value);
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => send('draftAnswer', { text: value }), 500);
  };
  const submitted = r.myAnswer && r.myAnswer === text.trim();

  return (
    <Screen>
      <TopBar game={game} left={<span className="chip gold">Framing: {nameOf(view, r.targetId)}</span>} />
      <div className="card">
        <span className="label">The question</span>
        <h1 className="h2" style={{ fontSize: 28 }}>{r.question}</h1>
        <label htmlFor="answer" className="small">Your answer (true for you!)</label>
        <textarea id="answer" className="textarea" rows={3} maxLength={200} value={text} onChange={(e) => onChange(e.target.value)} />
        <button className="btn" disabled={!text.trim() || submitted} onClick={() => send('submitAnswer', { text })}>
          {submitted ? 'Submitted ✓' : r.myAnswer ? 'Update answer' : 'Submit answer'}
        </button>
        {submitted && <p className="small">You can still edit until time runs out.</p>}
      </div>
      <h2 className="small" style={{ fontWeight: 600 }}>Incoming messages · don&apos;t crack</h2>
      <div className="feed">
        {r.messages.length === 0 && <p className="small">Nothing yet…</p>}
        {r.messages.map((m, i) => (
          <div key={i} className="bubble">
            <div className="from" style={{ color: 'var(--blue)' }}>{nameOf(view, m.fromId)}</div>
            <div>{m.text}</div>
          </div>
        ))}
        <div ref={feedEnd} />
      </div>
    </Screen>
  );
}

export function TeaseScreen({ game }) {
  const { view, send } = game;
  const r = view.round;
  const role = view.you.role;
  const [text, setText] = useState('');
  const feedEnd = useRef(null);
  useEffect(() => {
    feedEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [r.myMessages?.length]);
  const framer = r.framers?.[0];
  return (
    <Screen theme={role === 'vandal' || role === 'accomplice' ? role : undefined}>
      <TopBar game={game} />
      {framer && (
        <div className="chip purple" style={{ alignSelf: 'flex-start' }}>
          You&apos;re the {role === 'vandal' ? 'Vandal' : 'Accomplice'}:{' '}
          {r.framers.map((f) => `${nameOf(view, f.id)} → ${nameOf(view, f.targetId)}`).join(', ')}
        </div>
      )}
      <div className="stack">
        <h1 className="h1" style={{ fontSize: 32 }}>The Framer is answering…</h1>
        <p className="body">
          You are sending messages directly to the Framer. They&apos;re going to be trying to keep a straight face and answer their question… see if you can make them crack!
        </p>
      </div>
      <div className="feed" style={{ justifyContent: 'flex-end' }}>
        {(r.myMessages ?? []).map((m, i) => (
          <div key={i} className="bubble mine">{m.text}</div>
        ))}
        <div ref={feedEnd} />
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          send('sendMessage', { text });
          setText('');
        }}
      >
        <label htmlFor="msg" className="sr-only" style={{ position: 'absolute', left: -9999 }}>
          Send a message to the Framer
        </label>
        <input id="msg" className="input" placeholder="Send a message to the Framer" maxLength={120} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn" style={{ width: 56, padding: 0 }} aria-label="Send" type="submit">
          ➤
        </button>
      </form>
    </Screen>
  );
}

// ---------- Voting ----------

function VotesIn({ round }) {
  return <p className="small center">{round.votesIn} of {round.votesExpected} votes in</p>;
}

export function VoteScreen({ game }) {
  const { view, send } = game;
  const r = view.round;
  const others = view.players.filter((p) => p.id !== view.you.id && !p.waiting);
  const two = r.answers.length > 1;
  return (
    <Screen>
      <TopBar game={game} left={<span className="chip">Discuss &amp; vote</span>} />
      {two && <p className="body"><b style={{ color: 'var(--text)' }}>Surprise: there are two Framers!</b> Vote on each answer.</p>}
      {r.answers.map((a) => (
        <div key={a.index} className="stack" style={{ gap: 12 }}>
          <div className="card">
            <span className="small" style={{ fontWeight: 600 }}>{two ? `Answer ${'AB'[a.index]} · ` : ''}{r.question}</span>
            <p className="answer">“{a.text}”</p>
          </div>
          <h2 className="h2">Who wrote it?</h2>
          <PlayerGrid players={others} selected={r.myVotes?.[a.index]} onPick={(id) => send('castVote', { answerIndex: a.index, suspectId: id })} />
        </div>
      ))}
      <div className="push-down stack">
        <p className="small center">You can change your vote until the timer runs out.</p>
        <VotesIn round={r} />
      </div>
    </Screen>
  );
}

export function FramerVotingScreen({ game }) {
  const { view, send } = game;
  const r = view.round;
  const others = view.players.filter((p) => p.id !== view.you.id && !p.waiting);
  if (!r.vandalPresent) {
    return (
      <Screen>
        <TopBar game={game} left={<span className="chip gold">You&apos;re the Framer</span>} />
        <div className="stack center" style={{ marginTop: '20vh' }}>
          <h1 className="h1">Everyone&apos;s voting on you.</h1>
          <p className="body">Keep a straight face, because everyone&apos;s watching you right now.</p>
        </div>
        <div className="push-down"><VotesIn round={r} /></div>
      </Screen>
    );
  }
  return (
    <Screen>
      <TopBar game={game} left={<span className="chip gold">You&apos;re the Framer</span>} />
      <div className="stack" style={{ marginTop: 6 }}>
        <h1 className="shout">SURPRISE!!</h1>
        <h2 className="h2">There was a “Vandal” this round</h2>
        <p className="body">
          That means someone in the room has been trying to oust you as the Framer this entire time! Guess who they are for{' '}
          <b style={{ color: 'var(--gold)' }}>+3</b>!
        </p>
      </div>
      <PlayerGrid players={others} selected={r.myVandalGuess} purple onPick={(id) => send('guessVandal', { suspectId: id })} />
      <div className="push-down stack">
        <div className="status-row spread"><span className="small">Voting in progress</span><b>{r.votesIn} of {r.votesExpected} in</b></div>
        <p className="small center">Keep a straight face, because everyone&apos;s watching you right now.</p>
      </div>
    </Screen>
  );
}

export function RoleVotingScreen({ game }) {
  const { view } = game;
  const r = view.round;
  const role = view.you.role;
  return (
    <Screen theme={role}>
      <TopBar game={game} />
      {r.answers.map((a) => (
        <div key={a.index} className="card">
          <span className="small" style={{ fontWeight: 600 }}>{r.question}</span>
          <p className="answer">“{a.text}”</p>
        </div>
      ))}
      <div className="stack">
        <h1 className="h2">You don&apos;t vote this round.</h1>
        <p className="body">
          {role === 'vandal'
            ? 'Keep steering people toward the Framer… but not so hard that they spot you.'
            : 'Keep drawing suspicion onto yourself and away from the Framer!'}
        </p>
      </div>
      <FramerCards view={view} framers={r.framers} />
      <div className="push-down"><VotesIn round={r} /></div>
    </Screen>
  );
}

// ---------- Reveal ----------

export function RevealScreen({ game }) {
  const { view } = game;
  const r = view.round;
  const me = view.you.id;
  const role = view.you.role;
  const myDelta = r.deltas?.[me] ?? 0;
  const n = (id) => nameOf(view, id);

  let kicker;
  let headline;
  let sub;
  if (role === 'framer') {
    const i = r.framers.findIndex((f) => f.id === me);
    const catchers = Object.values(r.votes).filter((v) => v[i] === me).length;
    kicker = 'YOU WERE THE FRAMER';
    headline = catchers === 0 ? 'Perfect Frame!' : `${catchers} caught you.`;
    sub = `You framed ${n(r.framers[i].targetId)}.`;
  } else if (role === 'vandal') {
    const caught = r.framers.some((f) => r.vandalGuesses[f.id] === me);
    kicker = 'YOU WERE THE VANDAL';
    headline = caught ? 'Busted!' : 'You got away with it.';
  } else if (role === 'accomplice') {
    kicker = 'YOU WERE THE ACCOMPLICE';
    headline = myDelta >= 0 ? 'Nice cover!' : 'Not your night.';
  } else {
    const myVotes = r.votes[me] ?? {};
    const right = r.framers.filter((f, i) => myVotes[i] === f.id).length;
    const voted = Object.keys(myVotes).length;
    kicker = right > 0 ? 'NICE DETECTIVE WORK' : 'YOU GOT FRAMED';
    headline = right === r.framers.length ? 'You got it!' : right > 0 ? 'Half right!' : 'Not quite.';
    sub = voted ? `You voted for ${r.framers.map((_, i) => (myVotes[i] ? n(myVotes[i]) : 'nobody')).join(' and ')}.` : "You didn't vote.";
  }

  return (
    <Screen>
      <TopBar game={game} />
      <div className="stack center" style={{ marginTop: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: 1, color: myDelta > 0 ? 'var(--green)' : 'var(--red-soft)' }}>{kicker}</span>
        <h1 className="h1" style={{ fontSize: 38 }}>{headline}</h1>
        {sub && <p className="body">{sub}</p>}
      </div>
      {r.framers.map((f) => (
        <div key={f.id} className="card" style={{ alignItems: 'center', textAlign: 'center' }}>
          <span className="small" style={{ fontWeight: 600 }}>The Framer was</span>
          <Avatar id={f.id} name={n(f.id)} big />
          <span className="h2" style={{ fontSize: 30 }}>{n(f.id)}</span>
          <span className="body">…framing <b style={{ color: 'var(--blue)' }}>{n(f.targetId)}</b> with “{f.answer}”</span>
        </div>
      ))}
      {r.vandalId && (
        <div className="stack center" style={{ gap: 4 }}>
          <span className="h2" style={{ fontSize: 26 }}>The Vandal was <span style={{ color: 'var(--purple)' }}>{n(r.vandalId)}</span></span>
          {r.framers.some((f) => r.vandalGuesses[f.id] === r.vandalId) && (
            <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--purple)' }}>
              …and {r.framers.filter((f) => r.vandalGuesses[f.id] === r.vandalId).map((f) => n(f.id)).join(' and ')} caught them!
            </span>
          )}
        </div>
      )}
      {r.accompliceId && (
        <div className="center h2" style={{ fontSize: 22 }}>
          The Accomplice was <span style={{ color: 'var(--orange)' }}>{n(r.accompliceId)}</span>
        </div>
      )}
      <div className="spread" style={{ padding: '0 4px' }}>
        <span className="body">Your points this round</span>
        <span className={`h2 ${deltaClass(myDelta)}`} style={{ fontSize: 28 }}>{signed(myDelta)}</span>
      </div>
      <p className="small center push-down">Scores coming up…</p>
    </Screen>
  );
}
