import { useState } from 'react';
import { Screen, Logo } from './ui.jsx';
import { PlayerAdminList, NewGameButton, AdminSettings as FrameItSettings } from './AdminScreens.jsx';
import { FomoSettings } from './FomoScreens.jsx';

const SETTINGS_SCREENS = { frameit: FrameItSettings, fomo: FomoSettings };

// Settings edited from the lobby are saved for the next game of that kind.
function lobbySettingsGame(game, gameId) {
  return {
    ...game,
    view: { ...game.view, admin: game.view.admin.gameSettings[gameId] },
    send: (type, payload = {}) =>
      type === 'kick' || type === 'resetGame'
        ? game.send(type, payload)
        : game.send('configureGame', { gameId, action: { type, ...payload } }),
  };
}

// The admin's Game Night lobby: who's here, which game to play, and Start.
export function HubAdminLobby({ game }) {
  const { view, send } = game;
  const games = view.hub.games;
  const [choice, setChoice] = useState(games[0]?.id);
  const picked = games.find((g) => g.id === choice);
  const [settingsFor, setSettingsFor] = useState(null);
  const SettingsScreen = settingsFor && SETTINGS_SCREENS[settingsFor];
  if (SettingsScreen && view.admin?.gameSettings?.[settingsFor]) {
    return <SettingsScreen game={lobbySettingsGame(game, settingsFor)} back={() => setSettingsFor(null)} />;
  }
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
        <h2 className="label">{view.players.length} {view.players.length === 1 ? 'player' : 'players'} here</h2>
        <PlayerAdminList game={game} />
      </div>
      <div className="stack push-down">
        {picked && view.players.length < picked.bestWith && (
          <p className="small center">{picked.name} is best with {picked.bestWith} or more players.</p>
        )}
        <button className="btn" disabled={!picked} onClick={() => send('startHubGame', { gameId: choice })}>
          Start {picked?.name}
        </button>
        {picked && SETTINGS_SCREENS[picked.id] && (
          <button className="btn secondary" onClick={() => setSettingsFor(picked.id)}>{picked.name} settings</button>
        )}
        <NewGameButton send={send} />
      </div>
    </Screen>
  );
}
