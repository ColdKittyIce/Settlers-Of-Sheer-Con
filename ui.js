import { RESOURCE_INFO, RESOURCES, RESOURCE_ICON, PRESETS } from './board.js';
import { DEV_INFO, canAffordImprovement, pickBestNumber, validKnightSpots } from './rules.js';
import { PROGRESS_INFO, TRACK_INFO, COMMODITY_ICONS, TRACKS, COMMODITIES, totalImprovements } from './cnk.js';
import { boardToScreen } from './render.js';

export const COLORS = ['#e74c3c', '#2e86c1', '#27ae60', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#e84393'];

const RES_LABEL = { brick: 'Brick', lumber: 'Lumber', wool: 'Wool', grain: 'Grain', ore: 'Ore' };

export const COSTS = {
  road: { brick: 1, lumber: 1 },
  ship: { lumber: 1, wool: 1 },
  settlement: { brick: 1, lumber: 1, wool: 1, grain: 1 },
  city: { grain: 2, ore: 3 },
  devcard: { wool: 1, grain: 1, ore: 1 },
  knight: { lumber: 1, wool: 1, ore: 1 },
};

export function costLabel(cost) {
  return Object.entries(cost).map(([r, n]) => RESOURCE_ICON[r] + n).join(' ');
}

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') node.className = attrs[k];
    else if (k === 'text') node.textContent = attrs[k];
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] !== undefined && attrs[k] !== null) node.setAttribute(k, attrs[k]);
  }
  for (const c of children) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function createUI(h) {
  const $ = id => document.getElementById(id);
  const modalLayer = $('modalLayer');
  let modalOnClose = null;
  let modalKind = null;
  const FORCED = { discard: 1, steal: 1, year: 1, monopoly: 1, gameover: 1, alchemist: 1, crane: 1, intrigue: 1, monopolyC: 1 };

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    $(id).classList.remove('hidden');
    if (id === 'gameScreen') window.dispatchEvent(new Event('resize'));
  }

  function toast(msg) {
    let t = $('toast');
    if (!t) {
      t = el('div', { id: 'toast' });
      t.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#fff;padding:10px 18px;border-radius:10px;font-size:14px;z-index:60;pointer-events:none;opacity:0;transition:opacity .25s;max-width:90%;text-align:center';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._tm);
    t._tm = setTimeout(() => { t.style.opacity = '0'; }, 2200);
  }

  function openModal(html, opts = {}) {
    modalLayer.innerHTML = '<div class="modal panel">' + (opts.noClose ? '' : '<button class="closeX" data-c="1">✕</button>') + '<div class="mbody">' + html + '</div></div>';
    modalLayer.classList.remove('hidden');
    modalKind = opts.kind || 'generic';
    modalOnClose = opts.onClose || null;
    const cx = modalLayer.querySelector('[data-c]');
    if (cx) cx.addEventListener('click', closeModal);
  }

  function closeModal() {
    modalLayer.classList.add('hidden');
    modalLayer.innerHTML = '';
    modalKind = null;
    if (modalOnClose) { const f = modalOnClose; modalOnClose = null; f(); }
  }

  function showForced(kind, openFn) {
    if (modalKind === kind) return;
    closeModal();
    openFn();
  }

  function closeForced() {
    if (modalKind && FORCED[modalKind]) closeModal();
  }

  function resChip(res, selected) {
    return el('div', { class: 'miniRes' + (selected ? ' sel' : ''), 'data-res': res },
      el('span', { class: 'icon', text: RESOURCE_ICON[res] }),
      el('span', { class: 'nm', text: RES_LABEL[res] }));
  }

  // ===================== TOPBAR / HUD =====================

  function setTurnBadge(color, name) {
    $('turnDot').style.background = color;
    $('turnName').textContent = name;
  }

  function setPhaseText(t) {
    const elt = $('phaseText');
    elt.textContent = t || '';
    elt.classList.toggle('hidden', !t);
  }

  function setDice(vals) {
    for (const [id, die] of [['dieA', 0], ['dieB', 1]]) {
      const box = $(id);
      box.innerHTML = '';
      const v = vals ? vals[die] : null;
      const layout = v === null ? [] : PIPS[v];
      for (let i = 0; i < 9; i++) {
        box.appendChild(el('div', { class: 'pip ' + (layout.includes(i) ? 'pipOn' : 'pipOff') }));
      }
    }
  }

  const PIPS = {
    1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
  };

  function renderResTray(state, myPid) {
    const tray = $('resTray');
    tray.innerHTML = '';
    const p = state.players[myPid];
    for (const r of RESOURCES) {
      tray.appendChild(el('div', { class: 'resChip', title: RES_LABEL[r] },
        el('span', { class: 'icon', text: RESOURCE_ICON[r] }),
        el('span', { class: 'num', text: String(p.res[r]) })));
    }
  }

  function renderCardCounts(state, myPid) {
    const p = state.players[myPid];
    const total = p.res.brick + p.res.lumber + p.res.wool + p.res.grain + p.res.ore;
    $('totalCardsNum').textContent = String(total);
    const cnk = !!(state.expansions && state.expansions.cnk);
    const n = cnk ? (p.progress || []).length : p.devCards.length;
    const devBtn = $('devCards');
    devBtn.innerHTML = (cnk ? '📜 ' : '🃏 ') + '<span id="devCardsNum">' + n + '</span>';
    devBtn.title = cnk ? 'Progress cards (' + n + ')' : 'Development cards (' + n + ')';
    devBtn.classList.toggle('off', n === 0);
    devBtn.onclick = null;
    if (n > 0) devBtn.addEventListener('click', () => h.gameAction(cnk ? 'progress' : 'dev'));
  }

  function renderCommodities(state, myPid) {
    const row = $('commodityRow');
    const cnk = !!(state.expansions && state.expansions.cnk);
    if (!cnk) { row.classList.add('hidden'); row.innerHTML = ''; return; }
    row.classList.remove('hidden');
    row.innerHTML = '';
    const p = state.players[myPid];
    for (const com of COMMODITIES) {
      row.appendChild(el('div', { class: 'resChip', title: com },
        el('span', { class: 'icon', text: COMMODITY_ICONS[com] }),
        el('span', { class: 'num', text: String(p.commodities[com] || 0) })));
    }
  }

  function renderActions(state, myPid, opts) {
    const box = $('actions');
    box.innerHTML = '';
    const mine = state.turn === myPid && state.phase === 'action';
    const p = state.players[myPid];
    const cnk = !!(state.expansions && state.expansions.cnk);
    const seaf = !!(state.expansions && state.expansions.seafarers);
    const can = (res) => res.every(r => p.res[r] > 0);
    const buttons = [
      { act: 'road', icon: '🛤', lbl: 'Road', cls: 'green', cost: COSTS.road, count: p.roadsLeft, ok: mine && can(['brick', 'lumber']) && p.roadsLeft > 0 },
      ...(seaf ? [{ act: 'ship', icon: '⛵', lbl: 'Ship', cls: 'green', cost: COSTS.ship, count: p.shipsLeft, ok: mine && can(['lumber', 'wool']) && p.shipsLeft > 0 }] : []),
      { act: 'settlement', icon: '🏠', lbl: 'Settle', cls: 'green', cost: COSTS.settlement, count: p.settlementsLeft, ok: mine && can(['brick', 'lumber', 'wool', 'grain']) && p.settlementsLeft > 0 },
      { act: 'city', icon: '🏰', lbl: 'City', cls: 'green', cost: COSTS.city, count: p.citiesLeft, ok: mine && can(['grain', 'grain', 'ore', 'ore', 'ore']) && p.citiesLeft > 0 },
      { act: 'trade', icon: '⇄', lbl: 'Trade', cls: 'gold', ok: mine },
      { act: 'undo', icon: '↩', lbl: 'Undo', cls: 'ghost', ok: mine && state.undoAllowed && !state.pending && (state.undoStack || []).length > 0 },
    ];
    if (cnk) {
      buttons.push({ act: 'improvement', icon: '📈', lbl: 'Improve', cls: 'blue', ok: mine && TRACKS.some(t => canAffordImprovement(state, myPid, t)) });
      buttons.push({ act: 'knight', icon: '🛡', lbl: 'Knight', cls: 'blue', cost: COSTS.knight, ok: mine && can(['lumber', 'wool', 'ore']) && validKnightSpots(state, myPid).length > 0 });
      buttons.push({ act: 'upgrade', icon: '⚒', lbl: 'Upgrade', cls: 'blue', ok: mine && p.knights.some(k => k.strength < 3) });
      buttons.push({ act: 'activate', icon: '⚔', lbl: 'Activate', cls: 'blue', ok: mine && p.knights.some(k => !k.active) });
      buttons.push({ act: 'progress', icon: '📜', lbl: 'Progress', cls: 'blue', count: p.progress.length, ok: mine && !state.progressPlayedThisTurn && p.progress.length > 0 });
    } else {
      buttons.push({ act: 'devcard', icon: '🎴', lbl: 'Buy', cls: 'blue', cost: COSTS.devcard, ok: mine && can(['wool', 'grain', 'ore']) });
      buttons.push({ act: 'dev', icon: '🃏', lbl: 'Play', cls: 'blue', count: p.devCards.length, ok: mine && !state.devPlayedThisTurn && p.devCards.length > 0 });
    }
    for (const b of buttons) {
      const btn = el('button', { class: 'actBtn ' + b.cls + (b.count !== undefined ? ' hasCnt' : ''), title: b.cost ? b.lbl + ' — ' + costLabel(b.cost) : b.lbl, disabled: b.ok ? null : '' });
      btn.innerHTML = '<span class="aic">' + b.icon + '</span><span class="lbl">' + b.lbl + '</span>' + (b.count !== undefined ? '<span class="cnt">×' + b.count + '</span>' : '');
      btn.addEventListener('click', () => h.gameAction(b.act));
      box.appendChild(btn);
    }
    if (opts && opts.extra) opts.extra(box, mine, p);
  }

  function renderBarbarian(state, myPid) {
    const row = $('barbarianRow');
    if (!row) return;
    const cnk = state.expansions && state.expansions.cnk;
    if (!cnk) { row.classList.add('hidden'); row.innerHTML = ''; return; }
    row.classList.remove('hidden');
    row.innerHTML = '';
    const cur = totalImprovements(state);
    const next = state.barbarian.nextAttack;
    const danger = cur >= next;
    const bar = el('span', {
      style: 'background:' + (danger ? 'rgba(231,76,60,.35)' : 'rgba(255,255,255,.08)') + ';border:1px solid ' + (danger ? '#e74c3c' : 'rgba(255,255,255,.25)') + ';border-radius:8px;padding:3px 8px;color:' + (danger ? '#ff8a80' : 'inherit') + ';white-space:nowrap',
      text: '🪓 Barbarians ' + cur + '/' + next + (danger ? ' — ATTACK!' : ''),
    });
    row.appendChild(bar);
    const def = state.players.find(p => p.hasDefenderOfCatan);
    if (def) row.appendChild(el('span', { text: '🛡 ' + def.name + ' defends' }));
  }

  function renderPlayerList(state, myPid) {
    const list = $('playerList');
    list.innerHTML = '';
    const cnk = !!(state.expansions && state.expansions.cnk);
    const seaf = !!(state.expansions && state.expansions.seafarers);
    const vpOf = (i) => {
      let vp = 0;
      for (const v of state.board.vertices) if (v.owner === i) vp += v.type === 'city' ? 2 : 1;
      vp += state.players[i].vpHidden;
      if (state.players[i].hasLongestRoad) vp += 2;
      if (state.players[i].hasLargestArmy) vp += 2;
      if (state.players[i].hasDefenderOfCatan) vp += 2;
      return vp;
    };
    const vps = state.players.map((_, i) => vpOf(i));
    state.players.forEach((p, i) => {
      const tags = [];
      if (p.hasLongestRoad) tags.push('🛤');
      if (p.hasLargestArmy) tags.push('⚔');
      if (p.hasDefenderOfCatan) tags.push('🛡');
      if (i === myPid) tags.push('you');
      const hand = p.res.brick + p.res.lumber + p.res.wool + p.res.grain + p.res.ore;
      const devCount = cnk ? (p.progress || []).length : p.devCards.length;
      const pieces = [
        { t: 'Roads left', v: p.roadsLeft, i: '🛤' },
        { t: 'Settlements left', v: p.settlementsLeft, i: '🏠' },
        { t: 'Cities left', v: p.citiesLeft, i: '🏰' },
      ];
      if (seaf) pieces.push({ t: 'Ships left', v: p.shipsLeft, i: '⛵' });
      const row = el('div', { class: 'pl' + (i === myPid ? ' you' : ''), 'data-pid': String(i) },
        el('div', { class: 'plTop' },
          el('span', { class: 'pdot', style: 'background:' + p.color }),
          el('span', { class: 'pname', text: p.name + (p.isAI ? ' (AI)' : '') }),
          el('span', { class: 'pvp', text: vps[i] + ' VP' }),
          el('span', { class: 'ptags', text: tags.join(' ') })),
        el('div', { class: 'plStats' },
          el('span', { class: 'pstat', title: 'Resource cards in hand' }, '🎴', el('b', { text: String(hand) })),
          el('span', { class: 'pstat', title: cnk ? 'Progress cards held' : 'Development cards held' }, cnk ? '📜' : '🃏', el('b', { text: String(devCount) })),
          ...pieces.map(pc => el('span', { class: 'pstat' + (pc.v === 0 ? ' low' : ''), title: pc.t + ' — ' + pc.v + ' remaining', text: pc.i + pc.v }))));
      list.appendChild(row);
    });
  }

  function renderLog(state) {
    const box = $('logBox');
    box.innerHTML = '';
    let lastTurn = null;
    for (const l of state.log) {
      if (l.turn !== undefined && l.turn !== lastTurn) {
        box.appendChild(el('div', { class: 'lturn', text: '— Turn ' + (l.turn + 1) + ' —' }));
        lastTurn = l.turn;
      }
      box.appendChild(el('div', { text: l.msg }));
    }
    box.scrollTop = box.scrollHeight;
  }

  function setRollEnabled(b) { $('btnRoll').disabled = !b; }
  function setEndTurnEnabled(b) { $('btnEndTurn').disabled = !b; }

  function renderHUD(state, myPid) {
    if (!state) return;
    const cur = state.players[state.turn];
    setTurnBadge(cur.color, cur.name);
    const tb = $('turnBadge');
    tb.classList.toggle('yourTurn', state.phase === 'action' && state.turn === myPid);
    setDice(state.dice);
    const isMine = state.turn === myPid && state.phase === 'action';
    const canRoll = state.phase === 'action' && !state.rolled && state.turn === myPid;
    const canEnd = state.phase === 'action' && state.rolled && state.turn === myPid && !state.pending;
    setRollEnabled(canRoll);
    setEndTurnEnabled(canEnd);
    let phase = '';
    if (state.phase === 'setup') {
      const sp = state.players[state.setup.order[state.setup.index]];
      phase = (sp.id === myPid ? 'You place' : sp.name + ' places') + (state.setup.step === 0 ? ' a settlement' : ' a road');
    } else if (state.phase === 'gameOver') {
      phase = state.players[state.winner].name + ' wins!';
    } else {
      phase = isMine ? (state.rolled ? 'Your turn — build, trade or end.' : 'Your turn — roll the dice!') : cur.name + "'s turn";
    }
    if (state.pending && state.pending.playerId === myPid) {
      phase = pendingVerb(state.pending.type, state);
    } else if (state.pending) {
      phase = 'Waiting for ' + state.players[state.pending.playerId].name + ' to ' + pendingVerb(state.pending.type, state);
    }
    setPhaseText(phase);
    renderResTray(state, myPid);
    renderCardCounts(state, myPid);
    renderCommodities(state, myPid);
    renderBarbarian(state, myPid);
    renderActions(state, myPid);
    renderPlayerList(state, myPid);
    renderLog(state);
    renderIncomingTrades(state, myPid);
    renderTradeResponses(state, myPid);
  }

  function pendingVerb(t, state) {
    if (t === 'robber' && state && state.pending && state.pending.reason === 'bishop') return 'move the robber (nobody is robbed)';
    if (t === 'robber' && state && state.expansions && state.expansions.seafarers && state.pirate != null) return 'move the robber or pirate';
    return {
      settlement: 'place a settlement', city: 'place a city', road: 'place a road', ship: 'place a ship',
      setupSettlement: 'place an initial settlement', setupRoad: 'place an initial road',
      robber: 'move the robber', pirate: 'move the pirate', steal: 'steal a card', discard: 'discard cards',
      year: 'choose Year of Plenty', monopoly: 'choose a Monopoly resource',
      knight: 'place a knight', alchemist: 'choose a dice number', crane: 'choose a track',
      intrigue: 'choose a target', monopolyC: 'choose a commodity',
    }[t] || 'act';
  }

  // ===================== PENDING BAR =====================

  function showPendingBar(type, canCancel, state) {
    let bar = $('pendingBar');
    if (!bar) {
      bar = el('div', { id: 'pendingBar' });
      bar.style.cssText = 'position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:8;background:var(--panel);border:1px solid rgba(255,255,255,0.25);border-radius:12px;padding:8px 14px;display:flex;gap:10px;align-items:center;font-size:14px;font-weight:700;box-shadow:0 6px 18px rgba(0,0,0,0.4);white-space:nowrap;max-width:94%;';
      document.getElementById('gameArea').appendChild(bar);
    }
    bar.innerHTML = '';
    bar.appendChild(el('span', { text: pendingVerb(type, state) + ' — tap the board' }));
    if (canCancel) {
      const btn = el('button', { class: 'btn small ghost', text: 'Cancel' });
      btn.addEventListener('click', () => h.gameAction('cancel'));
      bar.appendChild(btn);
    }
    bar.classList.remove('hidden');
  }

  function hidePendingBar() {
    const bar = $('pendingBar');
    if (bar) bar.classList.add('hidden');
  }

  // ===================== INCOMING TRADES =====================

  function renderIncomingTrades(state, myPid) {
    let banner = $('tradeBanner');
    const offers = (state.trades || []).filter(t => t.from !== myPid && (t.target === 'all' || t.target === myPid));
    if (!offers.length) {
      if (banner) banner.remove();
      return;
    }
    if (!banner) {
      banner = el('div', { id: 'tradeBanner' });
      banner.style.cssText = 'position:absolute;top:64px;left:50%;transform:translateX(-50%);z-index:9;display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none';
      document.getElementById('gameArea').appendChild(banner);
    }
    banner.style.pointerEvents = 'none';
    banner.innerHTML = '';
    for (const t of offers) {
      const wrap = el('div', { class: 'card' });
      wrap.style.pointerEvents = 'auto';
      wrap.appendChild(el('span', { text: state.players[t.from].name + ' offers ' + t.giveCount + ' ' + RES_LABEL[t.give] + ' for ' + t.getCount + ' ' + RES_LABEL[t.get] }));
      const myResp = t.responses && t.responses[myPid];
      if (myResp === 'a') {
        wrap.appendChild(el('div', { class: 'trChip acc', style: 'margin-top:6px;text-align:center;font-size:12px;font-weight:800;padding:5px 9px;border-radius:8px', text: '✓ You accepted — waiting for ' + state.players[t.from].name + ' to confirm' }));
      } else if (myResp === 'd') {
        wrap.appendChild(el('div', { class: 'trChip dec', style: 'margin-top:6px;text-align:center;font-size:12px;font-weight:800;padding:5px 9px;border-radius:8px', text: '✗ You declined' }));
      } else {
        const acc = el('button', { class: 'btn small primary', text: 'Accept' });
        acc.addEventListener('click', () => h.modalAction({ type: 'acceptTrade', id: t.id }));
        const dec = el('button', { class: 'btn small ghost', text: 'Decline' });
        dec.addEventListener('click', () => h.modalAction({ type: 'cancelTrade', id: t.id }));
        const row = el('div', { class: 'row' }, acc, dec);
        wrap.appendChild(row);
      }
      const tw = (typeof h.getTradeWait === 'function') ? h.getTradeWait() : null;
      if (tw && tw.offerId === t.id) {
        wrap.appendChild(el('span', { class: 'tradeWaitCount', 'data-offer-id': t.id, style: 'font-size:12px;font-weight:800;color:var(--gold)', text: '⏳ 15s' }));
      }
      banner.appendChild(wrap);
    }
  }

  function tickTradeWait() {
    const tw = (typeof h.getTradeWait === 'function') ? h.getTradeWait() : null;
    const els = document.querySelectorAll('.tradeWaitCount');
    for (const elt of els) {
      const id = elt.getAttribute('data-offer-id');
      if (tw && tw.offerId === id) {
        const left = Math.ceil((tw.deadline - Date.now()) / 1000);
        elt.textContent = left > 0 ? '⏳ ' + left + 's' : '⏳ 0s';
      } else {
        elt.textContent = '';
      }
    }
  }

  // ===================== TRADE RESPONSES (turn player) =====================

  function tradeRespPlayers(state, t) {
    if (t.target === 'all') return state.players.map((_, i) => i).filter(i => i !== t.from);
    return t.target != null ? [t.target] : [];
  }

  function renderTradeResponses(state, myPid) {
    let panel = $('tradeRespPanel');
    const mine = (state.trades || []).filter(t => t.from === myPid);
    if (!mine.length) {
      if (panel) panel.remove();
      return;
    }
    if (!panel) {
      panel = el('div', { id: 'tradeRespPanel' });
      panel.style.cssText = 'position:absolute;top:118px;left:50%;transform:translateX(-50%);z-index:9;display:flex;flex-direction:column;gap:6px;align-items:stretch;pointer-events:none;max-width:min(560px,94vw);width:max-content';
      document.getElementById('gameArea').appendChild(panel);
    }
    panel.innerHTML = '';
    const mineTurn = state.phase === 'action' && state.turn === myPid;
    for (const t of mine) {
      const card = el('div', { class: 'card', style: 'pointer-events:auto;padding:8px 10px' });
      card.appendChild(el('div', { style: 'font-weight:800;font-size:13px', text: 'Your offer: ' + t.giveCount + ' ' + RES_LABEL[t.give] + ' → ' + t.getCount + ' ' + RES_LABEL[t.get] + (t.target === 'all' ? ' (everyone)' : ' → ' + state.players[t.target].name) }));
      const row = el('div', { style: 'display:flex;gap:5px;flex-wrap:wrap;margin-top:5px' });
      for (const pid of tradeRespPlayers(state, t)) {
        const stt = t.responses[pid];
        const p = state.players[pid];
        const chip = el('button', {
          class: 'trChip' + (stt === 'a' ? ' acc' : stt === 'd' ? ' dec' : ' wait'),
          disabled: (stt === 'a' && mineTurn) ? null : '',
          title: stt === 'a' ? 'Click to trade with ' + p.name : '',
          style: 'font:inherit;font-size:12px;font-weight:800;padding:5px 9px;border-radius:8px;border:1px solid rgba(255,255,255,.25);cursor:pointer;color:#fff',
        });
        chip.textContent = (stt === 'a' ? '✓ ' : stt === 'd' ? '✗ ' : '⏳ ') + p.name + (stt === 'a' ? ' — trade' : stt === 'd' ? ' — declined' : ' …');
        if (stt === 'a' && mineTurn) chip.addEventListener('click', () => h.modalAction({ type: 'completeTrade', id: t.id, pid }));
        row.appendChild(chip);
      }
      card.appendChild(row);
      card.appendChild(el('div', {
        style: 'font-size:11px;opacity:.85;margin-top:4px',
        text: mineTurn ? 'Click a player’s ✓ chip to complete the trade with them.' : 'Waiting for ' + state.players[t.from].name + ' to pick a partner…',
      }));
      const withdraw = el('button', { class: 'btn small ghost', text: 'Withdraw offer' });
      withdraw.addEventListener('click', () => h.modalAction({ type: 'cancelTrade', id: t.id }));
      withdraw.style.cssText = 'margin-top:6px;padding:3px 8px;font-size:11px';
      card.appendChild(withdraw);
      panel.appendChild(card);
    }
  }

  // ===================== MODALS =====================

  function showDiscardModal(state) {
    const entry = state.discardsLeft.find(d => d.pid === state.pending.playerId);
    if (!entry) return;
    const p = state.players[entry.pid];
    const chosen = {};
    const rows = {};
    const list = el('div', { style: 'display:flex;flex-direction:column;gap:6px;width:100%' });
    const stepperStyle = 'min-width:38px;padding:6px 0;font-size:16px;line-height:1';
    const countEl = el('div', { text: '0 / ' + entry.count + ' chosen' });
    const okBtn = el('button', { class: 'btn primary', text: 'Discard', disabled: '' });
    const update = () => {
      let total = 0;
      for (const r of RESOURCES) {
        const c = chosen[r] || 0;
        total += c;
        rows[r].chip.classList.toggle('sel', c > 0);
        rows[r].count.textContent = c;
        rows[r].minus.disabled = c === 0;
        rows[r].plus.disabled = c >= p.res[r] || total >= entry.count;
      }
      okBtn.disabled = total !== entry.count;
      countEl.textContent = total + ' / ' + entry.count + ' chosen';
    };
    for (const r of RESOURCES) {
      const avail = p.res[r];
      const chip = resChip(r, false);
      const minus = el('button', { class: 'btn small ghost', style: stepperStyle, text: '−' });
      const cnt = el('span', { style: 'font-weight:800;font-size:16px;min-width:30px;text-align:center', text: '0' });
      const plus = el('button', { class: 'btn small ghost', style: stepperStyle, text: '+' });
      minus.addEventListener('click', () => { if ((chosen[r] || 0) > 0) { chosen[r]--; if (!chosen[r]) delete chosen[r]; } update(); });
      plus.addEventListener('click', () => { const c = chosen[r] || 0; if (c < avail) chosen[r] = c + 1; update(); });
      rows[r] = { chip, minus, count: cnt, plus };
      list.appendChild(el('div', { class: 'row', style: 'justify-content:space-between' },
        el('div', { class: 'row', style: 'gap:8px;flex:1' }, chip,
          el('span', { style: 'font-size:12px;opacity:.65', text: 'have ' + avail })),
        el('div', { class: 'row', style: 'gap:6px' }, minus, cnt, plus)));
    }
    okBtn.addEventListener('click', () => {
      const c = [];
      for (const r of RESOURCES) for (let i = 0; i < (chosen[r] || 0); i++) c.push(r);
      closeModal();
      setTimeout(() => h.modalAction({ type: 'discard', choices: c }), 0);
    });
    openModal('', { noClose: true, kind: 'discard' });
    const body = modalLayer.querySelector('.mbody');
    body.innerHTML = '';
    body.appendChild(el('h2', { text: 'Discard ' + entry.count + ' cards' }));
    body.appendChild(el('div', { text: 'The robber demands tribute — you have more than 7 cards.' }));
    body.appendChild(list);
    body.appendChild(countEl);
    body.appendChild(okBtn);
    update();
  }

  function showStealModal(state) {
    const pend = state.pending;
    const opts = pend.from.map(pid => state.players[pid]);
    const wrap = el('div', { class: 'mbody', style: 'gap:8px' });
    for (const o of opts) {
      const btn = el('button', { class: 'btn', style: 'display:flex;gap:10px;align-items:center;justify-content:flex-start' },
        el('span', { class: 'pdot', style: 'background:' + o.color + ';width:16px;height:16px;border-radius:50%;flex-shrink:0' }),
        el('span', { text: 'Steal from ' + o.name }));
      btn.addEventListener('click', () => { h.modalAction({ type: 'steal', target: o.id }); closeModal(); });
      wrap.appendChild(btn);
    }
    openModal('', { kind: 'steal' });
    const body = modalLayer.querySelector('.mbody');
    body.innerHTML = '';
    body.appendChild(el('h2', { text: 'Steal a card' }));
    body.appendChild(el('div', { text: 'Choose who to rob.' }));
    for (const c of [...wrap.children]) body.appendChild(c);
  }

  function showYearModal() {
    let chosen = [];
    const wrap = el('div', { class: 'row', style: 'flex-wrap:wrap;gap:8px' });
    const okBtn = el('button', { class: 'btn primary', text: 'Take', disabled: '' });
    const update = () => {
      wrap.innerHTML = '';
      for (const r of RESOURCES) {
        const chip = resChip(r, chosen.includes(r));
        chip.addEventListener('click', () => {
          if (chosen.includes(r)) chosen = chosen.filter(c => c !== r);
          else if (chosen.length < 2) chosen.push(r);
          update();
        });
        wrap.appendChild(chip);
      }
      okBtn.disabled = chosen.length !== 2;
    };
    okBtn.addEventListener('click', () => { h.modalAction({ type: 'year', choices: chosen }); closeModal(); });
    openModal('', { kind: 'year' });
    const body = modalLayer.querySelector('.mbody');
    body.innerHTML = '';
    body.appendChild(el('h2', { text: 'Year of Plenty' }));
    body.appendChild(el('div', { text: 'Take any 2 resources from the bank.' }));
    body.appendChild(wrap);
    body.appendChild(okBtn);
    update();
  }

  function showMonopolyModal() {
    const wrap = el('div', { class: 'row', style: 'flex-wrap:wrap;gap:8px' });
    for (const r of RESOURCES) {
      const chip = resChip(r, false);
      chip.addEventListener('click', () => { h.modalAction({ type: 'monopoly', res: r }); closeModal(); });
      wrap.appendChild(chip);
    }
    openModal('', { kind: 'monopoly' });
    const body = modalLayer.querySelector('.mbody');
    body.innerHTML = '';
    body.appendChild(el('h2', { text: 'Monopoly' }));
    body.appendChild(el('div', { text: 'Choose a resource to take from all other players.' }));
    body.appendChild(wrap);
  }

  function showImprovementModal(state, myPid) {
    const p = state.players[myPid];
    const wrap = el('div', { class: 'mbody', style: 'gap:10px' });
    for (const t of TRACKS) {
      const info = TRACK_INFO[t];
      const lvl = p.improvements[t];
      const cost = lvl + 1;
      const maxed = lvl >= 3;
      const ok = !maxed && (p.commodities[info.commodity] || 0) >= cost && state.turn === myPid && state.phase === 'action';
      const row = el('div', { class: 'row', style: 'justify-content:space-between;align-items:center;gap:8px' });
      const left = el('div', { class: 'row', style: 'gap:8px;align-items:center;flex:1' },
        el('span', { text: info.icon }),
        el('span', { style: 'font-weight:800', text: info.name + ' ' + '▮'.repeat(lvl) + '▯'.repeat(3 - lvl) }),
        el('span', { style: 'font-size:11px;opacity:.75', text: (maxed ? 'maxed' : 'cost ' + cost + ' ' + COMMODITY_ICONS[info.commodity]) }));
      const buy = el('button', { class: 'btn small' + (ok ? ' primary' : ''), text: 'Buy', disabled: ok ? null : '' });
      buy.addEventListener('click', () => { h.modalAction({ type: 'improvement', track: t }); closeModal(); });
      row.appendChild(left);
      row.appendChild(buy);
      wrap.appendChild(row);
    }
    const cRow = el('div', { class: 'row', style: 'gap:10px;margin-top:6px;flex-wrap:wrap' });
    for (const com of COMMODITIES) cRow.appendChild(el('span', { text: COMMODITY_ICONS[com] + ' ' + (p.commodities[com] || 0) }));
    wrap.appendChild(cRow);
    openModal('', { kind: 'improvement' });
    const body = modalLayer.querySelector('.mbody');
    body.innerHTML = '';
    body.appendChild(el('h2', { text: 'City Improvements' }));
    body.appendChild(el('div', { style: 'font-size:12px;opacity:.8', text: 'Cities produce commodities. Spend them to advance a track, draw a progress card and strengthen barbarian defense.' }));
    for (const c of [...wrap.children]) body.appendChild(c);
  }

  function showProgressModal(state, myPid) {
    const p = state.players[myPid];
    const wrap = el('div', { class: 'mbody' });
    if (!p.progress.length) wrap.appendChild(el('div', { text: 'You have no progress cards.' }));
    const canPlay = state.turn === myPid && state.phase === 'action' && !state.progressPlayedThisTurn;
    for (const t of TRACKS) {
      const cards = [];
      p.progress.forEach((c, i) => { if (c.track === t) cards.push({ c, i }); });
      if (!cards.length) continue;
      wrap.appendChild(el('div', { style: 'font-weight:800;color:var(--gold);margin:6px 0 2px', text: TRACK_INFO[t].icon + ' ' + TRACK_INFO[t].name }));
      for (const { c, i } of cards) {
        const info = PROGRESS_INFO[c.type];
        const btn = el('button', { class: 'btn small' + (canPlay ? ' primary' : ''), disabled: canPlay ? null : '', style: 'text-align:left' });
        btn.innerHTML = '<div style="font-weight:800">' + info.icon + ' ' + info.name + '</div><div style="font-size:11px;opacity:.85">' + info.desc + '</div>';
        btn.addEventListener('click', () => {
          closeModal();
          setTimeout(() => h.modalAction({ type: 'progress', idx: i }), 0);
        });
        wrap.appendChild(btn);
      }
    }
    openModal('', { kind: 'progress' });
    const body = modalLayer.querySelector('.mbody');
    body.innerHTML = '';
    body.appendChild(el('h2', { text: 'Progress Cards (' + p.progress.length + ')' }));
    body.appendChild(el('div', { style: 'font-size:12px;opacity:.8', text: canPlay ? 'You may play one per turn.' : state.progressPlayedThisTurn ? 'You already played a progress card this turn.' : 'Progress cards can only be played on your own turn.' }));
    for (const c of [...wrap.children]) body.appendChild(c);
  }

  function showKnightModal(state, myPid, mode) {
    const p = state.players[myPid];
    const wrap = el('div', { class: 'mbody' });
    if (!p.knights.length) wrap.appendChild(el('div', { text: 'You have no knights yet.' }));
    p.knights.forEach((k, i) => {
      const row = el('div', { class: 'row', style: 'justify-content:space-between;align-items:center;gap:8px' });
      const left = el('div', { class: 'row', style: 'gap:8px;align-items:center;flex:1' },
        el('span', { text: '🛡'.repeat(k.strength) }),
        el('span', { style: 'font-size:11px;opacity:.75', text: k.active ? 'active' : 'inactive' + (k.strength < 3 ? ' · upgrade cost: ' + (k.strength === 1 ? '1 🧵' : '1 🧵 + 1 🪙') : '') }));
      if (mode === 'upgrade') {
        const ok = k.strength < 3 && (k.strength === 1 ? (p.commodities.cloth || 0) >= 1 : (p.commodities.cloth || 0) >= 1 && (p.commodities.coin || 0) >= 1) && state.turn === myPid && state.phase === 'action';
        const b = el('button', { class: 'btn small' + (ok ? ' primary' : ''), text: 'Upgrade', disabled: ok ? null : '' });
        b.addEventListener('click', () => { h.modalAction({ type: 'upgradeKnight', idx: i }); closeModal(); });
        row.appendChild(left); row.appendChild(b);
      } else {
        const ok = !k.active && state.turn === myPid && state.phase === 'action';
        const b = el('button', { class: 'btn small' + (ok ? ' primary' : ''), text: 'Activate', disabled: ok ? null : '' });
        b.addEventListener('click', () => { h.modalAction({ type: 'activateKnight', idx: i }); closeModal(); });
        row.appendChild(left); row.appendChild(b);
      }
      wrap.appendChild(row);
    });
    openModal('', { kind: 'knights' });
    const body = modalLayer.querySelector('.mbody');
    body.innerHTML = '';
    body.appendChild(el('h2', { text: mode === 'upgrade' ? 'Upgrade a Knight' : 'Activate a Knight' }));
    body.appendChild(el('div', { style: 'font-size:12px;opacity:.8', text: mode === 'upgrade' ? 'Upgraded knights are stronger in barbarian defense and politics.' : 'Activating lets you move the robber and adds strength to the barbarian defense.' }));
    for (const c of [...wrap.children]) body.appendChild(c);
  }

  function showAlchemistModal(state) {
    const wrap = el('div', { class: 'row', style: 'flex-wrap:wrap;gap:8px;justify-content:center' });
    for (let n = 2; n <= 12; n++) {
      if (n === 7) continue;
      const btn = el('button', { class: 'btn', text: String(n) });
      btn.addEventListener('click', () => { h.modalAction({ type: 'alchemist', number: n }); closeModal(); });
      wrap.appendChild(btn);
    }
    let best = 6;
    try { best = pickBestNumber(state, myPid); } catch (e) { /* ignore */ }
    openModal('', { kind: 'alchemist' });
    const body = modalLayer.querySelector('.mbody');
    body.innerHTML = '';
    body.appendChild(el('h2', { text: 'The Alchemist' }));
    body.appendChild(el('div', { text: 'Choose the dice number to produce with (7 not allowed).' }));
    body.appendChild(el('div', { style: 'font-size:12px;opacity:.8;margin-bottom:6px', text: 'Best number for you: ' + best }));
    body.appendChild(wrap);
  }

  function showCraneModal(state, myPid) {
    const p = state.players[myPid];
    const wrap = el('div', { class: 'mbody', style: 'gap:10px' });
    for (const t of TRACKS) {
      const info = TRACK_INFO[t];
      const lvl = p.improvements[t];
      const maxed = lvl >= 3;
      const ok = !maxed;
      const btn = el('button', { class: 'btn small' + (ok ? ' primary' : ''), disabled: ok ? null : '' });
      btn.innerHTML = '<div style="font-weight:800">' + info.icon + ' ' + info.name + '</div><div style="font-size:11px;opacity:.85">Level ' + lvl + ' → ' + (lvl + 1) + (maxed ? ' (maxed)' : '') + '</div>';
      btn.addEventListener('click', () => { h.modalAction({ type: 'crane', track: t }); closeModal(); });
      wrap.appendChild(btn);
    }
    openModal('', { kind: 'crane' });
    const body = modalLayer.querySelector('.mbody');
    body.innerHTML = '';
    body.appendChild(el('h2', { text: 'The Crane' }));
    body.appendChild(el('div', { text: 'Advance one track for free.' }));
    for (const c of [...wrap.children]) body.appendChild(c);
    if (wrap.children.length === 0) {
      body.appendChild(el('div', { style: 'font-size:12px;opacity:.8', text: 'All three tracks are already at level 3 — the Crane has no effect.' }));
      const ok = el('button', { class: 'btn primary' }, el('span', { text: 'OK' }));
      ok.addEventListener('click', () => { h.modalAction({ type: 'crane', track: 'politics' }); closeModal(); });
      body.appendChild(ok);
    }
  }

  function showIntrigueModal(state, myPid) {
    const wrap = el('div', { class: 'mbody', style: 'gap:8px' });
    for (const o of state.players) {
      if (o.id === myPid) continue;
      const btn = el('button', { class: 'btn', style: 'display:flex;gap:10px;align-items:center;justify-content:flex-start' },
        el('span', { class: 'pdot', style: 'background:' + o.color + ';width:16px;height:16px;border-radius:50%;flex-shrink:0' }),
        el('span', { text: 'Steal commodities from ' + o.name }));
      btn.addEventListener('click', () => { h.modalAction({ type: 'intrigue', target: o.id }); closeModal(); });
      wrap.appendChild(btn);
    }
    openModal('', { kind: 'intrigue' });
    const body = modalLayer.querySelector('.mbody');
    body.innerHTML = '';
    body.appendChild(el('h2', { text: 'Intrigue' }));
    body.appendChild(el('div', { text: 'Steal 1 paper, 1 coin and 1 cloth from a player.' }));
    for (const c of [...wrap.children]) body.appendChild(c);
  }

  function showMonopolyCModal(state, myPid) {
    const wrap = el('div', { class: 'row', style: 'flex-wrap:wrap;gap:8px' });
    for (const com of COMMODITIES) {
      const chip = el('div', { class: 'miniRes', 'data-res': com },
        el('span', { class: 'icon', text: COMMODITY_ICONS[com] }),
        el('span', { class: 'nm', text: com }));
      chip.addEventListener('click', () => { h.modalAction({ type: 'monopolyC', com }); closeModal(); });
      wrap.appendChild(chip);
    }
    openModal('', { kind: 'monopolyC' });
    const body = modalLayer.querySelector('.mbody');
    body.innerHTML = '';
    body.appendChild(el('h2', { text: 'Merchant Monopoly' }));
    body.appendChild(el('div', { text: 'Take all of one commodity from every player.' }));
    body.appendChild(wrap);
  }

  function showDevCardsModal(state, myPid) {
    const p = state.players[myPid];
    const wrap = el('div', { class: 'mbody' });
    p.devCards.forEach((c, i) => {
      const info = DEV_INFO[c.type];
      const can = c.type !== 'vp' && c.boughtTurn !== state.turnCount && !state.devPlayedThisTurn && state.turn === myPid && state.phase === 'action';
      const btn = el('button', { class: 'btn small' + (can ? ' primary' : ''), disabled: can ? null : '' });
      btn.innerHTML = '<div style="font-weight:800">' + info.name + (c.type === 'vp' ? ' ★' : '') + '</div><div style="font-size:11px;opacity:.85">' + info.desc + '</div>';
      btn.addEventListener('click', () => {
        const idx2 = i;
        closeModal();
        setTimeout(() => h.modalAction({ type: 'playDev', idx: idx2 }), 0);
      });
      wrap.appendChild(btn);
    });
    openModal('', { kind: 'devcards' });
    const body = modalLayer.querySelector('.mbody');
    body.innerHTML = '';
    body.appendChild(el('h2', { text: 'Development Cards (' + p.devCards.length + ')' }));
    if (!p.devCards.length) body.appendChild(el('div', { text: 'You have no development cards.' }));
    for (const c of [...wrap.children]) body.appendChild(c);
    const hint = el('div', { style: 'font-size:11px;opacity:.7', text: 'Victory point cards (★) score automatically.' });
    body.appendChild(hint);
  }

  function showTradeModal(state, myPid, rateFn) {
    const p = state.players[myPid];
    const giveSel = { r: 'lumber', n: 4 };
    const getSel = { r: 'brick' };
    let tradeGive = { r: 'lumber', n: 1 };
    let tradeGet = { r: 'brick', n: 1 };
    let target = 'all';

    const giveChips = el('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' });
    const getChips = el('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' });
    const giveCount = el('input', { type: 'number', min: '1', max: '19', value: '4', style: 'width:70px' });
    const getCount = el('input', { type: 'number', min: '1', max: '19', value: '1', style: 'width:70px' });
    const rateEl = el('div', { text: '' });

    const renderChips = () => {
      giveChips.innerHTML = '';
      for (const r of RESOURCES) {
        const chip = resChip(r, giveSel.r === r);
        chip.addEventListener('click', () => { giveSel.r = r; renderChips(); });
        giveChips.appendChild(chip);
      }
      getChips.innerHTML = '';
      for (const r of RESOURCES) {
        const chip = resChip(r, getSel.r === r);
        chip.addEventListener('click', () => { getSel.r = r; renderChips(); });
        getChips.appendChild(chip);
      }
      const rate = rateFn(state, p, giveSel.r);
      giveCount.value = rate;
      rateEl.textContent = 'Trade rate for ' + RES_LABEL[giveSel.r] + ': ' + rate + ':1 (click a resource to change)';
    };

    const tradeBtn = el('button', { class: 'btn primary', text: 'Trade with bank' });
    tradeBtn.addEventListener('click', () => {
      h.modalAction({ type: 'bankTrade', give: giveSel.r, giveCount: parseInt(giveCount.value, 10) || rateFn(state, p, giveSel.r), get: getSel.r });
      closeModal();
    });

    const targetSel = el('select');
    targetSel.appendChild(el('option', { value: 'all', text: 'All players' }));
    state.players.forEach((o, i) => { if (i !== myPid) targetSel.appendChild(el('option', { value: String(i), text: o.name })); });

    const offerBtn = el('button', { class: 'btn gold', text: 'Offer trade' });
    offerBtn.addEventListener('click', () => {
      const g = Math.max(1, Math.min(19, parseInt(tradeGive.n.value, 10) || 1));
      const gc = Math.max(1, Math.min(19, parseInt(tradeGet.n.value, 10) || 1));
      if (g > p.res[tradeGive.r]) { toast('Not enough ' + RES_LABEL[tradeGive.r]); return; }
      h.modalAction({ type: 'offerTrade', give: tradeGive.r, giveCount: g, get: tradeGet.r, getCount: gc, target: targetSel.value === 'all' ? 'all' : parseInt(targetSel.value, 10) });
      closeModal();
    });

    const active = el('div', { class: 'mbody' });
    const renderActive = () => {
      active.innerHTML = '';
      (state.trades || []).filter(t => t.from === myPid).forEach(t => {
        const box = el('div', { class: 'card', style: 'width:100%;padding:8px 10px' });
        box.appendChild(el('div', { style: 'font-weight:800;font-size:13px', text: 'Your offer: ' + t.giveCount + ' ' + RES_LABEL[t.give] + ' → ' + t.getCount + ' ' + RES_LABEL[t.get] + (t.target === 'all' ? ' (all)' : ' → ' + state.players[t.target].name) }));
        for (const pid of tradeRespPlayers(state, t)) {
          const stt = t.responses[pid];
          const stp = state.players[pid];
          if (stt === 'a') {
            const b = el('button', { class: 'btn small primary', text: 'Trade with ' + stp.name });
            b.addEventListener('click', () => { h.modalAction({ type: 'completeTrade', id: t.id, pid }); closeModal(); });
            box.appendChild(el('div', { class: 'row', style: 'margin-top:4px;justify-content:space-between' },
              el('span', { class: 'trChip acc', style: 'font-size:12px;font-weight:800;padding:4px 8px;border-radius:8px', text: stp.name + ' ✓ accepted' }), b));
          } else if (stt === 'd') {
            box.appendChild(el('div', { style: 'font-size:12px;opacity:.85;margin-top:4px', text: stp.name + ' ✗ declined' }));
          } else {
            box.appendChild(el('div', { style: 'font-size:12px;opacity:.85;margin-top:4px', text: stp.name + ' ⏳ thinking…' }));
          }
        }
        const cancel = el('button', { class: 'btn small ghost', text: 'Withdraw' });
        cancel.addEventListener('click', () => { h.modalAction({ type: 'cancelTrade', id: t.id }); closeModal(); });
        box.appendChild(el('div', { style: 'margin-top:6px' }, cancel));
        active.appendChild(box);
      });
    };

    openModal('', { kind: 'trade' });
    const body = modalLayer.querySelector('.mbody');
    body.innerHTML = '';
    body.appendChild(el('h2', { text: 'Trade' }));
    body.appendChild(el('div', { style: 'font-weight:800;color:var(--gold)', text: 'Bank / Port trade' }));
    body.appendChild(giveChips);
    body.appendChild(giveCount);
    body.appendChild(el('span', { text: ' → ' }));
    body.appendChild(getChips);
    body.appendChild(rateEl);
    body.appendChild(tradeBtn);
    body.appendChild(el('div', { style: 'font-weight:800;color:var(--gold);margin-top:8px', text: 'Trade with players' }));
    const tChips = el('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' });
    const tgChips = el('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' });
    const renderTChips = () => {
      tChips.innerHTML = '';
      tgChips.innerHTML = '';
      for (const r of RESOURCES) {
        const c1 = resChip(r, tradeGive.r === r);
        c1.addEventListener('click', () => { tradeGive.r = r; renderTChips(); });
        tChips.appendChild(c1);
        const c2 = resChip(r, tradeGet.r === r);
        c2.addEventListener('click', () => { tradeGet.r = r; renderTChips(); });
        tgChips.appendChild(c2);
      }
    };
    renderTChips();
    const tg = el('div', { class: 'row', style: 'flex-wrap:wrap;gap:6px' });
    tg.appendChild(el('span', { text: 'Give:' }));
    tg.appendChild(tChips);
    tg.appendChild(el('span', { text: 'for' }));
    tg.appendChild(tgChips);
    body.appendChild(tg);
    const cntRow = el('div', { class: 'row' });
    cntRow.appendChild(el('span', { text: 'Counts:' }));
    tradeGive.n = el('input', { type: 'number', min: '1', max: '19', value: '1', style: 'width:70px' });
    tradeGet.n = el('input', { type: 'number', min: '1', max: '19', value: '1', style: 'width:70px' });
    cntRow.appendChild(tradeGive.n);
    cntRow.appendChild(el('span', { text: '→' }));
    cntRow.appendChild(tradeGet.n);
    body.appendChild(cntRow);
    const tr = el('div', { class: 'row' });
    tr.appendChild(el('span', { text: 'To:' }));
    tr.appendChild(targetSel);
    body.appendChild(tr);
    body.appendChild(offerBtn);
    body.appendChild(el('div', { style: 'font-weight:800;color:var(--gold);margin-top:8px', text: 'Active offers' }));
    body.appendChild(active);
    renderActive();
    renderChips();
  }

  function showGameOver(state, myPid) {
    const w = state.players[state.winner];
    const vpOf = (i) => {
      let vp = 0;
      for (const v of state.board.vertices) if (v.owner === i) vp += v.type === 'city' ? 2 : 1;
      vp += state.players[i].vpHidden;
      if (state.players[i].hasLongestRoad) vp += 2;
      if (state.players[i].hasLargestArmy) vp += 2;
      if (state.players[i].hasDefenderOfCatan) vp += 2;
      return vp;
    };
    const vps = state.players.map((_, i) => vpOf(i));
    openModal('', { noClose: true, kind: 'gameover' });
    const body = modalLayer.querySelector('.mbody');
    body.innerHTML = '';
    body.appendChild(el('h2', { text: (w.id === myPid ? 'You win! 🎉' : w.name + ' wins!') }));
    body.appendChild(el('p', { text: 'First to ' + (state.winVP || 10) + ' victory points.' }));
    const list = el('div', { class: 'mbody', style: 'gap:4px' });
    state.players.forEach((p, i) => {
      list.appendChild(el('div', { class: 'pl' + (i === myPid ? ' you' : '') },
        el('span', { class: 'pdot', style: 'background:' + p.color }),
        el('span', { class: 'pname', text: p.name }),
        el('span', { class: 'pvp', text: vps[i] + ' VP' })));
    });
    body.appendChild(list);
    const row = el('div', { class: 'row' });
    const again = el('button', { class: 'btn primary', text: 'Play again' });
    again.addEventListener('click', () => { h.modalAction({ type: 'playAgain' }); closeModal(); });
    const menu = el('button', { class: 'btn ghost', text: 'Menu' });
    menu.addEventListener('click', () => { h.modalAction({ type: 'goMenu' }); closeModal(); });
    row.appendChild(again);
    row.appendChild(menu);
    body.appendChild(row);
  }

  function showHowTo() {
    const steps = [
      ['Setup', 'Players take turns placing a settlement and a road. First player places two (second gets starting resources!).'],
      ['Roll', 'On your turn, roll the dice. All players with settlements/cities next to matching terrain collect resources.'],
      ['Build', 'Spend resources: road (🪵+🧱), settlement (🪵+🧱+🐑+🌾), city (🌾🌾+⛏⛏⛏), dev card (🐑+🌾+⛏).'],
      ['Robber & 7', 'Rolling 7: players with 8+ cards discard half, then move the robber and steal from an adjacent player.'],
      ['Trade', 'Trade 4:1 with the bank (3:1 on generic ports, 2:1 on matching ports), or trade with other players.'],
      ['Win', 'First to 10 victory points. Cities = 2 VP, settlements = 1, plus Longest Road (+2), Largest Army (+2) and hidden Victory Point cards.'],
    ];
    openModal('', { kind: 'howto' });
    const body = modalLayer.querySelector('.mbody');
    body.innerHTML = '';
    body.appendChild(el('h2', { text: 'How to Play' }));
    for (const [t, d] of steps) {
      body.appendChild(el('div', { style: 'font-weight:800;color:var(--gold)', text: t }));
      body.appendChild(el('div', { text: d }));
    }
  }

  function showBuildGuide(state) {
    const seaf = !!(state && state.expansions && state.expansions.seafarers);
    const cnk = !!(state && state.expansions && state.expansions.cnk);
    const costChips = (cost) => {
      const row = el('span', { style: 'display:inline-flex;gap:3px;flex-wrap:wrap;margin-left:6px' });
      for (const [r, n] of Object.entries(cost)) {
        row.appendChild(el('span', { class: 'trChip wait', style: 'font-size:11px;font-weight:800;padding:2px 6px;border-radius:6px', text: RESOURCE_ICON[r] + '×' + n }));
      }
      return row;
    };
    const rows = [
      { icon: '🛤', name: 'Road', cost: COSTS.road, note: 'Extends your network — needed to settle new spots. Helps win Longest Road (+2 VP).' },
      { icon: '🏠', name: 'Settlement', cost: COSTS.settlement, note: 'Worth 1 VP. Produces resources on adjacent hexes. Build on an unoccupied vertex touching your roads.' },
      { icon: '🏰', name: 'City', cost: COSTS.city, note: 'Upgrades a settlement. Worth 2 VP and produces double resources.' },
      { icon: '🎴', name: 'Development Card', cost: COSTS.devcard, note: 'Random card: Knight, Road Building, Year of Plenty, Monopoly, or Victory Point. Knights power Largest Army (+2 VP).' },
    ];
    if (seaf) rows.push({ icon: '⛵', name: 'Ship', cost: COSTS.ship, note: 'Works like a road on water — needed to reach islands. Counts toward Longest Road.' });
    if (cnk) rows.push({ icon: '🛡', name: 'Knight', cost: COSTS.knight, note: 'Build on your own settlements. Activate to defend against the barbarian attack.' });
    openModal('', { kind: 'guide' });
    const body = modalLayer.querySelector('.mbody');
    body.innerHTML = '';
    body.appendChild(el('h2', { text: 'Build Guide' }));
    body.appendChild(el('div', { style: 'font-size:12px;opacity:.85;margin-bottom:6px', text: 'What each build costs — resource counts are shown next to each item.' }));
    for (const r of rows) {
      const line = el('div', { style: 'display:flex;align-items:center;flex-wrap:wrap;gap:4px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.08)' });
      line.appendChild(el('span', { style: 'font-size:17px', text: r.icon }));
      line.appendChild(el('span', { style: 'font-weight:800', text: r.name }));
      line.appendChild(costChips(r.cost));
      line.appendChild(el('div', { style: 'font-size:11px;opacity:.8;width:100%;padding-left:22px', text: r.note }));
      body.appendChild(line);
    }
    if (cnk) {
      body.appendChild(el('div', { style: 'font-weight:800;color:var(--gold);margin-top:10px', text: 'City Improvements (Cities & Knights)' }));
      for (const t of TRACKS) {
        const info = TRACK_INFO[t];
        const line = el('div', { style: 'display:flex;align-items:center;gap:6px;padding:6px 0' });
        line.appendChild(el('span', { text: info.icon + ' ' + info.name }));
        line.appendChild(el('span', { class: 'trChip wait', style: 'font-size:11px;font-weight:800;padding:2px 6px;border-radius:6px', text: COMMODITY_ICONS[info.commodity] + ' × level' }));
        line.appendChild(el('div', { style: 'font-size:11px;opacity:.8;width:100%;padding-left:24px', text: 'Advancing to level N costs N ' + info.commodity + '. Level 3 grants a progress card.' }));
        body.appendChild(line);
      }
    }
    body.appendChild(el('div', { style: 'font-weight:800;color:var(--gold);margin-top:10px', text: 'Victory Points' }));
    const vp = [
      ['Settlement', '1'], ['City', '2'], ['Longest Road (2+ roads)', '+2'], ['Largest Army (3+ knights)', '+2'],
    ];
    if (cnk) vp.push(['Defender of Catan', '+2']);
    for (const [n, v] of vp) {
      body.appendChild(el('div', { style: 'display:flex;justify-content:space-between;padding:3px 0;font-size:13px' }, el('span', { text: n }), el('b', { text: v + ' VP' })));
    }
  }

  // ===================== LOBBY =====================

  function renderLobby(room, isHost, myName) {
    $('lobbyCode').textContent = room.code;
    const playersBox = $('lobbyPlayers');
    playersBox.innerHTML = '';
    for (const p of room.players) {
      playersBox.appendChild(el('div', { class: 'pl' },
        el('span', { class: 'pdot', style: 'background:' + p.color }),
        el('span', { class: 'pname', text: p.name + (p.name === myName ? ' (you)' : '') }),
        el('span', { class: 'ptags', text: (p.connId === room.hostConnId ? '👑 host' : '') + (p.isAI ? ' AI' : '') })));
    }
    const mapName = room.settings.map && room.settings.map !== 'random' ? (PRESETS.find(p => p.id === room.settings.map) || {}).name || room.settings.map : 'Random ' + room.settings.size + ' ' + room.settings.shape;
    $('lobbySettings').textContent = 'Map: ' + mapName + ' · Players: ' + room.players.length + ' · AI: ' + room.settings.aiCount;
    $('btnLobbyStart').classList.toggle('hidden', !isHost);
  }

  function addLobbyChat(name, text) {
    const list = $('lobbyChatList');
    if (!list) return;
    list.appendChild(el('div', {}, el('b', { text: name + ': ' }), document.createTextNode(text)));
    list.scrollTop = list.scrollHeight;
  }

  function addGameChat(name, text) {
    const list = $('gameChatList');
    if (!list) return;
    list.appendChild(el('div', {}, el('b', { text: name + ': ' }), document.createTextNode(text)));
    list.scrollTop = list.scrollHeight;
  }

  function showGameMenu(showChatBtn) {
    openModal('', { kind: 'gamemenu' });
    const body = modalLayer.querySelector('.mbody');
    body.innerHTML = '';
    body.appendChild(el('h2', { text: 'Game Menu' }));
    const mk = (label, act) => {
      const b = el('button', { class: 'btn', text: label });
      b.addEventListener('click', () => { h.gameMenu(act); });
      return b;
    };
    body.appendChild(mk('Resume', 'resume'));
    if (showChatBtn) body.appendChild(mk('Chat', 'chat'));
    body.appendChild(mk('How to Play', 'howto'));
    const leave = mk('Leave Game', 'leave');
    leave.classList.add('ghost');
    body.appendChild(leave);
  }

  function toggleChat(show) {
    const p = $('chatPanel');
    if (p) p.classList.toggle('hidden', !show);
  }

  // ===================== GAIN CARD ANIMATION =====================

  function animateGains(state, myPid) {
    if (!state || !state.lastGains || !state.lastGains.length) return;
    const view = h.view;
    if (!view) return;
    const canvas = $('board');
    if (!canvas) return;
    const b = state.board;
    const crect = canvas.getBoundingClientRect();
    const tray = $('resTray');
    const list = $('playerList');
    let delay = 0;
    for (const g of state.lastGains) {
      const hex = b.hexes[g.hid];
      if (!hex) continue;
      const [hx, hy] = boardToScreen(view, hex.cx, hex.cy);
      const sx = crect.left + hx, sy = crect.top + hy;
      for (const gain of g.gains) {
        const target = gainTarget(gain.pid, gain.kind, myPid, tray, list);
        if (!target) continue;
        for (let k = 0; k < gain.amt; k++) {
          spawnGainCard(sx, sy, target, gain.kind, delay);
          delay += 55;
        }
      }
    }
  }

  function gainTarget(pid, kind, myPid, tray, list) {
    let box = null;
    if (pid === myPid && tray) {
      if (RESOURCES.includes(kind)) {
        const kids = tray.children;
        const idx = RESOURCES.indexOf(kind);
        if (kids[idx]) box = kids[idx];
      }
      if (!box) box = tray;
    } else if (list) {
      for (const r of list.children) {
        if (r.classList && r.classList.contains('pl') && r.dataset.pid === String(pid)) {
          const rc = r.getBoundingClientRect();
          if (rc.width > 4 && rc.height > 4) box = r;
          break;
        }
      }
      if (!box) {
        const badge = $('turnBadge');
        if (badge) {
          const rc = badge.getBoundingClientRect();
          if (rc.width > 4 && rc.height > 4) box = badge;
        }
      }
    }
    if (!box) return null;
    const rc = box.getBoundingClientRect();
    return { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 };
  }

  function spawnGainCard(sx, sy, target, kind, delay) {
    const icon = kind === 'gold' ? '✨'
      : kind === 'paper' || kind === 'coin' || kind === 'cloth' ? COMMODITY_ICONS[kind]
        : (RESOURCE_ICON[kind] || '🃏');
    const card = el('div', { class: 'gainCard', style: 'left:' + sx + 'px;top:' + sy + 'px' });
    card.textContent = icon;
    document.body.appendChild(card);
    const dx = target.x - sx, dy = target.y - sy;
    const dur = 900;
    const rafSafe = (cb) => {
      let done = false;
      const id = requestAnimationFrame(() => { done = true; cb(); });
      setTimeout(() => { if (!done) { cancelAnimationFrame(id); cb(); } }, 40);
    };
    setTimeout(() => {
      const t0 = performance.now();
      const step = () => {
        const p = Math.min(1, (performance.now() - t0) / dur);
        const e = 1 - (1 - p) * (1 - p);
        const lift = Math.sin(p * Math.PI) * -48;
        card.style.transform = 'translate(' + (dx * e) + 'px,' + (dy * e + lift) + 'px)';
        card.style.opacity = p < 0.12 ? String(p / 0.12) : (p > 0.82 ? String(Math.max(0, 1 - (p - 0.82) / 0.18)) : '1');
        if (p < 1) rafSafe(step);
        else card.remove();
      };
      step();
    }, delay);
  }

  return {
    el, toast, openModal, closeModal, showScreen,
    setTurnBadge, setPhaseText, setDice, setRollEnabled, setEndTurnEnabled,
    renderHUD, showPendingBar, hidePendingBar, showForced, closeForced,
    showDiscardModal, showStealModal, showYearModal, showMonopolyModal,
    showDevCardsModal, showTradeModal, showGameOver, showHowTo, showBuildGuide, showGameMenu,
    showImprovementModal, showProgressModal, showKnightModal, showAlchemistModal,
    showCraneModal, showIntrigueModal, showMonopolyCModal,
    animateGains, tickTradeWait,
    renderLobby, addLobbyChat, addGameChat, toggleChat,
  };
}
