import { createGame, validSettlementSpots, validCitySpots, validRoadSpots, validShipSpots } from './rules.js';

export function serializeGame(state) {
  const players = state.players.map(p => ({
    name: p.name, color: p.color,
    isHuman: p.isHuman, isAI: p.isAI,
    ai: p.ai ? { difficulty: p.ai.difficulty, style: p.ai.style } : null,
    res: { ...p.res },
    commodities: p.commodities ? { ...p.commodities } : undefined,
    improvements: p.improvements ? { ...p.improvements } : undefined,
    knights: p.knights ? p.knights.map(k => ({ ...k })) : undefined,
    progress: p.progress ? p.progress.map(c => ({ ...c })) : undefined,
    merchantTurns: p.merchantTurns || 0,
    hasDefenderOfCatan: !!p.hasDefenderOfCatan,
    devCards: p.devCards.map(c => ({ type: c.type, boughtTurn: c.boughtTurn })),
    knightsPlayed: p.knightsPlayed,
    roadsLeft: p.roadsLeft, settlementsLeft: p.settlementsLeft, citiesLeft: p.citiesLeft,
    shipsLeft: p.shipsLeft,
    vpHidden: p.vpHidden,
    hasLongestRoad: p.hasLongestRoad, hasLargestArmy: p.hasLargestArmy,
    portTypes: { ...p.portTypes },
  }));
  const b = state.board;
  return {
    v: 2,
    seed: state.seed, size: state.size, shape: state.shape,
    preset: state.board.preset || null,
    winVP: state.winVP, discardThreshold: state.discardThreshold,
    friendlyRobber: state.friendlyRobber, turnTimer: state.turnTimer,
    undoAllowed: !!state.undoAllowed,
    undoStack: (state.undoStack || []).map(u => ({ ...u, refund: u.refund ? { ...u.refund } : null })),
    expansions: state.expansions ? { seafarers: !!state.expansions.seafarers, cnk: !!state.expansions.cnk } : { seafarers: false, cnk: false },
    pirate: state.pirate != null ? state.pirate : null,
    islandBonus: state.islandBonus ? { ...state.islandBonus } : {},
    barbarian: state.barbarian ? { ...state.barbarian } : null,
    progressPlayedThisTurn: !!state.progressPlayedThisTurn,
    progressDecks: state.progressDecks ? {
      politics: [...state.progressDecks.politics],
      science: [...state.progressDecks.science],
      trade: [...state.progressDecks.trade],
    } : undefined,
    progressDiscards: state.progressDiscards ? {
      politics: [...state.progressDiscards.politics],
      science: [...state.progressDiscards.science],
      trade: [...state.progressDiscards.trade],
    } : undefined,
    players,
    turn: state.turn, turnCount: state.turnCount, phase: state.phase,
    rolled: state.rolled,
    dice: state.dice ? [...state.dice] : null,
    robber: state.robber,
    lastProduced: state.lastProduced ? [...state.lastProduced] : [],
    lastGains: state.lastGains ? state.lastGains.map(g => ({ hid: g.hid, gains: g.gains.map(x => ({ pid: x.pid, amt: x.amt, kind: x.kind })) })) : [],
    gainsId: state.gainsId || 0,
    devPlayedThisTurn: state.devPlayedThisTurn,
    devDeck: [...state.devDeck],
    devDiscard: [...state.devDiscard],
    discardsLeft: state.discardsLeft.map(d => ({ pid: d.pid, count: d.count })),
    longestRoad: { ...state.longestRoad },
    largestArmy: { ...state.largestArmy },
    winner: state.winner,
    setup: state.setup ? { index: state.setup.index, step: state.setup.step } : null,
    pending: serializePending(state.pending),
    trades: (state.trades || []).map(t => ({ ...t })),
    board: {
      vOwners: b.vertices.map(v => v.owner === undefined ? -1 : v.owner),
      vTypes: b.vertices.map(v => (v.type === 'city' ? 'city' : v.type === 'settlement' ? 'settlement' : '')),
      eOwners: b.edges.map(e => e.owner === undefined ? -1 : e.owner),
      eKinds: b.edges.map(e => e.kind || 'road'),
    },
    log: state.log.slice(-80).map(l => ({ t: l.t, msg: l.msg, turn: l.turn })),
  };
}

function serializePending(p) {
  if (!p) return null;
  const out = {
    type: p.type,
    playerId: p.playerId,
    atVertex: p.atVertex,
    count: p.count,
    free: p.free,
    reason: p.reason,
    resources: p.resources ? [...p.resources] : undefined,
  };
  if (p.valid) out.valid = [...p.valid];
  return out;
}

export function deserializeGame(save) {
  const players = save.players.map(p => ({
    name: p.name, color: p.color, isHuman: p.isHuman !== false, isAI: !!p.isAI,
    ai: p.ai ? { difficulty: p.ai.difficulty, style: p.ai.style } : null,
  }));
  const state = createGame({ seed: save.seed, size: save.size, shape: save.shape, preset: save.preset || null, players,
    winVP: save.winVP ?? 10, discardThreshold: save.discardThreshold ?? 7,
    friendlyRobber: !!save.friendlyRobber, turnTimer: save.turnTimer ?? 0,
    undoAllowed: !!save.undoAllowed,
    seafarers: !!(save.expansions && save.expansions.seafarers), cnk: !!(save.expansions && save.expansions.cnk) });
  const b = state.board;

  save.board.vOwners.forEach((o, i) => { if (o >= 0) b.vertices[i].owner = o; });
  save.board.vTypes.forEach((t, i) => { if (t) b.vertices[i].type = t; });
  save.board.eOwners.forEach((o, i) => { if (o >= 0) b.edges[i].owner = o; });
  if (save.board.eKinds) save.board.eKinds.forEach((k, i) => { if (b.edges[i].owner >= 0) b.edges[i].kind = k || 'road'; });
  else save.board.eOwners.forEach((o, i) => { if (o >= 0) b.edges[i].kind = 'road'; });

  state.turn = save.turn;
  state.turnCount = save.turnCount;
  state.phase = save.phase;
  state.rolled = !!save.rolled;
  state.dice = save.dice ? [...save.dice] : null;
  state.robber = save.robber;
  state.pirate = save.pirate != null ? save.pirate : (state.pirate != null ? state.pirate : null);
  state.islandBonus = save.islandBonus ? { ...save.islandBonus } : {};
  state.lastProduced = save.lastProduced ? [...save.lastProduced] : [];
  state.lastGains = save.lastGains ? save.lastGains.map(g => ({ hid: g.hid, gains: g.gains.map(x => ({ pid: x.pid, amt: x.amt, kind: x.kind })) })) : [];
  state.gainsId = save.gainsId || 0;
  state.devPlayedThisTurn = !!save.devPlayedThisTurn;
  state.devDeck = [...save.devDeck];
  state.devDiscard = [...save.devDiscard];
  state.discardsLeft = save.discardsLeft.map(d => ({ pid: d.pid, count: d.count }));
  state.longestRoad = { ...save.longestRoad };
  state.largestArmy = { ...save.largestArmy };
  state.winner = save.winner;
  state.trades = (save.trades || []).map(t => ({ ...t }));
  state.log = (save.log || []).map(l => ({ t: l.t, msg: l.msg, turn: l.turn }));
  state.undoStack = (save.undoStack || []).map(u => ({ ...u, refund: u.refund ? { ...u.refund } : null }));
  if (save.barbarian) state.barbarian = { ...save.barbarian };
  state.progressPlayedThisTurn = !!save.progressPlayedThisTurn;
  if (save.progressDecks) {
    state.progressDecks = {
      politics: [...(save.progressDecks.politics || [])],
      science: [...(save.progressDecks.science || [])],
      trade: [...(save.progressDecks.trade || [])],
    };
    state.progressDiscards = {
      politics: [...(save.progressDiscards ? save.progressDiscards.politics || [] : [])],
      science: [...(save.progressDiscards ? save.progressDiscards.science || [] : [])],
      trade: [...(save.progressDiscards ? save.progressDiscards.trade || [] : [])],
    };
  }

  save.players.forEach((p, i) => {
    const st = state.players[i];
    st.res = { ...p.res };
    if (p.commodities) {
      st.commodities = { paper: p.commodities.paper || 0, coin: p.commodities.coin || 0, cloth: p.commodities.cloth || 0 };
      st.improvements = { politics: p.improvements.politics || 0, science: p.improvements.science || 0, trade: p.improvements.trade || 0 };
      st.knights = (p.knights || []).map(k => ({ ...k }));
      st.progress = (p.progress || []).map(c => ({ ...c }));
      st.merchantTurns = p.merchantTurns || 0;
      st.hasDefenderOfCatan = !!p.hasDefenderOfCatan;
    }
    st.devCards = (p.devCards || []).map(c => ({ type: c.type, boughtTurn: c.boughtTurn }));
    st.knightsPlayed = p.knightsPlayed || 0;
    st.roadsLeft = p.roadsLeft; st.settlementsLeft = p.settlementsLeft; st.citiesLeft = p.citiesLeft;
    st.shipsLeft = p.shipsLeft != null ? p.shipsLeft : 15;
    st.vpHidden = p.vpHidden || 0;
    st.hasLongestRoad = !!p.hasLongestRoad; st.hasLargestArmy = !!p.hasLargestArmy;
    st.portTypes = { ...p.portTypes };
  });

  if (save.setup) {
    state.setup = { order: state.setup.order, index: save.setup.index, step: save.setup.step };
  }
  state.pending = save.pending ? { ...save.pending } : null;
  if (state.pending) {
    delete state.pending.valid;
    if (state.pending.type === 'settlement') {
      state.pending.valid = validSettlementSpots(state, state.pending.playerId);
    } else if (state.pending.type === 'city') {
      state.pending.valid = validCitySpots(state, state.pending.playerId);
    } else if (state.pending.type === 'road') {
      state.pending.valid = validRoadSpots(state, state.pending.playerId);
    } else if (state.pending.type === 'ship') {
      state.pending.valid = validShipSpots(state, state.pending.playerId);
    }
  }
  return state;
}
