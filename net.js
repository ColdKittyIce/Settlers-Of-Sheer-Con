export function createNet() {
  const listeners = {};
  let socket = null;
  let opened = false;
  let manuallyClosed = false;
  let retry = 0;
  let identity = null;
  let lastStatusCb = null;
  let queue = [];

  function on(type, cb) { (listeners[type] = listeners[type] || []).push(cb); }
  function emit(type, data) {
    (listeners[type] || []).forEach(cb => { try { cb(data); } catch (e) { console.error('net handler error', e); } });
  }
  function setStatus(text) { if (lastStatusCb) lastStatusCb(text); }
  function onStatus(cb) { lastStatusCb = cb; }

  function connect() {
    manuallyClosed = false;
    let sock;
    try {
      sock = root.createServerSocket();
    } catch (e) {
      scheduleReconnect(null, 3000);
      return;
    }
    socket = sock;
    sock.addEventListener('open', () => {
      opened = true;
      retry = 0;
      emit('open');
      const pending = queue;
      queue = [];
      pending.forEach(o => rawSend(o));
      if (identity && identity.code) {
        send({ t: 'join_room', code: identity.code, playerName: identity.name, color: identity.color });
      }
    });
    sock.addEventListener('message', ev => {
      let data;
      try { data = JSON.parse(ev.data); } catch (e) { return; }
      if (data && typeof data.t === 'string') emit(data.t, data);
    });
    sock.addEventListener('error', () => { /* close follows */ });
    sock.addEventListener('close', ev => {
      opened = false;
      emit('close', ev);
      if (manuallyClosed) return;
      if (ev && ev.code === 1000) return;
      if (ev && ev.code === 4403) return;
      scheduleReconnect(ev, ev && ev.code === 1013 ? 15000 : 0);
    });
  }

  function scheduleReconnect(ev, base) {
    const delay = Math.min(20000, 700 * Math.pow(1.8, retry++));
    setTimeout(() => { if (!manuallyClosed) connect(); }, base || delay);
  }

  function send(obj) {
    if (socket && socket.readyState === 1) return rawSend(obj);
    queue.push(obj);
    return false;
  }
  function rawSend(obj) {
    try {
      socket.send(JSON.stringify(obj));
      return true;
    } catch (e) {
      queue.push(obj);
      return false;
    }
  }

  function createRoom(opts) {
    identity = { code: null, name: opts.playerName, color: opts.color };
    return send({ t: 'create_room', name: opts.name, playerName: opts.playerName, color: opts.color, size: opts.size, shape: opts.shape, seed: opts.seed, aiCount: opts.aiCount, map: opts.map, aiDifficulty: opts.aiDifficulty, aiStyle: opts.aiStyle, winVP: opts.winVP, discardThreshold: opts.discard, friendlyRobber: opts.friendly ? 'on' : 'off', turnTimer: opts.timer, expansion: opts.expansion });
  }
  function joinRoom(opts) {
    identity = { code: opts.code, name: opts.playerName, color: opts.color };
    return send({ t: 'join_room', code: opts.code, playerName: opts.playerName, color: opts.color });
  }
  function leaveRoom() { send({ t: 'leave_room' }); identity = null; }
  function startGame(save) { return send({ t: 'start_game', save }); }
  function pushState(save) { return send({ t: 'state_update', save }); }
  function sendAction(action) { return send({ t: 'action', action }); }
  function chat(text) { return send({ t: 'chat', text }); }

  connect();

  return {
    on, onStatus, send,
    createRoom, joinRoom, leaveRoom, startGame, pushState, sendAction, chat,
    isOpen: () => opened,
    close() { manuallyClosed = true; if (socket) { try { socket.close(1000); } catch (e) {} } },
  };
}
