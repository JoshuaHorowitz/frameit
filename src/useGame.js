import { useCallback, useEffect, useRef, useState } from 'react';
import PartySocket from 'partysocket';

const NAME_KEY = 'frameit:name';
const ROOM = 'chanukah';

export const savedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
};
const saveName = (name) => {
  try {
    if (name) localStorage.setItem(NAME_KEY, name);
    else localStorage.removeItem(NAME_KEY);
  } catch {
    /* storage can be unavailable; rejoining by hand still works */
  }
};

// A connection id that works on plain-http LAN addresses too. Phones opening
// http://192.168.x.x:5173 are not a "secure context", so crypto.randomUUID()
// is missing there; partysocket would otherwise try to use it.
function connectionId() {
  const key = 'frameit:conn';
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
  } catch {
    /* ignore */
  }
  const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  try {
    sessionStorage.setItem(key, id);
  } catch {
    /* ignore */
  }
  return id;
}

// Owns the WebSocket. Returns the latest private view from the server,
// a send() for actions, and the offset between this phone's clock and the server's.
export function useGame() {
  const [name, setName] = useState(savedName);
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | connecting | open | closed | kicked | replaced
  const [clockOffset, setClockOffset] = useState(0);
  const socket = useRef(null);

  useEffect(() => {
    if (!name) return undefined;
    setStatus('connecting');
    const ws = new PartySocket({
      host: import.meta.env.VITE_SERVER_HOST || window.location.host,
      party: 'game-room',
      room: ROOM,
      id: connectionId(),
    });
    ws.addEventListener('open', () => {
      setStatus('open');
      ws.send(JSON.stringify({ type: 'join', name }));
    });
    ws.addEventListener('close', () => setStatus((s) => (s === 'kicked' || s === 'replaced' ? s : 'closed')));
    ws.addEventListener('message', (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.serverNow) setClockOffset(msg.serverNow - Date.now());
      if (msg.type === 'state') {
        setView(msg.view);
        saveName(name);
      } else if (msg.type === 'error') {
        setError({ ...msg, at: Date.now() });
        if (msg.code === 'bad_name') {
          saveName('');
          setName('');
        }
      } else if (msg.type === 'kicked' || msg.type === 'replaced') {
        setStatus(msg.type);
        ws.close();
        if (msg.type === 'kicked') saveName('');
      }
    });
    socket.current = ws;
    return () => {
      ws.close();
      socket.current = null;
    };
  }, [name]);

  const send = useCallback((type, payload = {}) => {
    socket.current?.send(JSON.stringify({ type, ...payload }));
  }, []);

  const joinAs = useCallback((newName) => {
    setView(null);
    setStatus('idle');
    setName(newName.trim());
  }, []);

  const leave = useCallback(() => {
    saveName('');
    setView(null);
    setName('');
    setStatus('idle');
  }, []);

  return { name, view, send, error, clearError: () => setError(null), status, clockOffset, joinAs, leave };
}

// Seconds left on the current timer, ticking locally between server updates.
export function useCountdown(view, clockOffset) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  if (!view) return null;
  if (view.pausedRemaining != null) return { seconds: Math.ceil(view.pausedRemaining / 1000), paused: true };
  if (view.deadline == null) return null;
  const ms = Math.max(0, view.deadline - (now + clockOffset));
  return { seconds: Math.ceil(ms / 1000), paused: false };
}
