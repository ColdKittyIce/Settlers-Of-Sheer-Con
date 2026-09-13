import { RESOURCES } from './board.js';
import { makeRng, snd } from './rand.js';

const H = { produce: () => {}, checkWin: () => {} };
export function setRulesHooks(hooks) {
  H.produce = hooks.produce;
  H.checkWin = hooks.checkWin;
}

export const TRACKS = ['politics', 'science', 'trade'];
export const COMMODITY_NAMES = { politics: 'paper', science: 'coin', trade: 'cloth' };
export const COMMODITY_ICONS = { paper: '📜', coin: '🪙', cloth: '🧵' };
export const COMMODITY_FOR = { grain: 'politics', ore: 'science', wool: 'trade' };
export const COMMODITIES = ['paper', 'coin', 'cloth'];
export const TRACK_INFO = {
  politics: { name: 'Politics', icon: '🛡', commodity: 'paper' },
  science:  { name: 'Science',  icon: '⚗', commodity: 'coin' },
  trade:    { name: 'Trade',    icon: '⚖', commodity: 'cloth' },
};
export const PROGRESS_INFO = {
  bishop:       { track: 'politics', name: 'Bishop',         icon: '⛪', desc: 'Move the robber to any hex. Nobody is robbed.' },
  constitution: { track: 'politics', name: 'Constitution',   icon: '📜', desc: 'Worth 1 victory point.' },
  intrigue:     { track: 'politics', name: 'Intrigue',       icon: '🗡', desc: 'Steal 1 of each commodity from a player.' },
  alchemist:    { track: 'science',  name: 'Alchemist',      icon: '⚗', desc: 'Set the dice to any number 2–12 (not 7) and produce.' },
  crane:        { track: 'science',  name: 'Crane',          icon: '🏗', desc: 'Buy one city improvement level for free.' },
  medicine:     { track: 'science',  name: 'Medicine',       icon: '💊', desc: 'Worth 1 victory point.' },
  merchant:     { track: 'trade',    name: 'Merchant',       icon: '🏺', desc: 'Your next 2 turns: all bank trades are 2:1.' },
  monopoly2:    { track: 'trade',    name: 'Merchant Monopoly', icon: '💰', desc: 'Take all of one commodity from all players.' },
  master:       { track: 'trade',    name: 'Master Merchant', icon: '👑', desc: 'Worth 1 victory point.' },
};
const VP_PROGRESS = { constitution: true, medicine: true, master: true };

const DECK_BY_TRACK = {
  politics: ['bishop', 'bishop', 'constitution', 'constitution', 'intrigue', 'intrigue', 'intrigue', 'intrigue'],
  science:  ['alchemist', 'alchemist', 'crane', 'crane', 'medicine', 'medicine', 'medicine', 'medicine'],
  trade:    ['merchant', 'merchant', 'merchant', 'monopoly2', 'monopoly2', 'master', 'master', 'master'],
};

export function cnkInit(state) {
  for (const p of state.players) {
    p.commodities = { paper: 0, coin: 0, cloth: 0 };
    p.improvements = { politics: 0, science: 0, trade: 0 };
    p.knights = [];
    p.progress = [];
    p.merchantTurns = 0;
    p.hasDefenderOfCatan = false;
  }
  state.barbarian = { nextAttack: 6, attacks: 0 };
  state.progressPlayedThisTurn = false;
  state.progressDecks = {};
  state.progressDiscards = {};
  for (const t of TRACKS) {
    state.progressDecks[t] = makeRng(String(state.seed) + '::prog::' + t).shuffle([...DECK_BY_TRACK[t]]);
    state.progressDiscards[t] = [];
  }
}

export function cnkProduceHex(state, h, p, amt, res) {
  const track = COMMODITY_FOR[h.resource];
  if (amt >= 2 && track) {
    const com = COMMODITY_NAMES[track];
    p.commodities[com] += amt;
    return com;
  }
  p.res[res] += amt;
  return null;
}

export function totalImprovements(state) {
  let t = 0;
  for (const p of state.players) t += p.improvements.politics + p.improvements.science + p.improvements.trade;
  return t;
}

export function totalCities(state) {
  let c = 0;
  for (const v of state.board.vertices) if (v.type === 'city') c++;
  return c;
}

export function activeStrength(p) {
  let s = 0;
  for (const k of p.knights) if (k.active) s += k.strength;
  if (p.improvements && p.improvements.politics >= 3) s += 1;
  return s;
}

export function updateDefender(state) {
  let best = -1, bestS = 0;
  for (const p of state.players) {
    const s = activeStrength(p);
    if (s >= 2 && s > bestS) { bestS = s; best = p.id; }
  }
  for (const p of state.players) p.hasDefenderOfCatan = (p.id === best);
}

export function improvementCost(p, track) {
  return p.improvements[track] + 1;
}

export function canAffordImprovement(state, pid, track) {
  const p = state.players[pid];
  const c = improvementCost(p, track);
  const com = TRACK_INFO[track].commodity;
  return p.improvements[track] < 3 && p.commodities[com] >= c;
}

export function buildImprovement(state, track) {
  if (state.phase !== 'action') throw new Error('Cannot buy now');
  const p = cnkCurrentPlayer(state);
  if (!TRACKS.includes(track)) throw new Error('Bad track');
  if (p.improvements[track] >= 3) throw new Error('Track already maxed');
  const c = improvementCost(p, track);
  const com = TRACK_INFO[track].commodity;
  if (p.commodities[com] < c) throw new Error('Not enough ' + com);
  p.commodities[com] -= c;
  p.improvements[track]++;
  cnkLog(state, p.name + ' advances the ' + TRACK_INFO[track].name + ' track to level ' + p.improvements[track] + '.');
  drawProgressCard(state, p.id, track);
  if (track === 'science' && p.improvements.science >= 3) {
    cnkLog(state, p.name + ' gains a bonus progress card (Science III).');
    drawProgressCard(state, p.id, track);
  }
  checkBarbarian(state);
  H.checkWin(state);
  snd('improve');
  return state;
}

export function drawProgressCard(state, pid, track) {
  const p = state.players[pid];
  let deck = state.progressDecks[track];
  if (!deck.length) {
    state.progressDecks[track] = makeRng(state.turnCount + '::reshuffle::' + track).shuffle(state.progressDiscards[track]);
    state.progressDiscards[track] = [];
    deck = state.progressDecks[track];
  }
  const type = deck.pop();
  p.progress.push({ type, track });
  cnkLog(state, p.name + ' draws a ' + PROGRESS_INFO[type].name + ' progress card.');
  return type;
}

export function validKnightSpots(state, pid) {
  const b = state.board;
  const out = new Set();
  for (const v of b.vertices) {
    if (v.owner === pid) {
      for (const nid of b.vertexNeighbors[v.id]) {
        const nv = b.vertices[nid];
        if (nv.owner !== undefined) continue;
        let hasKnight = false;
        for (const pl of state.players) for (const k of pl.knights) if (k.vid === nid) hasKnight = true;
        if (hasKnight) continue;
        let touchesLand = false;
        for (const hid of nv.hexes) if (!b.hexes[hid].isSea) { touchesLand = true; break; }
        if (!touchesLand) continue;
        out.add(nid);
      }
    }
  }
  return [...out];
}

export function startBuildKnight(state) {
  if (state.phase !== 'action') throw new Error('Cannot build now');
  const p = cnkCurrentPlayer(state);
  if (p.res.lumber < 1 || p.res.wool < 1 || p.res.ore < 1) throw new Error('Not enough resources (1 lumber, 1 wool, 1 ore)');
  state.pending = { type: 'knight', playerId: p.id, valid: validKnightSpots(state, p.id) };
  return state;
}

export function buildKnight(state, vid) {
  const pend = state.pending;
  if (state.phase !== 'action' || !pend || pend.type !== 'knight') throw new Error('Cannot build a knight now');
  const p = cnkCurrentPlayer(state);
  if (p.res.lumber < 1 || p.res.wool < 1 || p.res.ore < 1) throw new Error('Not enough resources');
  if (!validKnightSpots(state, p.id).includes(vid)) throw new Error('Illegal knight spot');
  p.res.lumber--; p.res.wool--; p.res.ore--;
  p.knights.push({ vid, strength: 1, active: false });
  state.pending = null;
  cnkLog(state, p.name + ' builds a knight.');
  if (state.undoAllowed && state.phase === 'action') {
    state.undoStack = state.undoStack || [];
    state.undoStack.push({ type: 'knight', pid: p.id, vid, kIdx: p.knights.length - 1, refund: { lumber: 1, wool: 1, ore: 1 } });
    if (state.undoStack.length > 20) state.undoStack.shift();
  }
  updateDefender(state);
  H.checkWin(state);
  snd('knight');
  return state;
}

export function upgradeKnight(state, idx) {
  if (state.phase !== 'action') throw new Error('Cannot upgrade now');
  const p = cnkCurrentPlayer(state);
  const k = p.knights[idx];
  if (!k) throw new Error('No such knight');
  if (k.strength >= 3) throw new Error('Knight already mighty');
  const cost = k.strength === 1 ? { cloth: 1 } : { cloth: 1, coin: 1 };
  if (p.commodities.cloth < cost.cloth || p.commodities.coin < (cost.coin || 0)) throw new Error('Not enough commodities');
  p.commodities.cloth -= cost.cloth;
  if (cost.coin) p.commodities.coin -= cost.coin;
  k.strength++;
  cnkLog(state, p.name + " upgrades a knight to " + (k.strength === 2 ? 'strong' : 'mighty') + '.');
  updateDefender(state);
  snd('knight');
  return state;
}

export function activateKnight(state, idx) {
  if (state.phase !== 'action') throw new Error('Cannot activate now');
  const p = cnkCurrentPlayer(state);
  const k = p.knights[idx];
  if (!k) throw new Error('No such knight');
  if (k.active) throw new Error('Knight already active');
  k.active = true;
  cnkLog(state, p.name + ' activates a knight.');
  updateDefender(state);
  state.pending = { type: 'robber', playerId: p.id, reason: 'knight' };
  state.phase = 'moveRobber';
  snd('knight');
  return state;
}

export function playProgressCard(state, idx) {
  const p = cnkCurrentPlayer(state);
  if (state.phase !== 'action') throw new Error('Cannot play a progress card now');
  if (state.progressPlayedThisTurn) throw new Error('Already played a progress card this turn');
  const card = p.progress[idx];
  if (!card) throw new Error('No such card');
  p.progress.splice(idx, 1);
  state.progressPlayedThisTurn = true;
  const type = card.type;
  if (VP_PROGRESS[type]) {
    p.vpHidden++;
    cnkLog(state, p.name + ' reveals the ' + PROGRESS_INFO[type].name + ' (+1 VP).');
  } else if (type === 'bishop') {
    cnkLog(state, p.name + ' plays the Bishop.');
    state.pending = { type: 'robber', playerId: p.id, reason: 'bishop' };
    state.phase = 'moveRobber';
  } else if (type === 'intrigue') {
    cnkLog(state, p.name + ' plays Intrigue.');
    state.pending = { type: 'intrigue', playerId: p.id };
  } else if (type === 'alchemist') {
    cnkLog(state, p.name + ' plays the Alchemist.');
    state.pending = { type: 'alchemist', playerId: p.id };
  } else if (type === 'crane') {
    cnkLog(state, p.name + ' plays the Crane.');
    state.pending = { type: 'crane', playerId: p.id };
  } else if (type === 'merchant') {
    p.merchantTurns = 2;
    cnkLog(state, p.name + " plays the Merchant (2:1 bank trades for 2 turns).");
  } else if (type === 'monopoly2') {
    cnkLog(state, p.name + ' plays Merchant Monopoly.');
    state.pending = { type: 'monopolyC', playerId: p.id };
  }
  H.checkWin(state);
  snd('progress');
  return state;
}

export function resolveAlchemist(state, number) {
  const pend = state.pending;
  if (!pend || pend.type !== 'alchemist') throw new Error('Not choosing alchemist');
  const n = Math.round(number);
  if (!(n >= 2 && n <= 12) || n === 7) throw new Error('Choose a number from 2 to 12 (not 7)');
  const p = state.players[pend.playerId];
  state.dice = [Math.ceil(n / 2), n - Math.ceil(n / 2)];
  state.rolled = true;
  state.lastGains = [];
  state.gainsId = (state.gainsId || 0) + 1;
  H.produce(state, n);
  state.pending = null;
  cnkLog(state, p.name + ' uses the Alchemist to roll a ' + n + '.');
  return state;
}

export function resolveCrane(state, track) {
  const pend = state.pending;
  if (!pend || pend.type !== 'crane') throw new Error('Not choosing crane');
  const p = state.players[pend.playerId];
  const avail = TRACKS.filter(t => p.improvements[t] < 3);
  if (avail.length === 0) {
    cnkLog(state, p.name + ' plays the Crane, but all tracks are already maxed — no effect.');
    state.pending = null;
    return state;
  }
  if (!TRACKS.includes(track) || p.improvements[track] >= 3) track = avail[0];
  p.improvements[track]++;
  cnkLog(state, p.name + ' uses the Crane to advance the ' + TRACK_INFO[track].name + ' track to level ' + p.improvements[track] + '.');
  drawProgressCard(state, p.id, track);
  checkBarbarian(state);
  H.checkWin(state);
  state.pending = null;
  return state;
}

export function resolveIntrigue(state, targetPid) {
  const pend = state.pending;
  if (!pend || pend.type !== 'intrigue') throw new Error('Not choosing intrigue');
  const p = state.players[pend.playerId];
  if (targetPid === p.id) throw new Error('Choose another player');
  const t = state.players[targetPid];
  const got = [];
  for (const com of COMMODITIES) {
    if (t.commodities[com] > 0) { t.commodities[com]--; p.commodities[com]++; got.push(com); }
  }
  cnkLog(state, p.name + ' steals ' + (got.length ? got.join(', ') : 'nothing') + ' from ' + t.name + ' via Intrigue.');
  state.pending = null;
  return state;
}

export function resolveMonopolyC(state, com) {
  const pend = state.pending;
  if (!pend || pend.type !== 'monopolyC') throw new Error('Not choosing monopoly');
  if (!COMMODITIES.includes(com)) throw new Error('Bad commodity');
  const p = state.players[pend.playerId];
  let total = 0;
  for (const other of state.players) {
    if (other.id === pend.playerId) continue;
    const n = other.commodities[com];
    other.commodities[com] -= n;
    total += n;
  }
  p.commodities[com] += total;
  cnkLog(state, p.name + ' monopolizes ' + total + ' ' + com + '.');
  state.pending = null;
  H.checkWin(state);
  return state;
}

export function checkBarbarian(state) {
  const total = totalImprovements(state);
  const b = state.barbarian;
  if (b && total >= b.nextAttack) {
    resolveBarbarian(state);
    b.nextAttack = total + 3;
    b.attacks++;
  }
}

export function resolveBarbarian(state) {
  const cities = totalCities(state);
  const strengths = state.players.map(activeStrength);
  const sum = strengths.reduce((a, x) => a + x, 0);
  if (sum >= cities) {
    const bestS = Math.max(...strengths);
    const defenders = [];
    state.players.forEach((pl, i) => { if (strengths[i] === bestS && bestS >= 2) defenders.push(pl); });
    for (const d of defenders) {
      d.commodities.paper++; d.commodities.coin++; d.commodities.cloth++;
    }
    cnkLog(state, 'The barbarians are repelled by ' + sum + ' knights' + (defenders.length ? ' — ' + defenders.map(d => d.name + ' earns commodities' + (defenders.length > 1 ? ' and a victory point' : '')).join(', ') : '') + '!');
    for (const d of defenders) {
      if (defenders.length === 1) { d.vpHidden++; }
      d.hasDefenderOfCatan = false;
    }
    if (defenders.length === 1) cnkLog(state, defenders[0].name + ' gains +1 victory point for leading the defense.');
  } else {
    let weakest = -1, weakS = Infinity;
    for (const pl of state.players) {
      const hasCity = state.board.vertices.some(v => v.owner === pl.id && v.type === 'city');
      if (hasCity && strengths[pl.id] < weakS) { weakS = strengths[pl.id]; weakest = pl.id; }
    }
    if (weakest < 0) weakest = 0;
    const pl = state.players[weakest];
    for (const v of state.board.vertices) {
      if (v.owner === weakest && v.type === 'city') {
        v.type = 'settlement';
        pl.citiesLeft++;
        pl.settlementsLeft--;
        cnkLog(state, 'The barbarians sack a city belonging to ' + pl.name + '! It is reduced to a settlement.');
        break;
      }
    }
    updateDefender(state);
  }
  H.checkWin(state);
}

export function deactivateAllKnights(state) {
  for (const p of state.players) for (const k of p.knights) k.active = false;
  updateDefender(state);
}

export function merchantActive(p) {
  return p.merchantTurns > 0 || (p.improvements && p.improvements.trade >= 3);
}

export function pickNumber() { return 6; }

export function pickBestNumber(state, pid) {
  const b = state.board;
  const score = {};
  for (let n = 2; n <= 12; n++) {
    if (n === 7) continue;
    score[n] = 0;
  }
  const PIPS = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
  const me = state.players[pid];
  for (const h of b.hexes) {
    if (h.isSea || h.id === state.robber || !score[h.number]) continue;
    for (const vid of h.vertexIds) {
      const v = b.vertices[vid];
      if (v.owner !== undefined && v.owner === pid) score[h.number] += (PIPS[h.number] || 0) * (v.type === 'city' ? 2 : 1);
    }
  }
  let best = 6, bestS = -1;
  for (const n of Object.keys(score)) {
    if (score[n] > bestS) { bestS = score[n]; best = +n; }
  }
  return best;
}

function cnkCurrentPlayer(state) { return state.players[state.turn]; }

function cnkLog(state, msg) {
  state.log.push({ t: Date.now(), msg, turn: state.turnCount });
  if (state.log.length > 300) state.log.splice(0, state.log.length - 300);
}
