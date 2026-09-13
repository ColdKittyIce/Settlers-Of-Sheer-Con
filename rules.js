import { RESOURCES, generateBoard } from './board.js';
import { makeRng, snd } from './rand.js';
import { cnkInit, cnkProduceHex, setRulesHooks, buildImprovement, validKnightSpots, startBuildKnight, buildKnight, upgradeKnight, activateKnight, playProgressCard, resolveAlchemist, resolveCrane, resolveIntrigue, resolveMonopolyC, deactivateAllKnights, merchantActive, activeStrength, improvementCost, canAffordImprovement, totalImprovements, totalCities, updateDefender, pickBestNumber } from './cnk.js';

export const DEV_TYPES = ['knight', 'road', 'year', 'monopoly', 'vp'];
export const DEV_INFO = {
  knight:   { name: 'Knight',          desc: 'Move the robber and steal a resource card from an adjacent player.' },
  road:     { name: 'Road Building',   desc: 'Place 2 roads for free.' },
  year:     { name: 'Year of Plenty',  desc: 'Take any 2 resources from the bank.' },
  monopoly: { name: 'Monopoly',        desc: 'Take all of one resource from every other player.' },
  vp:       { name: 'Victory Point',   desc: 'Worth 1 victory point. Keep hidden until the end.' },
};

export const WIN_VP = 10;

export function createGame(opts = {}) {
  const seed = opts.seed ?? 'pioneers';
  const size = opts.size ?? 'standard';
  const shape = opts.shape ?? 'classic';
  const preset = opts.preset ?? null;
  const players = opts.players || [];
  const winVP = opts.winVP ?? 10;
  const discardThreshold = opts.discardThreshold ?? 7;
  const friendlyRobber = !!opts.friendlyRobber;
  const turnTimer = opts.turnTimer ?? 0;
  const seafarers = !!opts.seafarers;
  const cnk = !!opts.cnk;
  const board = generateBoard({ seed, size, shape, preset, hexSize: 38, seafarers });
  const devRng = makeRng(String(seed) + '::devdeck');
  const big = players.length > 4;
  const counts = big ? { knight: 18, vp: 7, road: 3, year: 3, monopoly: 3 }
                     : { knight: 14, vp: 5, road: 2, year: 2, monopoly: 2 };
  const deck = [];
  if (!cnk) {
    for (const t of Object.keys(counts)) for (let i = 0; i < counts[t]; i++) deck.push(t);
  }
  const shuffledDeck = devRng.shuffle(deck);

  const n = players.length;
  const state = {
    v: 1,
    seed, size, shape,
    board,
    players: players.map((p, i) => ({
      id: i,
      name: p.name || 'Player ' + (i + 1),
      color: p.color || '#e74c3c',
      isHuman: p.isHuman !== false,
      isAI: !!p.isAI,
      ai: p.ai || null,
      connected: true,
      res: { brick: 0, lumber: 0, wool: 0, grain: 0, ore: 0 },
      devCards: [],
      knightsPlayed: 0,
      roadsLeft: 15, settlementsLeft: 5, citiesLeft: 4, shipsLeft: 15,
      vpHidden: 0,
      hasLongestRoad: false, hasLargestArmy: false,
      portTypes: { generic: false, brick: false, lumber: false, wool: false, grain: false, ore: false },
    })),
    turn: 0,
    turnCount: 0,
    phase: 'setup',
    setup: null,
    winVP, discardThreshold, friendlyRobber, turnTimer,
    undoAllowed: !!opts.undoAllowed,
    undoStack: [],
    expansions: { seafarers, cnk },
    rolled: false,
    dice: null,
    lastProduced: [],
    lastGains: [],
    gainsId: 0,
    robber: null,
    pirate: null,
    islandBonus: {},
    devPlayedThisTurn: false,
    pending: null,
    discardsLeft: [],
    longestRoad: { player: -1, len: 0 },
    largestArmy: { player: -1, count: 0 },
    devDeck: shuffledDeck,
    devDiscard: [],
    trades: [],
    log: [],
    winner: -1,
  };

  const order = [];
  for (let i = 0; i < n; i++) order.push(i);
  for (let i = n - 1; i >= 0; i--) order.push(i);
  const setupRng = makeRng(String(seed) + '::setupOrder');
  const start = n ? setupRng.int(n) : 0;
  const rotated = order.slice(start).concat(order.slice(0, start));
  state.setup = { order: rotated, index: 0, step: 0 };

  const deserts = board.hexes.filter(h => h.resource === 'desert');
  state.robber = deserts.length ? deserts[Math.floor(deserts.length / 2)].id : board.hexes[0].id;
  if (seafarers) {
    const seas = board.hexes.filter(h => h.isSea);
    if (seas.length) state.pirate = seas[Math.floor(Math.random() * seas.length)].id;
  }
  if (cnk) cnkInit(state);

  state.pending = { type: 'setupSettlement', playerId: state.setup.order[0] };
  log(state, 'The game begins. ' + players.length + ' players, ' + size + ' ' + shape + ' island.');

  return state;
}

export function log(state, msg) {
  state.log.push({ t: Date.now(), msg, turn: state.turnCount });
  if (state.log.length > 300) state.log.splice(0, state.log.length - 300);
}

export function currentPlayer(state) { return state.players[state.turn]; }
export function totalRes(p) { return p.res.brick + p.res.lumber + p.res.wool + p.res.grain + p.res.ore; }
export function setupPlayer(state) { return state.players[state.setup.order[state.setup.index]]; }
export function isSetupSecondPass(state) { return state.setup.index >= state.players.length; }

export function vertexBlockedByNeighbor(b, vid) {
  for (const nid of b.vertexNeighbors[vid]) {
    if (b.vertices[nid].owner !== undefined) return true;
  }
  return false;
}

export function vertexTouchesLand(b, vid) {
  for (const hid of b.vertices[vid].hexes) {
    if (!b.hexes[hid].isSea) return true;
  }
  return false;
}

function grantPort(state, p, vid) {
  const v = state.board.vertices[vid];
  if (v.port) {
    if (v.port.type === 'generic') p.portTypes.generic = true;
    else p.portTypes[v.port.type] = true;
  }
}

// ---------------- SETUP ----------------

export function placeSetupSettlement(state, vid) {
  if (state.phase !== 'setup') throw new Error('Not in setup');
  const pend = state.pending;
  if (!pend || pend.type !== 'setupSettlement') throw new Error('Not placing a setup settlement');
  const b = state.board;
  const v = b.vertices[vid];
  if (!v) throw new Error('Bad vertex');
  if (v.owner !== undefined) throw new Error('Vertex occupied');
  if (vertexBlockedByNeighbor(b, vid)) throw new Error('Too close to another settlement');
  const pIdx = state.setup.order[state.setup.index];
  const p = state.players[pIdx];
  const secondPass = isSetupSecondPass(state);
  v.owner = pIdx;
  v.type = 'settlement';
  p.settlementsLeft--;
  grantPort(state, p, vid);
  if (secondPass) {
    const got = [];
    for (const hid of v.hexes) {
      const h = b.hexes[hid];
      if (h.resource !== 'desert' && h.resource !== 'sea') {
        p.res[h.resource]++;
        got.push(h.resource);
      }
    }
    log(state, p.name + ' places 2nd settlement and gains starting resources' + (got.length ? ' (' + got.join(', ') + ')' : ''));
  } else {
    log(state, p.name + ' places a settlement' + (v.port ? ' on a ' + portLabel(v.port) + ' port' : ''));
  }
  state.pending = { type: 'setupRoad', playerId: pIdx, atVertex: vid };
  state.setup.step = 1;
  snd('place');
  return state;
}

export function placeSetupRoad(state, eid) {
  if (state.phase !== 'setup') throw new Error('Not in setup');
  const pend = state.pending;
  if (!pend || pend.type !== 'setupRoad') throw new Error('Not placing a setup road');
  const b = state.board;
  const e = b.edges[eid];
  if (!e) throw new Error('Bad edge');
  if (e.owner !== undefined) throw new Error('Edge occupied');
  if (e.isSeaEdge) throw new Error('Roads cannot be built on water');
  if (e.v1 !== pend.atVertex && e.v2 !== pend.atVertex) throw new Error('Road must touch your new settlement');
  const pIdx = state.setup.order[state.setup.index];
  e.owner = pIdx;
  e.kind = 'road';
  state.players[pIdx].roadsLeft--;
  state.setup.index++;
  state.setup.step = 0;
  if (state.setup.index >= state.setup.order.length) {
    const starter = state.setup.order[0];
    state.phase = 'action';
    state.setup = null;
    state.turn = starter;
    state.pending = null;
    log(state, 'Setup complete. ' + state.players[starter].name + ' takes the first turn.');
  } else {
    state.pending = { type: 'setupSettlement', playerId: state.setup.order[state.setup.index] };
  }
  snd('place');
  return state;
}

export function validSetupSettlements(state) {
  const out = [];
  const b = state.board;
  for (const v of b.vertices) {
    if (v.owner !== undefined || vertexBlockedByNeighbor(b, v.id) || !vertexTouchesLand(b, v.id)) continue;
    let hasRoad = false;
    for (const eid of b.vertexEdges[v.id]) {
      const e = b.edges[eid];
      if (e.owner === undefined && !e.isSeaEdge) { hasRoad = true; break; }
    }
    if (!hasRoad) continue;
    out.push(v.id);
  }
  return out;
}

export function validSetupRoads(state) {
  const pend = state.pending;
  const out = [];
  if (!pend || pend.type !== 'setupRoad') return out;
  for (const eid of state.board.vertexEdges[pend.atVertex]) {
    const e = state.board.edges[eid];
    if (e.owner === undefined && !e.isSeaEdge) out.push(eid);
  }
  return out;
}

// ---------------- ROLL / PRODUCTION ----------------

export function rollDice(state) {
  if (state.phase !== 'action' || state.rolled) throw new Error('Cannot roll now');
  state.undoStack = [];
  const d1 = 1 + Math.floor(Math.random() * 6);
  const d2 = 1 + Math.floor(Math.random() * 6);
  state.dice = [d1, d2];
  state.rolled = true;
  state.lastProduced = [];
  state.lastGains = [];
  state.gainsId = (state.gainsId || 0) + 1;
  const sum = d1 + d2;
  if (sum === 7) {
    log(state, currentPlayer(state).name + ' rolls a 7 — the robber stirs!');
    state.discardsLeft = [];
    const thresh = state.discardThreshold;
    if (thresh !== 'never' && thresh > 0) {
      for (const p of state.players) {
        const tot = totalRes(p);
        if (tot > thresh) state.discardsLeft.push({ pid: p.id, count: Math.floor(tot / 2) });
      }
    }
    if (state.discardsLeft.length > 0) {
      state.phase = 'discard';
      state.pending = { type: 'discard', playerId: state.discardsLeft[0].pid };
    } else if (state.friendlyRobber) {
      state.phase = 'action';
      state.pending = null;
      log(state, 'Friendly robber: the robber stays put, no one is robbed.');
    } else {
      state.phase = 'moveRobber';
      state.pending = { type: 'robber', playerId: state.turn, reason: 'seven' };
    }
  } else {
    log(state, currentPlayer(state).name + ' rolls ' + d1 + ' + ' + d2 + ' = ' + sum);
    produce(state, sum);
    state.phase = 'action';
  }
  snd('dice');
  return state;
}

const GOLD_NEED_BASE = { brick: 3, lumber: 3, wool: 2, grain: 2.5, ore: 2.5 };
function neediestRes(state, pid) {
  const p = state.players[pid];
  let best = RESOURCES[0], bestS = -Infinity;
  for (const r of RESOURCES) {
    const s = GOLD_NEED_BASE[r] * (1 + 1.2 / (1 + p.res[r]));
    if (s > bestS) { bestS = s; best = r; }
  }
  return best;
}

function produce(state, sum) {
  const b = state.board;
  state.lastGains = state.lastGains || [];
  for (const h of b.hexes) {
    if (h.number !== sum || h.id === state.robber) continue;
    state.lastProduced.push(h.id);
    const got = {};
    const gainsList = [];
    const gold = h.resource === 'gold';
    for (const vid of h.vertexIds) {
      const v = b.vertices[vid];
      if (v.owner === undefined) continue;
      const p = state.players[v.owner];
      const amt = v.type === 'city' ? 2 : 1;
      const r = gold ? neediestRes(state, v.owner) : h.resource;
      let kind = gold ? 'gold' : h.resource;
      if (state.expansions.cnk) {
        const k = cnkProduceHex(state, h, p, amt, r);
        if (k) kind = k;
      } else {
        p.res[r] += amt;
      }
      got[p.id] = (got[p.id] || 0) + amt;
      gainsList.push({ pid: p.id, amt, kind });
    }
    if (gainsList.length) state.lastGains.push({ hid: h.id, gains: gainsList });
    const ids = Object.keys(got);
    if (ids.length) {
      const names = ids.map(pid => state.players[+pid].name + ' +' + got[pid]);
      log(state, (gold ? 'gold' : h.resource) + ' on ' + h.number + ' yields ' + names.join(', '));
    }
  }
}

export function discard(state, pid, choices) {
  if (state.phase !== 'discard') throw new Error('Not discarding');
  const idx = state.discardsLeft.findIndex(d => d.pid === pid);
  if (idx < 0) throw new Error('This player does not need to discard');
  const entry = state.discardsLeft[idx];
  if (!Array.isArray(choices) || choices.length !== entry.count) throw new Error('Wrong discard count');
  const p = state.players[pid];
  for (const r of choices) {
    if (!RESOURCES.includes(r) || p.res[r] <= 0) throw new Error('Bad discard choice');
    p.res[r]--;
  }
  state.discardsLeft.splice(idx, 1);
  log(state, p.name + ' discards ' + entry.count + ' cards.');
  if (state.discardsLeft.length === 0) {
    if (state.friendlyRobber) {
      state.phase = 'action';
      state.pending = null;
      log(state, 'Friendly robber: the robber stays put, no one is robbed.');
    } else {
      state.phase = 'moveRobber';
      state.pending = { type: 'robber', playerId: state.turn, reason: 'seven' };
    }
  } else {
    state.pending = { type: 'discard', playerId: state.discardsLeft[0].pid };
  }
  return state;
}

// ---------------- ROBBER / STEAL ----------------

export function placeRobber(state, hid) {
  const pend = state.pending;
  if (!pend || pend.type !== 'robber') throw new Error('Cannot place robber now');
  const h = state.board.hexById.get(hid);
  if (!h) throw new Error('Bad hex');
  if (h.isSea) throw new Error('Cannot place the robber at sea');
  if (hid === state.robber) throw new Error('Robber must move');
  state.robber = hid;
  const p = currentPlayer(state);
  const adjacent = new Set();
  for (const vid of h.vertexIds) {
    const v = state.board.vertices[vid];
    if (v.owner !== undefined && v.owner !== p.id) adjacent.add(v.owner);
  }
  const targets = [...adjacent].filter(pid => totalRes(state.players[pid]) > 0);
  log(state, p.name + ' moves the robber to ' + h.resource + '.');
  if (pend.reason === 'bishop') {
    state.pending = null;
    state.phase = 'action';
    log(state, 'The Bishop protects everyone — no cards are stolen.');
  } else if (targets.length === 0) {
    state.pending = null;
    state.phase = 'action';
  } else {
    state.pending = { type: 'steal', playerId: p.id, from: targets, reason: pend.reason };
    state.phase = 'steal';
  }
  snd('robber');
  return state;
}

export function placePirate(state, hid) {
  const pend = state.pending;
  if (!pend || pend.type !== 'robber') throw new Error('Cannot move the pirate now');
  const h = state.board.hexById.get(hid);
  if (!h) throw new Error('Bad hex');
  if (!h.isSea) throw new Error('Cannot place the pirate on land');
  if (hid === state.pirate) throw new Error('Pirate must move');
  state.pirate = hid;
  const p = currentPlayer(state);
  log(state, p.name + ' moves the pirate to a new sea hex.');
  state.pending = null;
  state.phase = 'action';
  checkWin(state);
  snd('ship');
  return state;
}

export function stealFrom(state, targetPid) {
  const pend = state.pending;
  if (!pend || pend.type !== 'steal') throw new Error('Cannot steal now');
  const p = currentPlayer(state);
  const t = state.players[targetPid];
  const pool = [];
  for (const r of RESOURCES) for (let i = 0; i < t.res[r]; i++) pool.push(r);
  if (!pool.length) throw new Error('Target has no cards');
  const r = pool[Math.floor(Math.random() * pool.length)];
  t.res[r]--;
  p.res[r]++;
  log(state, p.name + ' steals 1 ' + r + ' from ' + t.name + '.');
  state.pending = null;
  state.phase = 'action';
  checkWin(state);
  snd('steal');
  return state;
}

// ---------------- BUILDING ----------------

export function startBuildSettlement(state) {
  if (state.phase !== 'action') throw new Error('Not your turn phase');
  const p = currentPlayer(state);
  if (!p.isHuman) throw new Error('AI builds itself');
  state.pending = { type: 'settlement', playerId: p.id, valid: validSettlementSpots(state, p.id) };
  return state;
}

export function startBuildCity(state) {
  const p = currentPlayer(state);
  state.pending = { type: 'city', playerId: p.id, valid: validCitySpots(state, p.id) };
  return state;
}

export function startBuildRoad(state) {
  const p = currentPlayer(state);
  state.pending = { type: 'road', playerId: p.id, valid: validRoadSpots(state, p.id) };
  return state;
}

export function cancelPending(state) {
  state.pending = null;
  return state;
}

export function validSettlementSpots(state, pid) {
  const b = state.board;
  const out = [];
  for (const v of b.vertices) {
    if (v.owner !== undefined) continue;
    if (vertexBlockedByNeighbor(b, v.id)) continue;
    if (!vertexTouchesLand(b, v.id)) continue;
    let conn = false;
    for (const eid of b.vertexEdges[v.id]) {
      if (b.edges[eid].owner === pid) { conn = true; break; }
    }
    if (!conn) continue;
    out.push(v.id);
  }
  return out;
}

export function validCitySpots(state, pid) {
  const out = [];
  for (const v of state.board.vertices) {
    if (v.owner === pid && v.type === 'settlement') out.push(v.id);
  }
  return out;
}

export function validRoadSpots(state, pid) {
  const b = state.board;
  const out = [];
  for (const e of b.edges) {
    if (e.owner !== undefined || e.isSeaEdge) continue;
    const v1 = b.vertices[e.v1], v2 = b.vertices[e.v2];
    if (v1.owner === pid || v2.owner === pid) { out.push(e.id); continue; }
    for (const nid of [e.v1, e.v2]) {
      let conn = false;
      for (const e2id of b.vertexEdges[nid]) {
        if (b.edges[e2id].owner === pid) { conn = true; break; }
      }
      if (conn) { out.push(e.id); break; }
    }
  }
  return out;
}

function pirateBlocksEdge(state, eid) {
  if (!state.expansions || !state.expansions.seafarers || state.pirate == null) return false;
  return state.board.edges[eid].hexes.includes(state.pirate);
}

export function validShipSpots(state, pid) {
  const b = state.board;
  const out = [];
  for (const e of b.edges) {
    if (e.owner !== undefined || !e.isSeaEdge || pirateBlocksEdge(state, e.id)) continue;
    const v1 = b.vertices[e.v1], v2 = b.vertices[e.v2];
    if (v1.owner === pid || v2.owner === pid) { out.push(e.id); continue; }
    for (const nid of [e.v1, e.v2]) {
      let conn = false;
      for (const e2id of b.vertexEdges[nid]) {
        if (b.edges[e2id].owner === pid) { conn = true; break; }
      }
      if (conn) { out.push(e.id); break; }
    }
  }
  return out;
}

function payRes(p, cost) {
  for (const r of RESOURCES) {
    if (p.res[r] < (cost[r] || 0)) throw new Error('Not enough ' + r);
  }
  for (const r of RESOURCES) p.res[r] -= cost[r] || 0;
}

export function buildSettlement(state, vid, opts = {}) {
  const pend = state.pending;
  if (state.phase !== 'action' || !pend || pend.type !== 'settlement') throw new Error('Cannot build settlement now');
  const p = currentPlayer(state);
  if (p.settlementsLeft <= 0) throw new Error('No settlements left');
  if (!validSettlementSpots(state, p.id).includes(vid)) throw new Error('Illegal settlement spot');
  const cost = { brick: 1, lumber: 1, wool: 1, grain: 1 };
  if (!opts.free) payRes(p, cost);
  const v = state.board.vertices[vid];
  v.owner = p.id;
  v.type = 'settlement';
  p.settlementsLeft--;
  grantPort(state, p, vid);
  let claimedIsland;
  if (state.expansions && state.expansions.seafarers) {
    for (const hid of v.hexes) {
      const isl = state.board.islandOf.get(hid);
      if (isl !== undefined && isl > 0 && state.islandBonus[isl] === undefined) {
        state.islandBonus[isl] = p.id;
        p.vpHidden += 2;
        claimedIsland = isl;
        log(state, p.name + ' claims a new island (+2 victory points)!');
        break;
      }
    }
  }
  log(state, p.name + ' builds a settlement' + (v.port ? ' on a ' + portLabel(v.port) + ' port' : ''));
  state.pending = null;
  checkWin(state);
  pushUndo(state, { type: 'settlement', pid: p.id, vid, refund: { brick: 1, lumber: 1, wool: 1, grain: 1 }, island: claimedIsland, portType: v.port ? (v.port.type === 'generic' ? 'generic' : v.port.type) : null });
  snd('build');
  return state;
}

export function buildCity(state, vid) {
  const pend = state.pending;
  if (state.phase !== 'action' || !pend || pend.type !== 'city') throw new Error('Cannot build city now');
  const p = currentPlayer(state);
  if (p.citiesLeft <= 0) throw new Error('No cities left');
  if (!validCitySpots(state, p.id).includes(vid)) throw new Error('Illegal city spot');
  const cost = { grain: 2, ore: 3 };
  payRes(p, cost);
  const v = state.board.vertices[vid];
  v.type = 'city';
  p.citiesLeft--;
  log(state, p.name + ' builds a city');
  state.pending = null;
  checkWin(state);
  pushUndo(state, { type: 'city', pid: p.id, vid, refund: { grain: 2, ore: 3 } });
  snd('city');
  return state;
}

export function buildRoad(state, eid, opts = {}) {
  const pend = state.pending;
  if (state.phase !== 'action' || !pend || pend.type !== 'road') throw new Error('Cannot build road now');
  const p = currentPlayer(state);
  if (p.roadsLeft <= 0) throw new Error('No roads left');
  if (!validRoadSpots(state, p.id).includes(eid)) throw new Error('Illegal road spot');
  const cost = { brick: 1, lumber: 1 };
  if (!opts.free) payRes(p, cost);
  const e = state.board.edges[eid];
  e.owner = p.id;
  e.kind = 'road';
  p.roadsLeft--;
  if (pend.count !== undefined) {
    pend.count--;
    if (pend.count <= 0) {
      state.pending = null;
      log(state, p.name + ' finishes placing roads.');
    } else {
      pend.valid = validRoadSpots(state, p.id);
    }
  } else {
    state.pending = null;
  }
  log(state, p.name + ' builds a road');
  updateLongestRoad(state);
  pushUndo(state, { type: 'road', pid: p.id, eid, refund: opts.free ? null : { brick: 1, lumber: 1 } });
  snd('build');
  return state;
}

export function startBuildShip(state) {
  const p = currentPlayer(state);
  state.pending = { type: 'ship', playerId: p.id, valid: validShipSpots(state, p.id) };
  return state;
}

export function buildShip(state, eid) {
  const pend = state.pending;
  if (state.phase !== 'action' || !pend || pend.type !== 'ship') throw new Error('Cannot build ship now');
  const p = currentPlayer(state);
  if (p.shipsLeft <= 0) throw new Error('No ships left');
  if (!validShipSpots(state, p.id).includes(eid)) throw new Error('Illegal ship spot');
  const cost = { lumber: 1, wool: 1 };
  payRes(p, cost);
  const e = state.board.edges[eid];
  e.owner = p.id;
  e.kind = 'ship';
  p.shipsLeft--;
  state.pending = null;
  log(state, p.name + ' builds a ship');
  updateLongestRoad(state);
  pushUndo(state, { type: 'ship', pid: p.id, eid, refund: { lumber: 1, wool: 1 } });
  snd('ship');
  return state;
}

function pushUndo(state, rec) {
  if (!state.undoAllowed || state.phase !== 'action') return;
  state.undoStack = state.undoStack || [];
  state.undoStack.push(rec);
  if (state.undoStack.length > 20) state.undoStack.shift();
}

function refundRes(p, cost) {
  if (!cost) return;
  for (const r of Object.keys(cost)) p.res[r] += cost[r] || 0;
}

function recomputePorts(state, pid) {
  const p = state.players[pid];
  p.portTypes = { generic: false, brick: false, lumber: false, wool: false, grain: false, ore: false };
  for (const v of state.board.vertices) {
    if (v.owner === pid && v.port) {
      if (v.port.type === 'generic') p.portTypes.generic = true;
      else p.portTypes[v.port.type] = true;
    }
  }
}

export function undoBuild(state) {
  if (state.phase !== 'action') throw new Error('Cannot undo now');
  if (!state.undoAllowed) throw new Error('Undo is not enabled');
  const stack = state.undoStack || [];
  const rec = stack[stack.length - 1];
  if (!rec || rec.pid !== state.turn) throw new Error('Nothing to undo');
  stack.pop();
  const p = state.players[rec.pid];
  if (state.winner >= 0) { state.winner = -1; state.phase = 'action'; }
  switch (rec.type) {
    case 'settlement': {
      const v = state.board.vertices[rec.vid];
      if (v.owner !== rec.pid) throw new Error('Nothing to undo');
      v.owner = undefined; v.type = undefined;
      p.settlementsLeft++;
      refundRes(p, rec.refund);
      recomputePorts(state, rec.pid);
      if (rec.island !== undefined && state.islandBonus[rec.island] === rec.pid) {
        const stillThere = state.board.vertices.some(x => x.owner === rec.pid && x.hexes.some(hid => state.board.islandOf.get(hid) === rec.island));
        if (!stillThere) { delete state.islandBonus[rec.island]; p.vpHidden = Math.max(0, p.vpHidden - 2); }
      }
      log(state, p.name + ' undoes their settlement.');
      break;
    }
    case 'city': {
      const v = state.board.vertices[rec.vid];
      if (v.owner !== rec.pid || v.type !== 'city') throw new Error('Nothing to undo');
      v.type = 'settlement';
      p.citiesLeft++;
      refundRes(p, rec.refund);
      log(state, p.name + ' undoes their city build.');
      break;
    }
    case 'road': {
      const e = state.board.edges[rec.eid];
      if (e.owner !== rec.pid) throw new Error('Nothing to undo');
      e.owner = undefined; e.kind = undefined;
      p.roadsLeft++;
      if (rec.refund) refundRes(p, rec.refund);
      updateLongestRoadRaw(state);
      log(state, p.name + ' undoes their road.');
      break;
    }
    case 'ship': {
      const e = state.board.edges[rec.eid];
      if (e.owner !== rec.pid) throw new Error('Nothing to undo');
      e.owner = undefined; e.kind = undefined;
      p.shipsLeft++;
      refundRes(p, rec.refund);
      updateLongestRoadRaw(state);
      log(state, p.name + ' undoes their ship.');
      break;
    }
    case 'knight': {
      if (rec.kIdx >= 0 && rec.kIdx < p.knights.length && p.knights[rec.kIdx].vid === rec.vid) {
        p.knights.splice(rec.kIdx, 1);
      }
      refundRes(p, rec.refund);
      updateDefender(state);
      log(state, p.name + ' undoes their knight.');
      break;
    }
    default:
      throw new Error('Nothing to undo');
  }
  checkWin(state);
  snd('undo');
  return state;
}

export function buyDevCard(state) {
  if (state.phase !== 'action') throw new Error('Cannot buy now');
  const p = currentPlayer(state);
  if (state.devDeck.length === 0) {
    if (state.devDiscard.length === 0) throw new Error('Development deck is empty');
    state.devDeck = makeRng(state.turnCount + '::reshuffle').shuffle(state.devDiscard);
    state.devDiscard = [];
  }
  const cost = { wool: 1, grain: 1, ore: 1 };
  payRes(p, cost);
  const type = state.devDeck.pop();
  p.devCards.push({ type, boughtTurn: state.turnCount });
  p.devBoughtThisTurn = true;
  log(state, p.name + ' buys a development card.');
  snd('card');
  return state;
}

export function playDevCard(state, cardIndex) {
  const p = currentPlayer(state);
  if (state.phase !== 'action') throw new Error('Cannot play dev card now');
  if (state.devPlayedThisTurn) throw new Error('Already played a development card this turn');
  const card = p.devCards[cardIndex];
  if (!card) throw new Error('No such card');
  if (card.boughtTurn === state.turnCount) throw new Error('Cannot play a card on the turn you bought it');
  if (card.type === 'vp') throw new Error('Victory points are scored automatically');
  p.devCards.splice(cardIndex, 1);
  state.devPlayedThisTurn = true;
  if (card.type === 'knight') {
    p.knightsPlayed++;
    log(state, p.name + ' plays a Knight');
    updateLargestArmy(state, p.id);
    if (state.winner < 0) {
      state.pending = { type: 'robber', playerId: p.id, reason: 'knight' };
      state.phase = 'moveRobber';
    }
  } else if (card.type === 'road') {
    log(state, p.name + ' plays Road Building');
    state.pending = { type: 'road', playerId: p.id, count: 2, free: true, valid: validRoadSpots(state, p.id) };
  } else if (card.type === 'year') {
    state.pending = { type: 'year', playerId: p.id, count: 2, resources: [] };
  } else if (card.type === 'monopoly') {
    state.pending = { type: 'monopoly', playerId: p.id };
  }
  snd('card');
  return state;
}

export function yearOfPlenty(state, choices) {
  const pend = state.pending;
  if (!pend || pend.type !== 'year') throw new Error('Not choosing year of plenty');
  const p = state.players[pend.playerId];
  if (!Array.isArray(choices) || choices.length !== 2) throw new Error('Choose exactly 2 resources');
  for (const r of choices) {
    if (!RESOURCES.includes(r)) throw new Error('Bad resource');
    p.res[r]++;
  }
  log(state, p.name + ' uses Year of Plenty to gain ' + choices.join(' & ') + '.');
  state.pending = null;
  snd('card');
  return state;
}

export function monopoly(state, res) {
  const pend = state.pending;
  if (!pend || pend.type !== 'monopoly') throw new Error('Not choosing monopoly');
  if (!RESOURCES.includes(res)) throw new Error('Bad resource');
  const p = state.players[pend.playerId];
  let total = 0;
  for (const other of state.players) {
    if (other.id === pend.playerId) continue;
    const n = other.res[res];
    other.res[res] -= n;
    total += n;
  }
  p.res[res] += total;
  log(state, p.name + ' plays Monopoly and takes ' + total + ' ' + res + (total === 1 ? '' : 's') + '.');
  state.pending = null;
  checkWin(state);
  snd('card');
  return state;
}

// ---------------- TRADE ----------------

export function getTradeRate(state, p, res) {
  if (state.expansions && state.expansions.cnk && merchantActive(p)) return 2;
  if (p.portTypes[res]) return 2;
  if (p.portTypes.generic) return 3;
  return 4;
}

export function tradeWithBank(state, giveRes, giveCount, getRes) {
  if (state.phase !== 'action') throw new Error('Cannot trade now');
  const p = currentPlayer(state);
  if (!RESOURCES.includes(giveRes) || !RESOURCES.includes(getRes)) throw new Error('Bad resource');
  const rate = getTradeRate(state, p, giveRes);
  if (giveCount !== rate) throw new Error('This port requires trading ' + rate + ':1');
  if (p.res[giveRes] < rate) throw new Error('Not enough resources');
  p.res[giveRes] -= rate;
  p.res[getRes] += 1;
  log(state, p.name + ' trades ' + rate + ' ' + giveRes + ' for 1 ' + getRes + ' at the bank/port.');
  snd('trade');
  return state;
}

export function transfer(state, fromPid, toPid, res, count) {
  const f = state.players[fromPid], t = state.players[toPid];
  if (f.res[res] < count) throw new Error('Not enough resources');
  f.res[res] -= count;
  t.res[res] += count;
  log(state, f.name + ' gives ' + count + ' ' + res + ' to ' + t.name + ' in trade.');
  return state;
}

// ---------------- END TURN / SCORING ----------------

export function endTurn(state) {
  if (state.phase !== 'action') throw new Error('Cannot end turn now');
  const p = currentPlayer(state);
  if (!state.rolled) throw new Error('You must roll before ending your turn');
  state.pending = null;
  state.rolled = false;
  state.dice = null;
  state.devPlayedThisTurn = false;
  for (const pl of state.players) pl.devBoughtThisTurn = false;
  if (state.expansions.cnk) {
    deactivateAllKnights(state);
    if (p.merchantTurns > 0) p.merchantTurns--;
    state.progressPlayedThisTurn = false;
  }
  state.turn = (state.turn + 1) % state.players.length;
  state.turnCount++;
  state.undoStack = [];
  state.phase = 'action';
  log(state, state.players[state.turn].name + "'s turn.");
  return state;
}

function computeRoadLength(state, pid) {
  const b = state.board;
  const myEdges = [];
  b.edges.forEach((e, i) => { if (e.owner === pid) myEdges.push(i); });
  if (myEdges.length < 2) return myEdges.length;
  const blocked = (vid) => b.vertices[vid].owner !== undefined && b.vertices[vid].owner !== pid;
  const adj = new Map(myEdges.map(i => [i, []]));
  for (let i = 0; i < myEdges.length; i++) {
    const a = b.edges[myEdges[i]];
    for (let j = i + 1; j < myEdges.length; j++) {
      const c = b.edges[myEdges[j]];
      let shared = -1;
      if (a.v1 === c.v1 || a.v1 === c.v2) shared = a.v1;
      else if (a.v2 === c.v1 || a.v2 === c.v2) shared = a.v2;
      if (shared >= 0 && !blocked(shared)) {
        adj.get(myEdges[i]).push(myEdges[j]);
        adj.get(myEdges[j]).push(myEdges[i]);
      }
    }
  }
  let best = 0;
  const visited = new Set();
  const dfs = (node, depth) => {
    if (depth > best) best = depth;
    for (const nb of adj.get(node)) {
      if (!visited.has(nb)) {
        visited.add(nb);
        dfs(nb, depth + 1);
        visited.delete(nb);
      }
    }
  };
  for (const e of myEdges) {
    visited.add(e);
    dfs(e, 1);
    visited.delete(e);
  }
  return best;
}

function updateLongestRoadRaw(state) {
  const lens = state.players.map((_, i) => computeRoadLength(state, i));
  const maxLen = Math.max(0, ...lens);
  const prev = state.longestRoad.player;
  let holder = -1;
  if (maxLen >= 5) {
    const cands = [];
    lens.forEach((l, i) => { if (l === maxLen) cands.push(i); });
    if (cands.includes(prev)) holder = prev;
    else holder = cands[0];
  }
  for (const p of state.players) p.hasLongestRoad = false;
  if (holder >= 0) {
    state.players[holder].hasLongestRoad = true;
    state.longestRoad = { player: holder, len: maxLen };
    log(state, state.players[holder].name + ' claims the Longest Road (' + maxLen + ' roads).');
  } else {
    state.longestRoad = { player: -1, len: 0 };
  }
}

function updateLongestRoad(state) {
  updateLongestRoadRaw(state);
  checkWin(state);
}

function updateLargestArmy(state, pid) {
  const p = state.players[pid];
  const prev = state.largestArmy.player;
  if (p.knightsPlayed >= 3 && p.knightsPlayed > (prev >= 0 ? state.players[prev].knightsPlayed : 0)) {
    for (const pl of state.players) pl.hasLargestArmy = false;
    state.players[pid].hasLargestArmy = true;
    state.largestArmy = { player: pid, count: p.knightsPlayed };
    log(state, p.name + ' claims the Largest Army (' + p.knightsPlayed + ' knights).');
  }
  checkWin(state);
}

export function computeVP(state, pid) {
  const p = state.players[pid];
  let vp = 0;
  for (const v of state.board.vertices) {
    if (v.owner === pid) vp += v.type === 'city' ? 2 : 1;
  }
  vp += p.vpHidden;
  if (p.hasLongestRoad) vp += 2;
  if (p.hasLargestArmy) vp += 2;
  if (state.expansions && state.expansions.cnk && p.hasDefenderOfCatan) vp += 2;
  return vp;
}

export function countVP(state) {
  return state.players.map((_, i) => computeVP(state, i));
}

export function checkWin(state) {
  if (state.winner >= 0) return;
  const vps = countVP(state);
  for (let i = 0; i < vps.length; i++) {
    if (vps[i] >= state.winVP) {
      state.winner = i;
      state.phase = 'gameOver';
      log(state, state.players[i].name + ' reaches ' + vps[i] + ' victory points and WINS the game!');
      break;
    }
  }
}

export function portLabel(port) {
  if (port.type === 'generic') return '3:1';
  return '2:1 ' + port.type;
}

setRulesHooks({ produce, checkWin });

export { buildImprovement, validKnightSpots, startBuildKnight, buildKnight, upgradeKnight, activateKnight, playProgressCard, resolveAlchemist, resolveCrane, resolveIntrigue, resolveMonopolyC, merchantActive, activeStrength, improvementCost, canAffordImprovement, totalImprovements, totalCities, updateDefender, pickBestNumber };
