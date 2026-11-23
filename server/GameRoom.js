// The Durable Object that hosts the game. It is a thin adapter: it keeps the
// engine's state in storage, turns WebSocket messages into engine actions,
// schedules alarms for the timers, and sends each phone its private view.

import { Server } from 'partyserver';
import { createState, join, applyAction, tick, nextAlarm, setConnected, GameError } from './game.js';
import { buildView } from './views.js';

const STORAGE_KEY = 'state';

export class GameRoom extends Server {
  // Let idle connections hibernate; state is reloaded from storage on wake.
  static options = { hibernate: true };

  async onStart() {
    await this.loadState();
  }

  async loadState() {
    if (!this.game) {
      this.game = (await this.ctx.storage.get(STORAGE_KEY)) ?? createState();
    }
    return this.game;
  }

  // Run an engine change atomically: work on a copy, keep it only if it succeeds.
  async commit(change) {
    await this.loadState();
    const draft = structuredClone(this.game);
    const effects = change(draft);
    this.game = draft;
    await this.ctx.storage.put(STORAGE_KEY, this.game);
    const at = nextAlarm(this.game);
    if (at == null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(at);
    this.broadcastViews();
    return effects;
  }

  broadcastViews() {
    const serverNow = Date.now();
    for (const conn of this.getConnections()) {
      const viewer = conn.state;
      if (!viewer) continue; // connected but has not joined yet
      conn.send(JSON.stringify({ type: 'state', view: buildView(this.game, viewer), serverNow }));
    }
  }

  connectionsFor(playerId, except) {
    return [...this.getConnections()].filter((c) => c.state?.playerId === playerId && c.id !== except?.id);
  }

  async onConnect(connection) {
    await this.loadState();
    connection.send(JSON.stringify({ type: 'hello', serverNow: Date.now() }));
  }

  async onMessage(connection, raw) {
    let message;
    try {
      message = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    try {
      if (message.type === 'join') {
        await this.handleJoin(connection, message.name);
        return;
      }
      const actor = connection.state;
      if (!actor) throw new GameError('not_joined', 'Join the game first.');
      const effects = await this.commit((state) =>
        applyAction(state, actor, message, Date.now(), Math.random)
      );
      if (effects?.kicked) this.kick(effects.kicked);
    } catch (error) {
      const code = error instanceof GameError ? error.code : 'server_error';
      if (!(error instanceof GameError)) console.error(error);
      connection.send(JSON.stringify({ type: 'error', code, message: error.message }));
    }
  }

  async handleJoin(connection, name) {
    let joined;
    await this.commit((state) => {
      joined = join(state, name);
      if (!joined.isAdmin) setConnected(state, joined.playerId, true, Date.now());
    });
    connection.setState({ isAdmin: joined.isAdmin, playerId: joined.playerId });
    // Newest connection wins: close any older phone using the same name.
    if (!joined.isAdmin) {
      for (const old of this.connectionsFor(joined.playerId, connection)) {
        old.setState(null);
        old.send(JSON.stringify({ type: 'replaced' }));
        old.close(4000, 'Joined from another device');
      }
    }
    connection.send(
      JSON.stringify({ type: 'state', view: buildView(this.game, connection.state), serverNow: Date.now() })
    );
  }

  kick(playerId) {
    for (const conn of this.connectionsFor(playerId)) {
      conn.setState(null);
      conn.send(JSON.stringify({ type: 'kicked' }));
      conn.close(4001, 'Removed by the admin');
    }
  }

  async onClose(connection) {
    const viewer = connection.state;
    if (!viewer) return;
    if (viewer.isAdmin) {
      const others = [...this.getConnections()].some((c) => c.id !== connection.id && c.state?.isAdmin);
      if (!others) await this.commit((state) => void (state.adminConnected = false));
      return;
    }
    if (this.connectionsFor(viewer.playerId, connection).length === 0) {
      await this.commit((state) => setConnected(state, viewer.playerId, false, Date.now()));
    }
  }

  async onError(connection) {
    await this.onClose(connection);
  }

  // Durable Object alarm: a timer ran out (or a Framer's grace period ended).
  async alarm() {
    await this.loadState();
    await this.commit((state) => tick(state, Date.now(), Math.random));
  }
}
