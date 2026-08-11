(function () {
  'use strict';

  const network = {
    socket: null,
    status: 'offline',
    clientId: null,
    matchId: null,
    opponentId: null,
    serverOffset: 0,
    matchWaitMs: 4000,
    pendingProfile: null,
    reconnectTimer: 0,
    reconnectAttempt: 0,
    closedByClient: false
  };

  function emit(type, detail = {}) {
    window.dispatchEvent(new CustomEvent('ninja-network', {
      detail: {
        type,
        status: network.status,
        clientId: network.clientId,
        matchId: network.matchId,
        opponentId: network.opponentId,
        ...detail
      }
    }));
  }

  function websocketUrl() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return protocol + '//' + location.host + '/ws';
  }

  function send(message) {
    if (network.socket?.readyState !== WebSocket.OPEN) return false;
    network.socket.send(JSON.stringify(message));
    return true;
  }

  function sendPendingQueue() {
    if (!network.pendingProfile) return;
    network.status = 'searching';
    send({ type: 'queue', profile: network.pendingProfile });
    emit('searching', { timeoutMs: network.matchWaitMs });
  }

  function scheduleReconnect() {
    clearTimeout(network.reconnectTimer);
    const delay = Math.min(5000, 500 + network.reconnectAttempt * 750);
    network.reconnectAttempt += 1;
    network.reconnectTimer = setTimeout(connect, delay);
  }

  function handleMessage(event) {
    let message;
    try { message = JSON.parse(event.data); } catch (_) { return; }
    if (!message || typeof message.type !== 'string') return;

    if (message.serverTime) network.serverOffset = message.serverTime - Date.now();

    if (message.type === 'hello') {
      network.clientId = message.clientId;
      network.matchWaitMs = Number(message.matchWaitMs) || network.matchWaitMs;
      emit('ready', { matchWaitMs: network.matchWaitMs });
    } else if (message.type === 'searching') {
      network.status = 'searching';
      network.matchWaitMs = Number(message.timeoutMs) || network.matchWaitMs;
      emit('searching', { timeoutMs: network.matchWaitMs });
    } else if (message.type === 'match-found') {
      network.status = 'playing';
      network.pendingProfile = null;
      network.matchId = message.matchId;
      network.opponentId = message.opponentId;
      emit('match-found', {
        startAt: Number(message.startAt),
        localStartAt: Number(message.startAt) - network.serverOffset,
        playerName: message.playerName || 'Ninja',
        opponentName: message.opponentName || 'Rival',
        opponentLoadout: message.opponentLoadout || {}
      });
    } else if (message.type === 'bot-fallback') {
      network.status = 'online';
      network.pendingProfile = null;
      network.matchId = null;
      network.opponentId = null;
      emit('bot-fallback', { reason: message.reason || 'timeout' });
    } else if (message.type === 'opponent-state') {
      emit('opponent-state', { state: message.state || {} });
    } else if (message.type === 'opponent-kunai-spawn') {
      emit('opponent-kunai-spawn', { kunai: message.kunai || {} });
    } else if (message.type === 'match-finished') {
      const winnerId = message.winnerId;
      network.status = 'online';
      network.matchId = null;
      network.opponentId = null;
      emit('match-finished', {
        winnerId,
        won: winnerId === network.clientId,
        reason: message.reason
      });
    } else if (message.type === 'opponent-left') {
      network.status = 'online';
      network.matchId = null;
      network.opponentId = null;
      emit('opponent-left');
    }
  }

  function connect() {
    if (!location.host || typeof WebSocket !== 'function') {
      network.status = 'offline';
      emit('unavailable');
      return false;
    }
    if (network.socket &&
        (network.socket.readyState === WebSocket.OPEN || network.socket.readyState === WebSocket.CONNECTING)) {
      return true;
    }

    network.closedByClient = false;
    network.status = 'connecting';
    emit('connecting');
    const socket = new WebSocket(websocketUrl());
    network.socket = socket;

    socket.addEventListener('open', () => {
      if (network.socket !== socket) return;
      network.status = 'online';
      network.reconnectAttempt = 0;
      emit('connected');
      sendPendingQueue();
    });
    socket.addEventListener('message', handleMessage);
    socket.addEventListener('close', () => {
      if (network.socket !== socket) return;
      const previousStatus = network.status;
      network.socket = null;
      network.status = 'offline';
      network.matchId = null;
      network.opponentId = null;
      emit('disconnected', {
        wasPlaying: previousStatus === 'playing',
        wasSearching: previousStatus === 'searching'
      });
      if (!network.closedByClient) scheduleReconnect();
    });
    socket.addEventListener('error', () => {
      if (network.socket === socket) emit('connection-error');
    });
    return true;
  }

  function queue(profile = {}) {
    network.pendingProfile = {
      name: String(profile.name || ''),
      loadout: { ...(profile.loadout || {}) }
    };
    if (!connect()) return false;
    if (network.socket?.readyState === WebSocket.OPEN) sendPendingQueue();
    else {
      network.status = 'connecting';
      emit('queue-pending');
    }
    return true;
  }

  function leave() {
    network.pendingProfile = null;
    send({ type: 'leave' });
    network.matchId = null;
    network.opponentId = null;
    network.status = network.socket?.readyState === WebSocket.OPEN ? 'online' : 'offline';
    emit('left');
  }

  function sendState(state) {
    if (network.status !== 'playing' || !network.matchId) return false;
    return send({ type: 'state', state });
  }

  function sendKunaiSpawn(kunai) {
    if (network.status !== 'playing' || !network.matchId) return false;
    return send({ type: 'kunai-spawn', kunai });
  }

  function finish(reason = 'finish') {
    if (network.status !== 'playing' || !network.matchId) return false;
    return send({ type: 'finish', reason: reason === 'knockout' ? 'knockout' : 'finish' });
  }

  function snapshot() {
    return {
      status: network.status,
      connected: network.socket?.readyState === WebSocket.OPEN,
      clientId: network.clientId,
      matchId: network.matchId,
      opponentId: network.opponentId,
      matchWaitMs: network.matchWaitMs
    };
  }

  window.NinjaNetwork = Object.freeze({
    connect,
    queue,
    leave,
    sendState,
    sendKunaiSpawn,
    finish,
    snapshot
  });

  connect();
})();
