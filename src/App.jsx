import { useEffect, useState } from 'react';
import { useGame } from './useGame.js';
import { Waiting } from './ui.jsx';
import {
  JoinScreen,
  LobbyScreen,
  StandingsScreen,
  FramerIntroScreen,
  RoleBriefScreen,
  SaboteurScreen,
  FramerAnswerScreen,
  TeaseScreen,
  VoteScreen,
  FramerVotingScreen,
  RoleVotingScreen,
  RevealScreen,
} from './PlayerScreens.jsx';
import {
  AdminLobby,
  AdminSetup,
  AdminLive,
  AdminFramerScreen,
  AdminReview,
  AdminRecap,
  AdminScoreboard,
  AdminSettings,
} from './AdminScreens.jsx';

const ROUND_PHASES = ['roles', 'answering', 'voting'];

// Keep phones awake during a round so they don't lock mid-answer.
function useWakeLock(active) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return undefined;
    let lock = null;
    const request = () => {
      if (document.visibilityState === 'visible') {
        navigator.wakeLock.request('screen').then((l) => (lock = l)).catch(() => {});
      }
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      document.removeEventListener('visibilitychange', request);
      lock?.release().catch(() => {});
    };
  }, [active]);
}

function Toasts({ game }) {
  const { error, clearError, view } = game;
  const [seenNotice, setSeenNotice] = useState(null);
  const notice = view?.notice;
  const showNotice = notice && notice.at !== seenNotice && Date.now() - notice.at < 20_000;
  useEffect(() => {
    if (!error) return undefined;
    const id = setTimeout(clearError, 4000);
    return () => clearTimeout(id);
  }, [error, clearError]);
  useEffect(() => {
    if (!showNotice) return undefined;
    const id = setTimeout(() => setSeenNotice(notice.at), 6000);
    return () => clearTimeout(id);
  }, [showNotice, notice]);
  return (
    <>
      {showNotice && (
        <div className="toast" role="status" onClick={() => setSeenNotice(notice.at)}>
          {notice.message}
        </div>
      )}
      {error && (
        <div className="toast error" role="alert" onClick={clearError}>
          {error.message}
        </div>
      )}
    </>
  );
}

function AdminApp({ game }) {
  const { view } = game;
  const [panel, setPanel] = useState('main');
  useEffect(() => {
    if (panel === 'framer' && !ROUND_PHASES.includes(view.phase)) setPanel('main');
  }, [panel, view.phase]);

  if (panel === 'settings') return <AdminSettings game={game} back={() => setPanel('main')} />;
  if (panel === 'framer') return <AdminFramerScreen game={game} back={() => setPanel('main')} />;
  const openSettings = () => setPanel('settings');

  switch (view.phase) {
    case 'lobby':
      return <AdminLobby game={game} openSettings={openSettings} />;
    case 'setup':
      return <AdminSetup game={game} openSettings={openSettings} />;
    case 'roles':
    case 'answering':
    case 'voting':
      return <AdminLive game={game} openFramerScreen={() => setPanel('framer')} />;
    case 'review':
      return <AdminReview game={game} />;
    case 'recap':
      return <AdminRecap game={game} />;
    case 'scoreboard':
      return <AdminScoreboard game={game} />;
    case 'final':
      return <AdminScoreboard game={game} final />;
    default:
      return <Waiting game={game} title="Loading…" />;
  }
}

function PlayerApp({ game }) {
  const { view } = game;
  const role = view.you.role;
  const round = view.round;

  switch (view.phase) {
    case 'lobby':
      return <LobbyScreen game={game} />;
    case 'setup':
      return <StandingsScreen game={game} title="Scores" subtitle="The next round is being set up." />;
    case 'roles':
      if (role === 'framer') return <FramerIntroScreen game={game} />;
      if (role === 'vandal') return <SaboteurScreen game={game} />;
      if (role === 'accomplice') return <RoleBriefScreen game={game} />;
      if (role === 'waiting') return <Waiting game={game} title="You'll join next round!" body="Watch the chaos for now." />;
      return <Waiting game={game} title="Get ready…" body="Someone is about to be the Framer. Watch everyone's faces." />;
    case 'answering':
      if (role === 'framer') return <FramerAnswerScreen game={game} />;
      if (role === 'waiting') return <Waiting game={game} title="You'll join next round!" />;
      if (role === 'vandal') return <SaboteurScreen game={game} />;
      return <TeaseScreen game={game} />;
    case 'voting':
      if (role === 'framer') return <FramerVotingScreen game={game} />;
      if (role === 'vandal' || role === 'accomplice') return <RoleVotingScreen game={game} />;
      if (role === 'voter') return <VoteScreen game={game} />;
      return <Waiting game={game} title="You'll join next round!" />;
    case 'review':
      return <Waiting game={game} title="Votes are in!" body="Waiting for the big reveal…" />;
    case 'recap':
      return round?.revealed ? <RevealScreen game={game} /> : <Waiting game={game} title="Revealing…" />;
    case 'scoreboard':
      return <StandingsScreen game={game} title="Scores" deltas={round?.deltas} />;
    case 'final':
      return <StandingsScreen game={game} title="Final scores" subtitle="Thanks for playing! Chag sameach!" deltas={{}} />;
    default:
      return <Waiting game={game} title="Loading…" />;
  }
}

export default function App() {
  const game = useGame();
  const { view, status, name, joinAs, leave } = game;
  useWakeLock(Boolean(view && ROUND_PHASES.includes(view.phase)));

  let content;
  if (status === 'kicked') {
    content = <JoinScreen onJoin={joinAs} status="idle" message="You were removed from the game." />;
  } else if (status === 'reset') {
    content = <JoinScreen onJoin={joinAs} status="idle" message="A new game is starting. Join again!" />;
  } else if (status === 'replaced') {
    content = (
      <Waiting
        game={game}
        title="You joined from another device."
        body={
          <button className="btn" style={{ marginTop: 20 }} onClick={() => joinAs(name)}>
            Play on this phone instead
          </button>
        }
      />
    );
  } else if (!name || !view) {
    content = name ? <Waiting game={game} title="Connecting…" body={<button className="btn secondary" style={{ marginTop: 20 }} onClick={leave}>Use a different name</button>} /> : <JoinScreen onJoin={joinAs} status={status} />;
  } else if (view.you?.isAdmin) {
    content = <AdminApp game={game} />;
  } else if (!view.you) {
    content = <JoinScreen onJoin={joinAs} status="idle" />;
  } else {
    content = <PlayerApp game={game} />;
  }

  return (
    <>
      {content}
      <Toasts game={game} />
      {status === 'closed' && view && <div className="toast" role="status">Reconnecting…</div>}
    </>
  );
}
