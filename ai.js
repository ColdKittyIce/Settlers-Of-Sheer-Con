import { RESOURCES } from './board.js';
import * as R from './rules.js';

const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
const NEED_BASE = { brick: 3, lumber: 3, wool: 2, grain: 2.5, ore: 2.5 };

function aiCfg(p) {
  const c = p.ai || {};
  const diff = (c.difficulty || 'medium').toLowerCase();
  const style = (c.style || 'balanced').toLowerCase();
  const NOISE = { easy: 2.5, medium: 0.4, hard: 0.05 };
  return { diff, style, noise: NOISE[diff] ?? 0.4 };
}

function styleMult(style, res) {
  switch (style) {
    case 'builder': return { brick: 1.4, lumber: 1.4, wool: 1.1, grain: 1.0, ore: 1.0 }[res] ?? 1;
    case 'warlord': return { ore: 1.5, wool: 1.35, grain: 1.1, brick: 0.9, lumber: 0.9 }[res] ?? 1;
    case 'expansionist': return { lumber: 1.35, brick: 1.3, wool: 1.2, grain: 0.9, ore: 0.8 }[res] ?? 1;
    case 'trader': return 1.05;
    default: return 1;
  }
}

function need(state, pid, res) {
  const p = state.players[pid];
  return NEED_BASE[res] * styleMult(aiCfg(p).style, res) * (1 + 1.2 / (1 + p.res[res]));
}

function vertexScore(state, pid, vid) {
  const b = state.board;
  const v = b.vertices[vid];
  const cfg = aiCfg(state.players[pid]);
  let s = 0;
  for (const hid of v.hexes) {
    const h = b.hexes[hid];
    if (h.resource === 'desert' || h.resource === 'sea' || h.id === state.robber) continue;
    if (h.resource === 'gold') { s += (PIPS[h.number] || 0) * 2.6; continue; }
    s += (PIPS[h.number] || 0) * need(state, pid, h.resource);
  }
  if (state.expansions && state.expansions.seafarers && state.islandBonus) {
    for (const hid of v.hexes) {
      const isl = b.islandOf.get(hid);
      if (isl !== undefined && isl > 0 && state.islandBonus[isl] === undefined) { s += 4; break; }
    }
  }
  if (v.port) {
    const portB = cfg.style === 'trader' ? 13 : 7;
    s += v.port.type === 'generic' ? portB : portB + 3;
  }
  s += Math.random() * cfg.noise;
  return s;
}

export function aiBestSetupSettlement(state, pid) {
  const candidates = R.validSetupSettlements(state);
  let best = -1, bestS = -Infinity;
  for (const vid of candidates) {
    const s = vertexScore(state, pid, vid) + Math.random() * 0.5;
    if (s > bestS) { bestS = s; best = vid; }
  }
  return best;
}

export function aiBestSetupRoad(state, pid) {
  const pend = state.pending;
  const options = R.validSetupRoads(state);
  if (!options.length) return -1;
  const b = state.board;
  const target = aiBestFutureTarget(state, pid, pend.atVertex);
  let best = options[0], bestD = Infinity;
  for (const eid of options) {
    const e = b.edges[eid];
    const other = e.v1 === pend.atVertex ? e.v2 : e.v1;
    const ov = b.vertices[other];
    const tv = b.vertices[target];
    const d = Math.hypot(ov.x - tv.x, ov.y - tv.y);
    if (d < bestD) { bestD = d; best = eid; }
  }
  return best;
}

function aiBestFutureTarget(state, pid, fromVid) {
  const b = state.board;
  const fx = fromVid >= 0 ? b.vertices[fromVid].x : null;
  const fy = fromVid >= 0 ? b.vertices[fromVid].y : null;
  let best = -1, bestS = -Infinity;
  for (const v of b.vertices) {
    if (v.owner !== undefined || v.id === fromVid) continue;
    if (R.vertexBlockedByNeighbor(b, v.id)) continue;
    const dpen = fx != null ? Math.hypot(v.x - fx, v.y - fy) * 0.02 : 0;
    const s = vertexScore(state, pid, v.id) - dpen;
    if (s > bestS) { bestS = s; best = v.id; }
  }
  return best;
}

export function aiChooseDiscard(state, pid) {
  const entry = state.discardsLeft.find(d => d.pid === pid);
  if (!entry) return [];
  const p = state.players[pid];
  const cfg = aiCfg(p);
  if (cfg.diff === 'easy') {
    const pool = [];
    for (const r of RESOURCES) for (let i = 0; i < p.res[r]; i++) pool.push(r);
    const out = [];
    for (let i = 0; i < entry.count && pool.length; i++) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    return out;
  }
  const res = RESOURCES.slice().sort((a, b2) => p.res[b2] - p.res[a]);
  const out = [];
  for (const r of res) {
    for (let i = 0; i < p.res[r] && out.length < entry.count; i++) out.push(r);
  }
  return out;
}

export function aiChooseRobberHex(state, pid) {
  const b = state.board;
  const cfg = aiCfg(state.players[pid]);
  const vps = R.countVP(state);
  const leader = vps.indexOf(Math.max(...vps));
  let best = -1, bestS = -Infinity;
  for (const h of b.hexes) {
    if (h.isSea || h.id === state.robber) continue;
    let s = 0;
    for (const vid of h.vertexIds) {
      const v = b.vertices[vid];
      if (v.owner !== undefined && v.owner !== pid) {
        s += PIPS[h.number] || 0;
        if (v.owner === leader) s *= cfg.style === 'warlord' ? 2.2 : 1.6;
        if (v.type === 'city') s *= cfg.style === 'warlord' ? 1.5 : 1.2;
      }
    }
    s += Math.random() * cfg.noise;
    if (s > bestS) { bestS = s; best = h.id; }
  }
  if (best < 0) {
    for (const h of b.hexes) if (!h.isSea && h.id !== state.robber) { best = h.id; break; }
  }
  return best;
}

export function aiChooseStealTarget(state, from) {
  if (aiCfg(state.players[from[0]]).diff === 'easy') return from[Math.floor(Math.random() * from.length)];
  let best = from[0], bestT = -1;
  for (const pid of from) {
    const t = R.totalRes(state.players[pid]);
    if (t > bestT) { bestT = t; best = pid; }
  }
  return best;
}

export function aiChoosePirateHex(state, pid) {
  const b = state.board;
  let best = -1, bestS = -Infinity;
  for (const h of b.hexes) {
    if (!h.isSea || h.id === state.pirate) continue;
    let s = 0;
    const seen = new Set();
    for (const vid of h.vertexIds) {
      for (const eid of b.vertexEdges[vid]) {
        if (seen.has(eid)) continue;
        seen.add(eid);
        const e = b.edges[eid];
        if (e.owner !== undefined && e.owner !== pid && e.kind === 'ship') s += 2.2;
        else if (e.owner === pid && e.kind === 'ship') s -= 0.8;
      }
    }
    s += Math.random() * 0.4;
    if (s > bestS) { bestS = s; best = h.id; }
  }
  if (best < 0) {
    for (const h of b.hexes) if (h.isSea && h.id !== state.pirate) { best = h.id; break; }
  }
  return best;
}

export function aiChooseYear(state, pid) {
  const scored = RESOURCES.slice().sort((a, b2) => need(state, pid, b2) - need(state, pid, a));
  return [scored[0], scored[1]];
}

export function aiChooseMonopoly(state, pid) {
  let best = RESOURCES[0], bestT = -1;
  for (const r of RESOURCES) {
    let t = 0;
    for (const p of state.players) if (p.id !== pid) t += p.res[r];
    if (t > bestT) { bestT = t; best = r; }
  }
  return best;
}

export function aiHandlePending(state, pid) {
  const pend = state.pending;
  if (!pend) return;
  if (pend.type === 'discard') {
    R.discard(state, pid, aiChooseDiscard(state, pid));
  } else if (pend.type === 'robber') {
    const isBishop = pend.reason === 'bishop';
    if (state.expansions && state.expansions.seafarers && state.pirate != null && !isBishop) {
      const cfg = aiCfg(state.players[pid]);
      const pirateChance = { warlord: 0.55, expansionist: 0.55, trader: 0.35, balanced: 0.3, builder: 0.2 }[cfg.style] ?? 0.3;
      if (Math.random() < pirateChance) R.placePirate(state, aiChoosePirateHex(state, pid));
      else R.placeRobber(state, aiChooseRobberHex(state, pid));
    } else {
      R.placeRobber(state, aiChooseRobberHex(state, pid));
    }
  } else if (pend.type === 'steal') {
    R.stealFrom(state, aiChooseStealTarget(state, pend.from));
  } else if (pend.type === 'year') {
    R.yearOfPlenty(state, aiChooseYear(state, pid));
  } else if (pend.type === 'monopoly') {
    R.monopoly(state, aiChooseMonopoly(state, pid));
  } else if (pend.type === 'alchemist') {
    R.resolveAlchemist(state, R.pickBestNumber(state, pid));
  } else if (pend.type === 'crane') {
    const bt = aiBestTrack(state, pid);
    if (bt) R.resolveCrane(state, bt);
    else { state.pending = null; R.log(state, state.players[pid].name + ' plays the Crane, but all tracks are already maxed — no effect.'); }
  } else if (pend.type === 'intrigue') {
    R.resolveIntrigue(state, aiChooseIntrigueTarget(state, pid));
  } else if (pend.type === 'monopolyC') {
    R.resolveMonopolyC(state, aiChooseMonopolyC(state, pid));
  }
}

function aiChooseIntrigueTarget(state, pid) {
  let best = -1, bestC = 0;
  for (const p of state.players) {
    if (p.id === pid) continue;
    const t = (p.commodities.paper || 0) + (p.commodities.coin || 0) + (p.commodities.cloth || 0);
    if (t > bestC) { bestC = t; best = p.id; }
  }
  return best >= 0 ? best : (pid + 1) % state.players.length;
}

function aiChooseMonopolyC(state, pid) {
  let best = 'paper', bestT = -1;
  for (const com of ['paper', 'coin', 'cloth']) {
    let t = 0;
    for (const p of state.players) if (p.id !== pid) t += p.commodities[com] || 0;
    if (t > bestT) { bestT = t; best = com; }
  }
  return best;
}

function aiBestTrack(state, pid) {
  const p = state.players[pid];
  let best = null, bestS = -Infinity;
  for (const t of ['politics', 'science', 'trade']) {
    if (p.improvements[t] >= 3) continue;
    const com = { politics: 'paper', science: 'coin', trade: 'cloth' }[t];
    const cost = p.improvements[t] + 1;
    const surplus = (p.commodities[com] || 0) - cost;
    if (surplus > bestS) { bestS = surplus; best = t; }
  }
  return best;
}

export function aiSetupStep(state, pid) {
  const pend = state.pending;
  if (!pend) return;
  if (pend.type === 'setupSettlement') {
    const vid = aiBestSetupSettlement(state, pid);
    R.placeSetupSettlement(state, vid);
  } else if (pend.type === 'setupRoad') {
    const eid = aiBestSetupRoad(state, pid);
    R.placeSetupRoad(state, eid);
  }
}

function bestSettlementSpot(state, pid) {
  const spots = R.validSettlementSpots(state, pid);
  let best = -1, bestS = -Infinity;
  for (const vid of spots) {
    const s = vertexScore(state, pid, vid);
    if (s > bestS) { bestS = s; best = vid; }
  }
  return { vid: best, score: bestS };
}

export function aiChooseRoadEdge(state, pid, targetVid) {
  const spots = R.validRoadSpots(state, pid);
  if (!spots.length) return -1;
  const b = state.board;
  let best = spots[0], bestD = Infinity;
  for (const eid of spots) {
    const e = b.edges[eid];
    const v1 = b.vertices[e.v1], v2 = b.vertices[e.v2];
    const tv = targetVid >= 0 ? b.vertices[targetVid] : null;
    const d1 = tv ? Math.hypot(v1.x - tv.x, v1.y - tv.y) : 0;
    const d2 = tv ? Math.hypot(v2.x - tv.x, v2.y - tv.y) : 0;
    const d = Math.min(d1, d2);
    if (d < bestD) { bestD = d; best = eid; }
  }
  return best;
}

export function aiChooseShipEdge(state, pid, targetVid) {
  const spots = R.validShipSpots(state, pid);
  if (!spots.length) return -1;
  const b = state.board;
  let best = spots[0], bestD = Infinity;
  for (const eid of spots) {
    const e = b.edges[eid];
    const v1 = b.vertices[e.v1], v2 = b.vertices[e.v2];
    const tv = targetVid >= 0 ? b.vertices[targetVid] : null;
    const d1 = tv ? Math.hypot(v1.x - tv.x, v1.y - tv.y) : 0;
    const d2 = tv ? Math.hypot(v2.x - tv.x, v2.y - tv.y) : 0;
    const d = Math.min(d1, d2);
    if (d < bestD) { bestD = d; best = eid; }
  }
  return best;
}

function bestDistToTarget(state, pid, spots, targetVid) {
  const b = state.board;
  const tv = targetVid >= 0 ? b.vertices[targetVid] : null;
  let best = Infinity;
  for (const eid of spots) {
    const e = b.edges[eid];
    const d1 = tv ? Math.hypot(b.vertices[e.v1].x - tv.x, b.vertices[e.v1].y - tv.y) : 0;
    const d2 = tv ? Math.hypot(b.vertices[e.v2].x - tv.x, b.vertices[e.v2].y - tv.y) : 0;
    const d = Math.min(d1, d2);
    if (d < best) best = d;
  }
  return best;
}

export function aiBankTrade(state, pid) {
  const p = state.players[pid];
  const cfg = aiCfg(p);
  if (cfg.diff === 'easy' && Math.random() < 0.35) return null;
  const rateFor = {};
  for (const r of RESOURCES) rateFor[r] = R.getTradeRate(state, p, r);
  const deficit = RESOURCES.slice().sort((a, b2) => need(state, pid, b2) - need(state, pid, a));
  const needLine = cfg.style === 'trader' ? 2 : cfg.diff === 'hard' ? 1 : 0;
  for (const get of deficit) {
    if (p.res[get] > needLine) continue;
    for (const give of RESOURCES) {
      if (give === get) continue;
      const rate = rateFor[give];
      if (p.res[give] >= rate) return { give, get };
    }
  }
  return null;
}

function findDev(p, type, turnCount) {
  return p.devCards.findIndex(c => c.type === type && c.boughtTurn < turnCount);
}

function pickProgressCard(state, pid) {
  const p = state.players[pid];
  if (!p.progress || !p.progress.length || state.progressPlayedThisTurn) return -1;
  const winVP = state.winVP || 10;
  const vps = R.computeVP(state, pid);
  const vpCard = p.progress.findIndex(c => c.type === 'constitution' || c.type === 'medicine' || c.type === 'master');
  if (vpCard >= 0 && vps + 1 >= winVP) return vpCard;
  const bishop = p.progress.findIndex(c => c.type === 'bishop');
  if (bishop >= 0 && !robberHitsEnemies(state, state.robber, pid)) return bishop;
  const alch = p.progress.findIndex(c => c.type === 'alchemist');
  if (alch >= 0 && !state.rolled) return alch;
  const crane = p.progress.findIndex(c => c.type === 'crane');
  if (crane >= 0) return crane;
  const merch = p.progress.findIndex(c => c.type === 'merchant');
  if (merch >= 0 && p.merchantTurns === 0 && !(p.improvements && p.improvements.trade >= 3)) return merch;
  const mono = p.progress.findIndex(c => c.type === 'monopoly2');
  if (mono >= 0) {
    for (const com of ['paper', 'coin', 'cloth']) {
      let total = 0;
      for (const op of state.players) if (op.id !== pid) total += op.commodities[com] || 0;
      if (total >= 2) return mono;
    }
  }
  const intr = p.progress.findIndex(c => c.type === 'intrigue');
  if (intr >= 0) {
    for (const op of state.players) {
      if (op.id === pid) continue;
      if ((op.commodities.paper || 0) + (op.commodities.coin || 0) + (op.commodities.cloth || 0) > 0) return intr;
    }
  }
  return -1;
}

function canMoveRobberToEnemy(state, pid) {
  const b = state.board;
  for (const h of b.hexes) {
    if (h.isSea || h.id === state.robber) continue;
    for (const vid of h.vertexIds) {
      const v = b.vertices[vid];
      if (v.owner !== undefined && v.owner !== pid) return true;
    }
  }
  return false;
}

function pickActivateKnight(state, pid) {
  const p = state.players[pid];
  const idx = p.knights.findIndex(k => !k.active);
  if (idx < 0) return -1;
  const k = p.knights[idx];
  let otherMax = 0;
  for (const pl of state.players) if (pl.id !== pid) otherMax = Math.max(otherMax, R.activeStrength(pl));
  const myAfter = R.activeStrength(p) + k.strength;
  const need = state.barbarian.nextAttack - R.totalImprovements(state);
  if (!robberHitsEnemies(state, state.robber, pid) && canMoveRobberToEnemy(state, pid)) return idx;
  if (need <= 2) return idx;
  if (myAfter >= 2 && myAfter > otherMax) return idx;
  return -1;
}

function knightWanted(state, pid) {
  const p = state.players[pid];
  const cfg = aiCfg(p);
  const need = state.barbarian.nextAttack - R.totalImprovements(state);
  if (need <= 2) return true;
  if (cfg.style === 'warlord') return true;
  if (p.knights.length >= 3) return false;
  if (p.res.ore >= 2 && p.res.lumber >= 1 && p.res.wool >= 1) return true;
  return false;
}

function upgradeWanted(state, pid) {
  const p = state.players[pid];
  const cfg = aiCfg(p);
  const need = state.barbarian.nextAttack - R.totalImprovements(state);
  if (need <= 3) return true;
  if (cfg.style === 'warlord') return true;
  let otherMax = 0;
  for (const pl of state.players) if (pl.id !== pid) otherMax = Math.max(otherMax, R.activeStrength(pl));
  const mine = R.activeStrength(p);
  if (mine + 1 >= 2 && mine + 1 > otherMax) return true;
  return false;
}

export function aiChooseAction(state, pid) {
  const p = state.players[pid];
  const cfg = aiCfg(p);
  const cnk = !!(state.expansions && state.expansions.cnk);
  const { vid, score } = bestSettlementSpot(state, pid);
  const citySpots = R.validCitySpots(state, pid);
  const settlementsPlaced = 5 - p.settlementsLeft;

  const canAffordSettle = p.res.brick >= 1 && p.res.lumber >= 1 && p.res.wool >= 1 && p.res.grain >= 1;
  const canAffordCity = p.res.grain >= 2 && p.res.ore >= 3;
  const canAffordDev = p.res.wool >= 1 && p.res.grain >= 1 && p.res.ore >= 1;
  const canAffordRoad = p.res.brick >= 1 && p.res.lumber >= 1;
  const canAffordShip = p.res.lumber >= 1 && p.res.wool >= 1;
  const deckAvail = state.devDeck.length > 0 || state.devDiscard.length > 0;

  if (!state.devPlayedThisTurn) {
    const knightIdx = findDev(p, 'knight', state.turnCount);
    if (knightIdx >= 0) {
      const prev = state.largestArmy.player;
      const prevCount = prev >= 0 ? state.players[prev].knightsPlayed : 0;
      const canClaimArmy = p.knightsPlayed + 1 >= 3 && p.knightsPlayed + 1 > prevCount;
      const robberWasted = !robberHitsEnemies(state, state.robber, pid);
      const warlordBias = cfg.style === 'warlord' && robberWasted && p.devCards.length >= 2;
      if (canClaimArmy || robberWasted || warlordBias || p.devCards.length >= 4) {
        return { t: 'dev', idx: knightIdx };
      }
    }
    const roadIdx = findDev(p, 'road', state.turnCount);
    if (roadIdx >= 0 && p.roadsLeft >= 2 && (cfg.style !== 'builder' || p.roadsLeft >= 4)) {
      return { t: 'dev', idx: roadIdx };
    }
    const yearIdx = findDev(p, 'year', state.turnCount);
    if (yearIdx >= 0) {
      const deficit = RESOURCES.slice().sort((a, b2) => need(state, pid, b2) - need(state, pid, a));
      if (p.res[deficit[0]] === 0) return { t: 'dev', idx: yearIdx };
    }
    const monoIdx = findDev(p, 'monopoly', state.turnCount);
    if (monoIdx >= 0) {
      for (const r of RESOURCES) {
        let total = 0;
        for (const op of state.players) if (op.id !== pid) total += op.res[r];
        if (total >= 3 && p.res[r] <= 1) return { t: 'dev', idx: monoIdx };
      }
    }
  }

  if (cnk) {
    const progIdx = pickProgressCard(state, pid);
    if (progIdx >= 0) return { t: 'progress', idx: progIdx };
  }

  const eagerCities = cfg.style === 'builder' || cfg.style === 'warlord' || cfg.diff === 'hard' || cnk;
  const minSettlesForCity = eagerCities ? 1 : 2;
  if (cfg.diff === 'easy' && Math.random() < 0.18) {
    if (canAffordRoad && p.roadsLeft > 0) {
      let target = vid >= 0 ? vid : aiBestFutureTarget(state, pid, -1);
      if (target >= 0) return { t: 'road', target };
    }
    if (canAffordDev && deckAvail) return { t: 'devcard' };
  }
  if (p.citiesLeft > 0 && citySpots.length > 0 && canAffordCity &&
      settlementsPlaced >= minSettlesForCity && (settlementsPlaced >= 3 || !(vid >= 0 && score >= 8))) {
    return { t: 'city', vid: citySpots[0] };
  }
  const settleThresh = cfg.style === 'expansionist' ? 3 : cfg.style === 'builder' ? 5
    : cfg.diff === 'hard' ? 3.5 : cfg.diff === 'easy' ? 6 : 4.5;
  if (p.settlementsLeft > 0 && vid >= 0 && score >= settleThresh && canAffordSettle) {
    return { t: 'settlement', vid };
  }
  const warlordBuysDevs = cfg.style === 'warlord' && canAffordDev && deckAvail && p.devCards.length < 6 &&
    p.res.ore >= 1 && p.res.wool >= 1 && p.res.grain >= 1;
  if (warlordBuysDevs) return { t: 'devcard' };
  if (canAffordDev && deckAvail && !(canAffordSettle && vid >= 0) && cfg.diff !== 'easy') {
    return { t: 'devcard' };
  }
  if (cnk && p.commodities) {
    const bestTrack = aiBestTrack(state, pid);
    if (bestTrack && R.canAffordImprovement(state, pid, bestTrack)) {
      return { t: 'improvement', track: bestTrack };
    }
    const actIdx = pickActivateKnight(state, pid);
    if (actIdx >= 0) return { t: 'activateKnight', idx: actIdx };
    const upIdx = p.knights.findIndex(k => k.strength < 3 &&
      (k.strength === 1 ? p.commodities.cloth >= 1 : p.commodities.cloth >= 1 && p.commodities.coin >= 1));
    if (upIdx >= 0 && upgradeWanted(state, pid)) return { t: 'upgradeKnight', idx: upIdx };
  }
  if (p.roadsLeft > 0 && canAffordRoad) {
    let target = vid >= 0 ? vid : aiBestFutureTarget(state, pid, -1);
    if (target >= 0) {
      const roadSpots = R.validRoadSpots(state, pid);
      const shipSpots = R.validShipSpots(state, pid);
      if (p.shipsLeft > 0 && canAffordShip && shipSpots.length > 0) {
        const dR = bestDistToTarget(state, pid, roadSpots, target);
        const dS = bestDistToTarget(state, pid, shipSpots, target);
        const shipBias = cfg.style === 'expansionist' ? 8 : 20;
        if (dS < dR - shipBias) return { t: 'ship', target };
      }
      return { t: 'road', target };
    }
  }
  if (p.shipsLeft > 0 && canAffordShip) {
    const shipSpots = R.validShipSpots(state, pid);
    if (shipSpots.length > 0) {
      let target = vid >= 0 ? vid : aiBestFutureTarget(state, pid, -1);
      return { t: 'ship', target: target >= 0 ? target : -1 };
    }
  }
  if (cnk && p.res.lumber >= 1 && p.res.wool >= 1 && p.res.ore >= 1 && knightWanted(state, pid)) {
    const spots = R.validKnightSpots(state, pid);
    if (spots.length > 0) return { t: 'knight', vid: spots[Math.floor(Math.random() * spots.length)] };
  }
  if (canAffordDev && deckAvail) {
    return { t: 'devcard' };
  }
  return null;
}

function robberHitsEnemies(state, hid, pid) {
  const b = state.board;
  const h = b.hexById.get(hid);
  if (!h) return false;
  for (const vid of h.vertexIds) {
    const v = b.vertices[vid];
    if (v.owner !== undefined && v.owner !== pid) return true;
  }
  return false;
}

export function applyAiMove(state, pid, move) {
  if (move.t === 'settlement') {
    state.pending = { type: 'settlement', playerId: pid };
    R.buildSettlement(state, move.vid);
  } else if (move.t === 'city') {
    state.pending = { type: 'city', playerId: pid };
    R.buildCity(state, move.vid);
  } else if (move.t === 'road') {
    const eid = aiChooseRoadEdge(state, pid, move.target);
    if (eid < 0) return false;
    state.pending = { type: 'road', playerId: pid };
    R.buildRoad(state, eid);
  } else if (move.t === 'ship') {
    const eid = aiChooseShipEdge(state, pid, move.target);
    if (eid < 0) return false;
    state.pending = { type: 'ship', playerId: pid };
    R.buildShip(state, eid);
  } else if (move.t === 'dev') {
    R.playDevCard(state, move.idx);
    if (state.phase !== 'action') return 'pending';
  } else if (move.t === 'devcard') {
    try { R.buyDevCard(state); } catch (e) { return false; }
  } else if (move.t === 'improvement') {
    try { R.buildImprovement(state, move.track); } catch (e) { return false; }
  } else if (move.t === 'knight') {
    state.pending = { type: 'knight', playerId: pid };
    R.buildKnight(state, move.vid);
  } else if (move.t === 'upgradeKnight') {
    try { R.upgradeKnight(state, move.idx); } catch (e) { return false; }
  } else if (move.t === 'activateKnight') {
    try { R.activateKnight(state, move.idx); } catch (e) { return false; }
    if (state.phase !== 'action') return 'pending';
  } else if (move.t === 'progress') {
    try { R.playProgressCard(state, move.idx); } catch (e) { return false; }
    if (state.phase !== 'action') return 'pending';
  }
  return true;
}

export function aiRespondToTrade(state, offer, aiPid) {
  const p = state.players[aiPid];
  if (p.res[offer.get] < offer.getCount) return { accept: false };
  const cfg = aiCfg(p);
  const value = (res) => need(state, aiPid, res);
  const giveValue = offer.giveCount * value(offer.give);
  const getValue = offer.getCount * value(offer.get);
  const margin = cfg.diff === 'easy' ? 0.75 : cfg.diff === 'hard' ? 1.15 : 1.0;
  if (cfg.style === 'trader') return { accept: giveValue >= getValue * 0.9 };
  return { accept: giveValue >= getValue * margin };
}

function totalOf(state, r) { let t = 0; for (const p of state.players) t += p.res[r]; return t; }

export function aiProposeTrade(state, pid) {
  const p = state.players[pid];
  const cfg = aiCfg(p);
  if ((state.trades || []).some(t => t.from === pid)) return null;
  if (cfg.diff === 'easy' && Math.random() < 0.5) return null;
  const minSurplus = cfg.style === 'trader' ? 2 : 3;
  const surplus = RESOURCES.filter(r => p.res[r] >= minSurplus).sort((a, b) => p.res[b] - p.res[a]);
  if (!surplus.length) return null;
  const want = RESOURCES.filter(r => p.res[r] === 0).sort((a, b) => totalOf(state, b) - totalOf(state, a));
  if (!want.length) return null;
  if (totalOf(state, want[0]) <= 0) return null;
  const giveCount = cfg.style === 'trader' ? 1 : 2;
  return { give: surplus[0], giveCount, get: want[0], getCount: 1, target: 'all' };
}

export function aiTakeTurn(state, pid) {
  const p = state.players[pid];
  if (!state.rolled && state.phase === 'action') {
    R.rollDice(state);
  }
  if (state.phase === 'moveRobber' || state.phase === 'steal') {
    aiHandlePending(state, pid);
    if (state.phase !== 'action') return;
  }
  if (state.pending && state.pending.playerId === pid) {
    aiHandlePending(state, pid);
  }
  let guard = 0;
  let bankTrades = 0;
  let lastTrade = null;
  while (state.phase === 'action' && guard++ < 40) {
    if (state.pending && state.pending.playerId === pid) {
      aiHandlePending(state, pid);
      continue;
    }
    let move = aiChooseAction(state, pid);
    if (!move) {
      if (bankTrades >= 6) break;
      const trade = aiBankTrade(state, pid);
      if (trade) {
        if (lastTrade && trade.give === lastTrade.get && trade.get === lastTrade.give) break;
        lastTrade = { give: trade.give, get: trade.get };
        try {
          R.tradeWithBank(state, trade.give, R.getTradeRate(state, p, trade.give), trade.get);
          bankTrades++;
          continue;
        } catch (e) { /* ignore */ }
      }
      break;
    }
    if (applyAiMove(state, pid, move) === false) break;
  }
  if (state.phase === 'action' && state.rolled) {
    R.endTurn(state);
  }
}
