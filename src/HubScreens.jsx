import { useState } from 'react';
import { Screen, Logo } from './ui.jsx';
import { PlayerAdminList, NewGameButton } from './AdminScreens.jsx';

// The admin's Game Night lobby: who's here, which game to play, and Start.
export function HubAdminLobby({ game }) {
  const { view, send } = game;
  const games = view.hub.games;
  const [choice, setChoice] = useState(games[0]?.id);
  const picked = games.find((g) => g.id === choice);
  const enough = picked && view.players.length >= picked.minPlayers;
  return (
    <Screen>
      <div className="spread">
        <Logo which="hub" />
        <span className="chip admin">ADMIN</span>
      </div>
      <div className="stack">
        <h1 className="h2">Pick a game</h1>
        {games.map((g) => (
          <button
            key={g.id}
            type="button"
            aria-pressed={choice === g.id}
            onClick={() => setChoice(g.id)}
            className={`pick${choice === g.id ? ' on' : ''}`}
            style={{ textAlign: 'left', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}
          >
            <span style={{ fontFamily: 'var(--display)', fontSize: 22 }}>{g.name}</span>
            <span className="small" style={{ color: choice === g.id ? 'var(--text-soft)' : 'var(--muted)', fontWeight: 500 }}>
              {g.tagline}
            </span>
          </button>
        ))}
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <h2 className="label">{view.players.length} players here</h2>
        <PlayerAdminList game={game} />
      </div>
      <div className="stack push-down">
        {picked && !enough && <p className="small center">{picked.name} needs at least {picked.minPlayers} players.</p>}
        <button className="btn" disabled={!enough} onClick={() => send('startHubGame', { gameId: choice })}>
          Start {picked?.name}
        </button>
        <NewGameButton send={send} />
      </div>
    </Screen>
  );
}
