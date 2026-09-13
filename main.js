import { generateBoard, PRESETS } from './board.js';
import { createRenderer, fitView } from './render.js';
import { createInput } from './input.js';
import { createNet } from './net.js';
import { createUI, COLORS, el } from './ui.js';
import { serializeGame, deserializeGame } from './save.js';
import * as R from './rules.js';
import * as AI from './ai.js';
import { createSFX } from './sfx.js';
import { setAudioHook } from './rand.js';

const canvas = document.getElementById('board');
const renderer = createRenderer(canvas);
const net = createNet();
const $ = id => document.getElementById(id);
const sfx = createSFX();
setAudioHook(name => { try { sfx[name] && sfx[name](); } catch (e) {} });

let game = null;
let view = { scale: 1, ox: 0, oy: 0 };
let overlay = { pending: null, hover: null };
let mode = 'menu';
let myName = '';
let myColor = '#e74c3c';
let myPid = -1;
let myConnId = null;
let isHost = false;
let justPromoted = false;
let room = null;
let soloSettings = null;
let aiTimer = null;
let aiPace = null;
let shownGainsId = 0;
let aiBusy = false;
let aiTickCounter = 0;
let tradeWait = null;
let tradeBlocked = null;
let lastBoardWrapSize = '';
let turnStartAt = null;
const setupColor = { color: COLORS[0], colorIndex: 0 };
const mpColor = { color: COLORS[0], colorIndex: 0 };

const AI_NAMES = ['Ada', 'Boris', 'Cleo', 'Dmitri', 'Eva', 'Felix', 'Greta', 'Hank'];
const AI_DELAY = 800;
const AI_SETUP_DELAY = 650;
const AI_TURN_START_MS = 1100;
const AI_POST_ROLL_MS = 1400;
const AI_TRADE_WAIT_MS = 15000;

// ---------------- helpers ----------------

function uiOnScreen(id) { return !document.getElementById(id).classList.contains('hidden'); }
function uiOnGame() { return uiOnScreen('gameScreen'); }
function uiOnLobby() { return uiOnScreen('lobbyScreen'); }

function pickColor(used) {
  for (const c of COLORS) if (!used.has(c)) { used.add(c); return c; }
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}
function randomSeed() { return 'p-' + Math.floor(Math.random() * 1e6); }
function pidByName(name) { return game ? game.players.findIndex(p => p.name === name) : -1; }
function logMsg(st, msg) { R.log(st, msg); }

function resize() {
  const rect = $('boardWrap').getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return;
  renderer.resize(rect.width, rect.height, window.devicePixelRatio);
  if (game) Object.assign(view, fitView(game.board, rect.width, rect.height, 62));
}
window.addEventListener('resize', resize);
if (window.ResizeObserver) {
  new ResizeObserver(resize).observe($('boardWrap'));
}

function drawLoop() {
  const t = performance.now();
  if (uiOnGame() && game) {
    const r = $('boardWrap').getBoundingClientRect();
    const key = Math.round(r.width) + 'x' + Math.round(r.height);
    if (key !== lastBoardWrapSize) { lastBoardWrapSize = key; resize(); }
    renderer.draw(game, view, overlay, t);
    updateTurnTimer();
    if (ui && ui.tickTradeWait) ui.tickTradeWait();
  }
  setTimeout(drawLoop, 16);
}

function updateTurnTimer() {
  const g = game;
  const timerEl = document.getElementById('turnTimer');
  const run = g && g.phase === 'action' && g.turn === myPid && !g.pending && g.turnTimer > 0 && g.winner < 0;
  if (!run) {
    turnStartAt = null;
    if (timerEl) { timerEl.classList.add('hidden'); timerEl.textContent = ''; timerEl.style.color = ''; }
    return;
  }
  if (turnStartAt == null) turnStartAt = performance.now();
  const left = g.turnTimer - (performance.now() - turnStartAt) / 1000;
  if (timerEl) {
    timerEl.textContent = '⏱ ' + Math.max(0, Math.ceil(left));
    timerEl.classList.remove('hidden');
    if (left <= 5) timerEl.style.color = '#ff7b6b';
    else if (left <= 15) timerEl.style.color = '#ffd166';
    else timerEl.style.color = '';
  }
  if (left <= 0) {
    turnStartAt = null;
    try {
      if (!g.rolled) doAction({ type: 'roll' });
      else doAction({ type: 'endTurn' });
    } catch (e) { /* ignore */ }
  }
}

// ---------------- overlay / pending ----------------

function refreshOverlay() {
  if (!game) { overlay.pending = null; ui.hidePendingBar(); return; }
  const p = game.pending;
  if (!p) { overlay.pending = null; ui.hidePendingBar(); return; }
  const o = { type: p.type, hover: overlay.hover && overlay.hover.id };
  if (p.type === 'setupSettlement') o.valid = R.validSetupSettlements(game);
  else if (p.type === 'setupRoad') o.valid = R.validSetupRoads(game);
  else if (p.type === 'knight') o.valid = R.validKnightSpots(game, p.playerId);
  else if (p.type === 'robber') {
    const seaf = game.expansions && game.expansions.seafarers;
    o.valid = game.board.hexes.map(h => h.id).filter(id => {
      const hx = game.board.hexById.get(id);
      if (hx.isSea) return seaf && game.pirate != null && id !== game.pirate;
      return id !== game.robber;
    });
  }
  else o.valid = p.valid || [];
  overlay.pending = o;
}

function clearExpiredTrades() {
  if (!game) return;
  const before = game.trades.length;
  game.trades = (game.trades || []).filter(t => t.expires == null || game.turnCount < t.expires);
  if (game.trades.length < before) logMsg(game, 'Unaccepted trade offers have expired.');
}

function doOfferTrade(st, action, fromPid) {
  const p = st.players[fromPid];
  const offer = {
    id: 't' + st.turnCount + '_' + st.trades.length + '_' + Math.floor(Math.random() * 1e5),
    from: fromPid, give: action.give, giveCount: action.giveCount,
    get: action.get, getCount: action.getCount, target: action.target,
    expires: st.turnCount + st.players.length,
    responses: {},
  };
  st.trades.push(offer);
  logMsg(st, p.name + ' offers ' + action.giveCount + ' ' + action.give + ' for ' + action.getCount + ' ' + action.get + '.');
  sfx.trade();
  return offer;
}

function tradeResponders(st, t) {
  if (t.target === 'all') return st.players.map((_, i) => i).filter(i => i !== t.from);
  return t.target != null ? [t.target] : [];
}

function recordTradeResponse(st, offer, pid, accept) {
  if (offer.responses[pid]) throw new Error('You have already responded to this offer.');
  if (accept && st.players[pid].res[offer.get] < offer.getCount) throw new Error('Not enough resources to complete the trade.');
  offer.responses[pid] = accept ? 'a' : 'd';
  logMsg(st, st.players[pid].name + (accept ? ' accepts ' : ' declines ') + st.players[offer.from].name + "'s trade offer.");
  sfx.ui();
  if (tradeWait && tradeWait.offerId === offer.id) {
    const humans = tradeResponders(st, offer).filter(pid2 => !st.players[pid2].isAI);
    if (humans.every(pid2 => offer.responses[pid2])) {
      clearTradeWait();
      kickAI();
    }
  }
}

function doCompleteTrade(st, offer, pid) {
  if (offer.responses[pid] !== 'a') throw new Error(st.players[pid].name + ' has not accepted the offer.');
  if (st.players[offer.from].res[offer.give] < offer.giveCount) {
    st.trades = st.trades.filter(x => x !== offer);
    throw new Error('You no longer have the resources for that offer.');
  }
  if (st.players[pid].res[offer.get] < offer.getCount) {
    st.trades = st.trades.filter(x => x !== offer);
    throw new Error(st.players[pid].name + ' no longer has the resources for that offer.');
  }
  R.transfer(st, offer.from, pid, offer.give, offer.giveCount);
  R.transfer(st, pid, offer.from, offer.get, offer.getCount);
  st.trades = st.trades.filter(x => x !== offer);
  logMsg(st, st.players[offer.from].name + ' trades ' + offer.giveCount + ' ' + offer.give + ' with ' + st.players[pid].name + ' for ' + offer.getCount + ' ' + offer.get + '.');
  R.checkWin(st);
  sfx.trade();
}

function doAcceptTrade(st, action, acceptorPid) {
  const t = st.trades.find(x => x.id === action.id);
  if (!t) throw new Error('That trade is no longer available.');
  if (t.target !== 'all' && t.target !== acceptorPid) throw new Error('This trade is not for you.');
  if (t.from === acceptorPid) throw new Error('You cannot accept your own trade.');
  recordTradeResponse(st, t, acceptorPid, true);
}

// ---------------- actions ----------------

function performLocal(action, actorPid) {
  const st = game;
  switch (action.type) {
    case 'roll': R.rollDice(st); break;
    case 'endTurn': R.endTurn(st); clearExpiredTrades(); break;
    case 'cancel': R.cancelPending(st); break;
    case 'startSettlement': R.startBuildSettlement(st); break;
    case 'startCity': R.startBuildCity(st); break;
    case 'startRoad': R.startBuildRoad(st); break;
    case 'startShip': R.startBuildShip(st); break;
    case 'buildSettlement': buildOrStart(st, 'settlement', action.vid, actorPid); break;
    case 'buildCity': R.startBuildCity(st); R.buildCity(st, action.vid); break;
    case 'buildRoad': buildOrStart(st, 'road', action.eid, actorPid); break;
    case 'buildShip': buildOrStart(st, 'ship', action.eid, actorPid); break;
    case 'setupSettlement': R.placeSetupSettlement(st, action.vid); break;
    case 'setupRoad': R.placeSetupRoad(st, action.eid); break;
    case 'undoBuild': R.undoBuild(st); break;
    case 'discard': R.discard(st, actorPid != null ? actorPid : (action.pid != null ? action.pid : myPid), action.choices); break;
    case 'robber': R.placeRobber(st, action.hid); break;
    case 'pirate': R.placePirate(st, action.hid); break;
    case 'steal': R.stealFrom(st, action.target); break;
    case 'year': R.yearOfPlenty(st, action.choices); break;
    case 'monopoly': R.monopoly(st, action.res); break;
    case 'buyDev': R.buyDevCard(st); break;
    case 'playDev': R.playDevCard(st, action.idx); break;
    case 'improvement': R.buildImprovement(st, action.track); break;
    case 'knight': R.buildKnight(st, action.vid); break;
    case 'startKnight': R.startBuildKnight(st); break;
    case 'upgradeKnight': R.upgradeKnight(st, action.idx); break;
    case 'activateKnight': R.activateKnight(st, action.idx); break;
    case 'progress': R.playProgressCard(st, action.idx); break;
    case 'alchemist': R.resolveAlchemist(st, action.number); break;
    case 'crane': R.resolveCrane(st, action.track); break;
    case 'intrigue': R.resolveIntrigue(st, action.target); break;
    case 'monopolyC': R.resolveMonopolyC(st, action.com); break;
    case 'bankTrade': R.tradeWithBank(st, action.give, action.giveCount, action.get); break;
    case 'offerTrade': doOfferTrade(st, action, actorPid != null ? actorPid : st.turn); break;
    case 'acceptTrade': doAcceptTrade(st, action, actorPid != null ? actorPid : myPid); break;
    case 'completeTrade': {
      const t = st.trades.find(x => x.id === action.id);
      if (!t) throw new Error('That trade is no longer available.');
      const owner = actorPid != null ? actorPid : st.turn;
      if (t.from !== owner) throw new Error('Only the offerer can complete this trade.');
      doCompleteTrade(st, t, action.pid);
      break;
    }
    case 'cancelTrade': {
      if (tradeWait && tradeWait.offerId === action.id) tradeBlocked = { pid: tradeWait.pid, turn: st.turnCount };
      const actor = actorPid != null ? actorPid : myPid;
      const t = st.trades.find(x => x.id === action.id);
      if (t && actor === t.from) {
        st.trades = st.trades.filter(x => x.id !== action.id);
        logMsg(st, st.players[actor].name + ' withdraws their trade offer.');
      } else if (t) {
        recordTradeResponse(st, t, actor, false);
      } else {
        logMsg(st, 'A trade offer was withdrawn.');
      }
      break;
    }
    default: throw new Error('Unknown action: ' + action.type);
  }
  afterChange();
}

function buildOrStart(st, type, spot, actorPid) {
  const pend = st.pending;
  const okPend = pend && pend.playerId === (actorPid != null ? actorPid : myPid) && pend.type === type;
  if (!okPend) {
    if (type === 'settlement') st.pending = { type: 'settlement', playerId: st.turn, valid: R.validSettlementSpots(st, st.turn) };
    else if (type === 'road') st.pending = { type: 'road', playerId: st.turn, valid: R.validRoadSpots(st, st.turn) };
    else st.pending = { type: 'ship', playerId: st.turn, valid: R.validShipSpots(st, st.turn) };
  }
  if (type === 'settlement') R.buildSettlement(st, spot);
  else if (type === 'road') R.buildRoad(st, spot);
  else R.buildShip(st, spot);
}

function afterChange() {
  refreshOverlay();
  if (uiOnGame()) {
    ui.renderHUD(game, myPid);
    if (game && game.lastGains && game.lastGains.length && game.gainsId !== shownGainsId) {
      shownGainsId = game.gainsId;
      ui.animateGains(game, myPid);
    }
    checkPending();
  }
  sfxCue();
  if (tradeWait && !(game && game.trades && game.trades.some(t => t.id === tradeWait.offerId))) clearTradeWait();
  kickAI();
}

let lastSfxSig = '';
let lastSfxWinner = -2;
function sfxCue() {
  if (!game) return;
  if (game.winner >= 0 && game.winner !== lastSfxWinner) {
    lastSfxWinner = game.winner;
    sfx.victory();
    return;
  }
  if (game.winner < 0) lastSfxWinner = -1;
  const g = game;
  const pend = g.pending;
  const sig = g.phase + '|' + g.turn + '|' + g.turnCount + '|' + (pend ? pend.playerId + ':' + pend.type : '');
  if (sig === lastSfxSig) return;
  lastSfxSig = sig;
  if (pend && pend.playerId === myPid) { sfx.attention(); return; }
  if (g.phase === 'action' && !g.pending) {
    if (g.turn === myPid) sfx.turn();
    else sfx.notify();
  }
}

function doAction(action) {
  if (!game) return;
  try {
    if (mode === 'mp' && !isHost) {
      const optimistic = action.type !== 'roll' && action.type !== 'steal';
      if (optimistic) performLocal(action);
      net.sendAction(action);
      if (!optimistic) ui.toast('Waiting for host…');
    } else {
      performLocal(action);
      if (mode === 'mp') pushState();
    }
  } catch (e) {
    sfx.error();
    ui.toast(e.message || 'Invalid move');
  }
}

// ---------------- UI handlers ----------------

const handlers = {
  get view() { return view; },
  getTradeWait() { return tradeWait ? { offerId: tradeWait.offerId, deadline: tradeWait.deadline } : null; },
  gameAction(act) {
    if (!game || game.phase === 'gameOver') return;
    if (act === 'cancel') { doAction({ type: 'cancel' }); return; }
    if (act === 'guide') { ui.showBuildGuide(game); return; }
    if (game.turn !== myPid) { ui.toast('Not your turn'); return; }
    if (act === 'roll') doAction({ type: 'roll' });
    else if (act === 'endTurn') doAction({ type: 'endTurn' });
    else if (act === 'road') performLocal({ type: 'startRoad' });
    else if (act === 'settlement') performLocal({ type: 'startSettlement' });
    else if (act === 'city') performLocal({ type: 'startCity' });
    else if (act === 'devcard') doAction({ type: 'buyDev' });
    else if (act === 'dev') ui.showDevCardsModal(game, myPid);
    else if (act === 'improvement') ui.showImprovementModal(game, myPid);
    else if (act === 'knight') doAction({ type: 'startKnight' });
    else if (act === 'upgrade') ui.showKnightModal(game, myPid, 'upgrade');
    else if (act === 'activate') ui.showKnightModal(game, myPid, 'activate');
    else if (act === 'progress') ui.showProgressModal(game, myPid);
    else if (act === 'trade') ui.showTradeModal(game, myPid, R.getTradeRate);
    else if (act === 'undo') doAction({ type: 'undoBuild' });
  },
  modalAction(action) {
    if (action.type === 'playAgain') {
      if (mode === 'solo' && soloSettings) startSolo(soloSettings);
      else if (mode === 'mp' && isHost) startMpGame();
      else if (mode === 'mp') { ui.toast('Only the host can start a new game'); setTimeout(() => { if (game) ui.showGameOver(game, myPid); }, 100); }
      return;
    }
    if (action.type === 'goMenu') { gotoMenu(); return; }
    doAction(action);
  },
  gameMenu(act) {
    if (act === 'resume') ui.closeModal();
    else if (act === 'chat') { ui.closeModal(); ui.toggleChat(true); }
    else if (act === 'howto') { ui.closeModal(); ui.showHowTo(); }
    else if (act === 'leave') {
      ui.closeModal();
      if (mode === 'mp') { net.leaveRoom(); ui.toast('You left the room.'); gotoMenu(); }
      else gotoMenu();
    }
  },
  onTap(hit) {
    if (!game || !game.pending) return;
    const pend = game.pending;
    if (pend.playerId !== myPid) return;
    if ((pend.type === 'settlement' || pend.type === 'setupSettlement' || pend.type === 'knight') && hit.type === 'vertex') {
      doAction(pend.type === 'setupSettlement' ? { type: 'setupSettlement', vid: hit.id } : pend.type === 'knight' ? { type: 'knight', vid: hit.id } : { type: 'buildSettlement', vid: hit.id });
    } else if (pend.type === 'city' && hit.type === 'vertex') {
      doAction({ type: 'buildCity', vid: hit.id });
    } else if ((pend.type === 'road' || pend.type === 'setupRoad' || pend.type === 'ship') && hit.type === 'edge') {
      doAction(pend.type === 'setupRoad' ? { type: 'setupRoad', eid: hit.id } : pend.type === 'road' ? { type: 'buildRoad', eid: hit.id } : { type: 'buildShip', eid: hit.id });
    } else if (pend.type === 'robber' && hit.type === 'hex') {
      const hx = game.board.hexById.get(hit.id);
      if (hx.isSea) doAction({ type: 'pirate', hid: hit.id });
      else doAction({ type: 'robber', hid: hit.id });
    }
  },
  onHover(hover) {
    overlay.hover = hover;
    if (overlay.pending && hover) {
      const t = hover.type;
      const bt = overlay.pending.type;
      const ok = (bt === 'settlement' || bt === 'setupSettlement' || bt === 'city' || bt === 'knight') ? t === 'vertex'
        : (bt === 'road' || bt === 'setupRoad' || bt === 'ship') ? t === 'edge'
          : (bt === 'robber') ? t === 'hex' : false;
      overlay.pending.hover = ok ? hover.id : null;
    } else if (overlay.pending) {
      overlay.pending.hover = null;
    }
  },
};

const ui = createUI(handlers);
const input = createInput(canvas, renderer, view, {
  getBoard: () => (game ? game.board : null),
  getPending: () => overlay.pending,
  onTap: handlers.onTap,
  onHover: handlers.onHover,
  onViewChange: () => {},
});

// ---------------- pending / AI ----------------

function checkPending() {
  if (!game) return;
  if (game.phase === 'gameOver') { ui.closeModal(); ui.showGameOver(game, myPid); stopAi(); return; }
  const pend = game.pending;
  if (pend && pend.playerId === myPid) {
    const t = pend.type;
    if (t === 'discard') ui.showForced('discard', () => ui.showDiscardModal(game));
    else if (t === 'steal') ui.showForced('steal', () => ui.showStealModal(game));
    else if (t === 'year') ui.showForced('year', () => ui.showYearModal(game));
    else if (t === 'monopoly') ui.showForced('monopoly', () => ui.showMonopolyModal(game));
    else if (t === 'alchemist') ui.showForced('alchemist', () => ui.showAlchemistModal(game));
    else if (t === 'crane') ui.showForced('crane', () => ui.showCraneModal(game));
    else if (t === 'intrigue') ui.showForced('intrigue', () => ui.showIntrigueModal(game));
    else if (t === 'monopolyC') ui.showForced('monopolyC', () => ui.showMonopolyCModal(game));
    else { ui.closeForced(); ui.showPendingBar(t, t !== 'setupSettlement' && t !== 'setupRoad', game); }
  } else {
    ui.closeForced();
    ui.hidePendingBar();
  }
}

function aiTargets(st, t) {
  const unresponded = (i) => !(t.responses && t.responses[i]);
  if (t.target === 'all') return st.players.map((p, i) => i).filter(i => st.players[i].isAI && i !== t.from && unresponded(i));
  if (st.players[t.target] && st.players[t.target].isAI && unresponded(t.target)) return [t.target];
  return [];
}

function needsAI(st) {
  if (tradeWait) return false;
  if (!st || st.phase === 'gameOver') return false;
  if (st.trades && st.trades.some(t => aiTargets(st, t).length > 0) && st.phase === 'action' && !st.pending) return true;
  if (st.pending && st.pending.playerId >= 0 && st.players[st.pending.playerId].isAI) return true;
  if (st.phase === 'setup') return st.players[st.setup.order[st.setup.index]].isAI;
  if (st.phase === 'action') return st.players[st.turn].isAI;
  return false;
}

function kickAI() {
  if (mode !== 'solo' && mode !== 'mp') return;
  if (mode === 'mp' && !isHost) return;
  if (aiBusy) return;
  if (aiTimer) return;
  ensureProgressable();
  if (!needsAI(game)) return;
  aiTimer = setTimeout(aiStep, AI_DELAY);
}

function stopAi() { aiPace = null; clearTradeWait(); tradeBlocked = null; if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; } }

function clearTradeWait() {
  if (tradeWait) {
    if (tradeWait.timer) clearTimeout(tradeWait.timer);
    tradeWait = null;
  }
}

function beginTradeWait(offerId, pid) {
  clearTradeWait();
  tradeWait = { offerId, pid, deadline: Date.now() + AI_TRADE_WAIT_MS, timer: null };
  tradeWait.timer = setTimeout(() => {
    if (!tradeWait || tradeWait.offerId !== offerId) return;
    if (game) tradeBlocked = { pid: tradeWait.pid, turn: game.turnCount };
    tradeWait = null;
    kickAI();
  }, AI_TRADE_WAIT_MS);
}

function tradeTargetsHuman(st, t) {
  if (t.target === 'all') return st.players.some((pl, i) => !pl.isAI && i !== t.from);
  return st.players[t.target] && !st.players[t.target].isAI && t.target !== t.from;
}

function ensureProgressable() {
  if (!game || mode !== 'mp') return;
  let pid = -1;
  if (game.phase === 'setup') pid = game.setup.order[game.setup.index];
  else if (game.phase === 'action') pid = game.turn;
  if (game.pending && game.pending.playerId >= 0) pid = game.pending.playerId;
  if (pid < 0 || pid === myPid) return;
  const p = game.players[pid];
  if (!p.isHuman) return;
  if (room && room.players) {
    const seat = room.players.find(rp => rp.name === p.name);
    if (seat && !seat.isAI && seat.connId != null) return;
  }
  p.isHuman = false;
  p.isAI = true;
  logMsg(game, p.name + ' has disconnected — the AI takes over their pieces.');
  afterChange();
  if (mode === 'mp') pushState();
}

function aiTradeStep(st) {
  if (!st.trades) return false;
  for (const t of st.trades) {
    if (tradeWait && tradeWait.offerId === t.id) continue;
    const targets = aiTargets(st, t);
    if (!targets.length) continue;
    const pid = targets[0];
    if (AI.aiRespondToTrade(st, t, pid).accept) {
      try { doAcceptTrade(st, { id: t.id }, pid); return true; }
      catch (e) { st.trades = st.trades.filter(x => x !== t); return true; }
    } else {
      try { recordTradeResponse(st, t, pid, false); return true; }
      catch (e) { st.trades = st.trades.filter(x => x !== t); return true; }
    }
  }
  return false;
}

function aiCompleteOwnTrades(st) {
  const me = st.turn;
  if (!st.players[me].isAI) return false;
  for (const t of st.trades) {
    if (t.from !== me) continue;
    const acc = tradeResponders(st, t).find(pid => t.responses && t.responses[pid] === 'a');
    if (acc != null) {
      try { doCompleteTrade(st, t, acc); return true; }
      catch (e) { st.trades = st.trades.filter(x => x !== t); return true; }
    }
  }
  return false;
}

function aiStep() {
  aiTimer = null;
  if (aiBusy) return;
  aiBusy = true;
  try {
    if (!game || game.phase === 'gameOver') return;
    const st = game;
    ensureProgressable();
    if (!needsAI(st)) return;
    let did = false;
    let nextDelay = st.phase === 'setup' ? AI_SETUP_DELAY : AI_DELAY;
    if (st.phase === 'action' && !st.pending) {
      did = aiTradeStep(st);
    }
    if (!did && st.phase === 'action' && !st.pending) {
      did = aiCompleteOwnTrades(st);
    }
    if (!did) {
      if (st.pending && st.pending.playerId >= 0 && st.players[st.pending.playerId].isAI) {
        const pt = st.pending.type;
        if (pt === 'setupSettlement' || pt === 'setupRoad') AI.aiSetupStep(st, st.pending.playerId);
        else AI.aiHandlePending(st, st.pending.playerId);
        did = true;
      } else if (st.phase === 'setup') {
        const sp = st.players[st.setup.order[st.setup.index]];
        if (sp.isAI) { AI.aiSetupStep(st, sp.id); did = true; }
      } else if (st.phase === 'action') {
        const p = st.players[st.turn];
        if (p.isAI) {
          if (!st.rolled) {
            if (aiPace && aiPace.kind === 'turnStart' && aiPace.pid === st.turn) {
              aiPace = null;
              R.rollDice(st);
              did = true;
              nextDelay = AI_POST_ROLL_MS;
            } else {
              aiPace = { kind: 'turnStart', pid: st.turn };
              ui.setPhaseText(p.name + ' is thinking…');
              aiTimer = setTimeout(aiStep, AI_TURN_START_MS);
              return;
            }
          } else {
            const move = AI.aiChooseAction(st, p.id);
            let made = false;
            if (move) {
              const r = AI.applyAiMove(st, p.id, move);
              made = r !== false;
            }
            if (!made && !(tradeBlocked && tradeBlocked.pid === p.id && tradeBlocked.turn === st.turnCount)) {
              const offer = AI.aiProposeTrade(st, p.id);
              if (offer) {
                try {
                  const madeOffer = doOfferTrade(st, offer, p.id);
                  made = true;
                  if (madeOffer && tradeTargetsHuman(st, madeOffer)) beginTradeWait(madeOffer.id, p.id);
                }
                catch (e) { /* fall through */ }
              }
            }
            if (!made) {
              const trade = AI.aiBankTrade(st, p.id);
              if (trade) {
                try { R.tradeWithBank(st, trade.give, R.getTradeRate(st, p, trade.give), trade.get); made = true; }
                catch (e) { /* fallthrough to end turn */ }
              }
            }
            if (!made) R.endTurn(st);
            did = true;
          }
        }
      }
    }
    if (did) {
      afterChange();
      if (mode === 'mp' && isHost) pushState();
      if (needsAI(st)) aiTimer = setTimeout(aiStep, nextDelay);
    }
  } finally { aiBusy = false; }
}

// ---------------- game entry ----------------

function enterGameScreen() {
  ui.showScreen('gameScreen');
  setTimeout(resize, 0);
  refreshOverlay();
  ui.renderHUD(game, myPid);
  checkPending();
  kickAI();
}

function startSolo(settings) {
  stopAi();
  mode = 'solo';
  isHost = true;
  myName = settings.name;
  myColor = settings.color;
  const used = new Set([settings.color]);
  const roster = [{ name: settings.name, color: settings.color, isHuman: true, isAI: false }];
  const target = Math.max(2, Math.min(6, settings.aiCount + 1));
  for (let i = 0; i < target - 1; i++) roster.push({ name: AI_NAMES[i], color: pickColor(used), isHuman: false, isAI: true, ai: { difficulty: settings.aiDifficulty, style: settings.aiStyle } });
  if (target > 4) {
    const psz = settings.preset ? (PRESETS.find(p => p.id === settings.preset) || {}).size : null;
    if (psz !== 'large') {
      settings.preset = null;
      if (settings.size !== 'large') settings.size = 'large';
    }
  }
  game = R.createGame({ seed: settings.seed, size: settings.size, shape: settings.shape, preset: settings.preset || null, players: roster,
    winVP: settings.winVP, discardThreshold: settings.discard, friendlyRobber: settings.friendly, turnTimer: settings.timer,
    undoAllowed: !!settings.undo,
    seafarers: settings.expansion === 'seafarers' || settings.expansion === 'both',
    cnk: settings.expansion === 'cnk' || settings.expansion === 'both' });
  myPid = 0;
  enterGameScreen();
}

function buildRoster() {
  const humans = room.players.filter(p => !p.isAI);
  const used = new Set(humans.map(p => p.color));
  const roster = humans.map(p => ({ name: p.name, color: p.color, isHuman: true, isAI: false }));
  const target = Math.max(2, Math.min(6, humans.length + room.settings.aiCount));
  let aiIdx = 0;
  while (roster.length < target) {
    roster.push({ name: AI_NAMES[aiIdx], color: pickColor(used), isHuman: false, isAI: true, ai: { difficulty: room.settings.aiDifficulty, style: room.settings.aiStyle } });
    aiIdx++;
  }
  return roster.slice(0, 6);
}

function startMpGame() {
  if (!room) return;
  stopAi();
  const roster = buildRoster();
  if (roster.length > 4) {
    const psz = room.settings.map ? (PRESETS.find(p => p.id === room.settings.map) || {}).size : null;
    if (psz !== 'large') {
      room.settings.map = 'random';
      if (room.settings.size !== 'large') room.settings.size = 'large';
    }
  }
  const preset = room.settings.map && room.settings.map !== 'random' ? room.settings.map : null;
  game = R.createGame({ seed: room.settings.seed, size: room.settings.size, shape: room.settings.shape, preset, players: roster,
    winVP: room.settings.winVP, discardThreshold: room.settings.discardThreshold,
    friendlyRobber: room.settings.friendlyRobber, turnTimer: room.settings.turnTimer,
    undoAllowed: !!room.settings.undo,
    seafarers: room.settings.expansion === 'seafarers' || room.settings.expansion === 'both',
    cnk: room.settings.expansion === 'cnk' || room.settings.expansion === 'both' });
  myPid = 0;
  isHost = true;
  justPromoted = false;
  enterGameScreen();
  net.startGame(serializeGame(game));
}

function gotoMenu() {
  stopAi();
  ui.closeModal();
  ui.hidePendingBar();
  ui.toggleChat(false);
  if (mode === 'mp') net.leaveRoom();
  mode = 'menu';
  game = null;
  room = null;
  isHost = false;
  justPromoted = false;
  myPid = -1;
  ui.showScreen('menuScreen');
}

// ---------------- multiplayer ----------------

function adoptState(save) {
  game = deserializeGame(save);
  myPid = pidByName(myName);
  if (myPid < 0 && game.players.length > 0) myPid = 0;
  if (uiOnGame()) {
    afterChange();
  } else {
    enterGameScreen();
  }
}

function pushState() { if (game) net.pushState(serializeGame(game)); }

net.on('welcome', msg => { myConnId = msg.connId; });
net.on('open', () => { net.onStatus && net.onStatus('Connected'); });
net.on('close', () => { net.onStatus && net.onStatus('Reconnecting…'); });
net.on('error', msg => { ui.toast(msg.msg || 'Server error'); });
net.on('you_are_host', () => {
  isHost = true;
  justPromoted = true;
  ui.toast('You are now the host.');
  if (uiOnLobby()) { if (room) ui.renderLobby(room, true, myName); }
});
net.on('lobby', msg => {
  if (mode === 'menu' || !msg.room) return;
  room = msg.room;
  const hostNow = room.hostConnId != null && room.hostConnId === myConnId;
  if (hostNow && !isHost) { isHost = true; justPromoted = true; ui.toast('You are now the host.'); }
  if (uiOnGame()) {
    ui.renderHUD(game, myPid);
    if (game && room.players) {
      for (const seat of room.players) {
        const pid = game.players.findIndex(p => p.name === seat.name);
        if (pid < 0) continue;
        const connected = !seat.isAI && seat.connId != null;
        if (connected && game.players[pid].isAI) {
          game.players[pid].isAI = false;
          game.players[pid].isHuman = true;
          logMsg(game, seat.name + ' has rejoined as a human player.');
          afterChange();
        } else if (!connected && !game.players[pid].isAI) {
          game.players[pid].isAI = true;
          game.players[pid].isHuman = false;
          logMsg(game, seat.name + ' has disconnected — the AI takes over their pieces.');
          afterChange();
        }
      }
    }
  }
  else if (!uiOnLobby()) { ui.showScreen('lobbyScreen'); ui.renderLobby(room, isHost, myName); }
  else { ui.renderLobby(room, isHost, myName); }
});
net.on('state', msg => {
  if (mode === 'menu') return;
  if (isHost && !justPromoted) return;
  justPromoted = false;
  adoptState(msg.save);
});
net.on('relay', msg => {
  if (mode !== 'mp' || !isHost || !game) return;
  const pid = pidByName(msg.from);
  if (pid < 0) return;
  const action = msg.action;
  if (!action || typeof action !== 'object') return;
  if (!hostCanProcess(pid, action)) return;
  try {
    performLocal(action, pid);
    if (mode === 'mp') pushState();
  } catch (e) { /* invalid action from a client — ignore */ }
});
net.on('chat', msg => {
  if (mode === 'menu') return;
  if (uiOnLobby()) ui.addLobbyChat(msg.name, msg.text);
  if (uiOnGame()) ui.addGameChat(msg.name, msg.text);
});

function hostCanProcess(pid, action) {
  const st = game;
  switch (action.type) {
    case 'roll': case 'endTurn': case 'startSettlement': case 'startCity': case 'startRoad':
    case 'buildSettlement': case 'buildCity': case 'buildRoad': case 'buyDev': case 'playDev':
    case 'bankTrade': case 'offerTrade':
    case 'undoBuild':
    case 'improvement': case 'startKnight': case 'upgradeKnight': case 'activateKnight': case 'progress':
      return st.phase === 'action' && st.turn === pid;
    case 'completeTrade':
      return st.phase === 'action' && st.turn === pid;
    case 'cancelTrade': {
      const t = st.trades && st.trades.find(x => x.id === action.id);
      if (!t) return false;
      if (t.from === pid) return st.phase === 'action' && st.turn === pid;
      return t.target === 'all' ? pid !== t.from : t.target === pid;
    }
    case 'cancel':
      return st.pending && st.pending.playerId === pid;
    case 'discard':
      return st.discardsLeft.some(d => d.pid === pid);
    case 'robber': case 'pirate': case 'steal': case 'year': case 'monopoly':
    case 'knight': case 'alchemist': case 'crane': case 'intrigue': case 'monopolyC':
      return st.pending && st.pending.playerId === pid;
    case 'setupSettlement': case 'setupRoad':
      return st.phase === 'setup' && st.setup.order[st.setup.index] === pid;
    case 'acceptTrade':
      return true;
    default:
      return false;
  }
}

// ---------------- menu / setup / multi wiring ----------------

function initColorPickers() {
  const mk = (boxId, store) => {
    const box = $(boxId);
    box.innerHTML = '';
    COLORS.forEach((c, i) => {
      const s = el('div', { class: 'swatch' + (i === 0 ? ' sel' : ''), style: 'background:' + c });
      s.addEventListener('click', () => {
        box.querySelectorAll('.swatch').forEach(x => x.classList.remove('sel'));
        s.classList.add('sel');
        store.color = c;
        store.colorIndex = i;
      });
      box.appendChild(s);
    });
  };
  mk('setupColors', setupColor);
  mk('mpColors', mpColor);
}

function readSoloSettings() {
  const mapSel = $('setupMap').value;
  const preset = mapSel && mapSel !== 'random' ? mapSel : null;
  return {
    name: $('setupName').value.trim() || 'Player',
    color: setupColor.color,
    colorIndex: setupColor.colorIndex,
    aiCount: parseInt($('setupAiCount').value, 10) || 1,
    aiDifficulty: $('setupAiDiff').value,
    aiStyle: $('setupAiStyle').value,
    winVP: parseInt($('setupWinVP').value, 10) || 10,
    discard: $('setupDiscard').value,
    friendly: $('setupFriendly').value === 'on',
    undo: $('setupUndo').value === 'on',
    timer: parseInt($('setupTimer').value, 10) || 0,
    expansion: $('setupExpansion').value,
    size: $('setupSize').value,
    shape: $('setupShape').value,
    seed: $('setupSeed').value.trim() || randomSeed(),
    preset,
  };
}

const previewRenderer = createRenderer($('setupPreview'));
function updatePreview() {
  const s = readSoloSettings();
  const seaf = s.expansion === 'seafarers' || s.expansion === 'both';
  const board = generateBoard({ seed: s.seed, size: s.size, shape: s.shape, preset: s.preset, hexSize: 30, seafarers: seaf });
  const desert = board.hexes.find(h => h.resource === 'desert');
  const fake = { board, players: [], robber: desert ? desert.id : board.hexes[0].id };
  const pv = fitView(board, previewRenderer.width || 600, previewRenderer.height || 180, 12);
  previewRenderer.draw(fake, pv, null, performance.now());
}

function initSetupScreen() {
  $('setupSeedRandom').addEventListener('click', () => { $('setupSeed').value = randomSeed(); updatePreview(); });
  for (const id of ['setupAiCount', 'setupSize', 'setupShape', 'setupSeed', 'setupMap']) {
    $(id).addEventListener('input', updatePreview);
  }
  $('setupName').addEventListener('input', () => {});
  $('btnSetupBack').addEventListener('click', () => ui.showScreen('menuScreen'));
  $('btnSetupStart').addEventListener('click', () => {
    const settings = readSoloSettings();
    $('setupSeed').value = settings.seed;
    startSolo(settings);
  });
  setTimeout(() => {
    previewRenderer.resize($('setupPreview').clientWidth || 600, 180, window.devicePixelRatio);
    updatePreview();
  }, 0);
}

function initMenuScreen() {
  $('btnSolo').addEventListener('click', () => { ui.showScreen('setupScreen'); setTimeout(updatePreview, 0); });
  $('btnMulti').addEventListener('click', () => { ui.showScreen('multiScreen'); updateMpStatus(); });
  $('btnHowTo').addEventListener('click', () => ui.showHowTo());
}

function updateMpStatus() {
  const elt = $('mpStatus');
  if (!elt) return;
  elt.textContent = net.isOpen() ? 'Connected to server.' : 'Connecting to server…';
}

function initMultiScreen() {
  $('btnMultiBack').addEventListener('click', () => ui.showScreen('menuScreen'));
  $('btnCreate').addEventListener('click', () => $('mpCreateOpts').classList.toggle('hidden'));
  $('btnJoin').addEventListener('click', () => {
    const code = $('mpCode').value.trim().toUpperCase();
    const name = $('mpName').value.trim() || 'Player';
    if (!code) { ui.toast('Enter a room code'); return; }
    myName = name;
    myColor = mpColor.color;
    mode = 'mp';
    net.joinRoom({ code, playerName: name, color: mpColor.color });
    $('mpStatus').textContent = 'Joining ' + code + '…';
  });
  $('btnCreateGo').addEventListener('click', () => {
    const name = $('mpName').value.trim() || 'Player';
    myName = name;
    myColor = mpColor.color;
    mode = 'mp';
    const seed = randomSeed();
    const opts = {
      name: 'Pioneers Room',
      playerName: name, color: mpColor.color,
      size: $('mpSize').value, shape: $('mpShape').value,
      seed, aiCount: parseInt($('mpAiCount').value, 10) || 1,
      aiDifficulty: $('mpAiDiff').value, aiStyle: $('mpAiStyle').value,
      winVP: parseInt($('mpWinVP').value, 10) || 10,
      discard: $('mpDiscard').value, friendly: $('mpFriendly').value === 'on',
      undo: $('mpUndo').value === 'on',
      timer: parseInt($('mpTimer').value, 10) || 0,
      expansion: $('mpExpansion').value,
      map: $('mpMap').value,
    };
    net.createRoom(opts);
    $('mpStatus').textContent = 'Creating room…';
  });
  $('btnLobbyLeave').addEventListener('click', () => { net.leaveRoom(); ui.showScreen('multiScreen'); });
  $('btnLobbyStart').addEventListener('click', () => startMpGame());
  const wireChat = (inputId, sendId, fn) => {
    const send = () => { const v = $(inputId).value.trim(); if (!v) return; fn(v); $(inputId).value = ''; };
    $(sendId).addEventListener('click', send);
    $(inputId).addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
  };
  wireChat('lobbyChatInput', 'lobbyChatSend', t => net.chat(t));
  wireChat('gameChatInput', 'gameChatSend', t => net.chat(t));
}

function initGameScreen() {
  $('btnRoll').addEventListener('click', () => handlers.gameAction('roll'));
  $('btnEndTurn').addEventListener('click', () => handlers.gameAction('endTurn'));
  $('btnGameMenu').addEventListener('click', () => ui.showGameMenu(mode === 'mp'));
  $('btnGuide').addEventListener('click', () => handlers.gameAction('guide'));
  const sfxBtn = $('btnSfx');
  const syncSfxBtn = () => { sfxBtn.textContent = sfx.isMuted() ? '🔇' : '🔊'; sfxBtn.title = sfx.isMuted() ? 'Sound is off — tap to enable' : 'Sound is on — tap to mute'; };
  syncSfxBtn();
  sfxBtn.addEventListener('click', () => { sfx.unlock(); sfx.setMuted(!sfx.isMuted()); syncSfxBtn(); if (!sfx.isMuted()) sfx.click(); });
  $('btnChat').addEventListener('click', () => {
    const p = $('chatPanel');
    p.classList.toggle('hidden');
  });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (game && game.pending && game.pending.playerId === myPid) {
        const t = game.pending.type;
        if (t === 'settlement' || t === 'city' || t === 'road' || t === 'robber' || t === 'knight') doAction({ type: 'cancel' });
      }
      ui.closeModal();
      ui.toggleChat(false);
    }
  });
}

// ---------------- boot ----------------

function boot() {
  initColorPickers();
  initMenuScreen();
  initSetupScreen();
  initMultiScreen();
  initGameScreen();
  ui.showScreen('menuScreen');
  setTimeout(drawLoop, 16);
  resize();
  window.addEventListener('pointerdown', () => sfx.unlock(), { once: true, capture: true });
  window.addEventListener('keydown', () => sfx.unlock(), { once: true });
  window.addEventListener('touchstart', () => sfx.unlock(), { once: true });
}

boot();

window.__pioneers = {
  get game() { return game; },
  get mode() { return mode; },
  get myPid() { return myPid; },
  get isHost() { return isHost; },
  get room() { return room; },
  get view() { return view; },
  get overlay() { return overlay; },
  get input() { return input; },
  get renderer() { return renderer; },
  get ui() { return ui; },
  get net() { return net; },
  get sfx() { return sfx; },
  doAction: (a) => doAction(a),
  performLocal: (a) => performLocal(a),
};
