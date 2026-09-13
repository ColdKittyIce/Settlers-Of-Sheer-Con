import { makeRng } from './rand.js';

export const RESOURCES = ['brick', 'lumber', 'wool', 'grain', 'ore'];
export const NUMBER_P = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };

export const RESOURCE_INFO = {
  brick:  { name: 'Hills',     color: '#c97b3a', deep: '#9c5a24', line: '#7d4520', text: '#fff2e2' },
  lumber: { name: 'Forest',    color: '#4a9c50', deep: '#2f6f37', line: '#245a2b', text: '#eaffea' },
  wool:   { name: 'Pasture',   color: '#a9cf5a', deep: '#82a93f', line: '#6b8f33', text: '#2a3318' },
  grain:  { name: 'Fields',    color: '#eec64f', deep: '#c89f2c', line: '#a37e1f', text: '#3a2f12' },
  ore:    { name: 'Mountains', color: '#8f9aa8', deep: '#6a7480', line: '#525b65', text: '#f0f4f8' },
  desert: { name: 'Desert',    color: '#ecd9a6', deep: '#c9b072', line: '#a98f52', text: '#5b4a22' },
  sea:    { name: 'Sea',       color: '#17718f', deep: '#0d4c63', line: '#0a3d52', text: '#bfe6f2' },
  gold:   { name: 'Gold',      color: '#e6c35c', deep: '#c49a2e', line: '#a37e1f', text: '#3a2f12' },
};

export const RESOURCE_ICON = { brick: '🧱', lumber: '🌲', wool: '🐑', grain: '🌾', ore: '⛏', gold: '✨' };

const SQRT3 = Math.sqrt(3);

export const axialNeighbors = () => [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
export const hexKey = (q, r) => q + ',' + r;

const SIZE_INFO = {
  tiny:     { radius: 1, target: 7,  ports: 4, label: 'Tiny' },
  standard: { radius: 2, target: 19, ports: 9, label: 'Standard' },
  large:    { radius: 3, target: 37, ports: 12, label: 'Large' },
};

const PRESET_TOKEN = { H: 'brick', F: 'grain', M: 'ore', P: 'wool', L: 'lumber', D: 'desert', S: 'sea' };

const CENTER = 'center';
const LEFT = 'left';

export const PRESETS = [
  { id: 'standard', name: 'Standard Isle', size: 'standard', align: CENTER, grid: [
      'M P L',
      'F P F M',
      'L D H F P',
      'M L H F',
      'H P L',
    ] },
  { id: 'golden', name: 'Golden Fields', size: 'standard', align: CENTER, grid: [
      'F H M',
      'F L P F',
      'H M D F P',
      'M H F L',
      'F P L',
    ] },
  { id: 'shepherd', name: "Shepherd's Isle", size: 'standard', align: CENTER, grid: [
      'P H F',
      'P L M P',
      'H F D P M',
      'F H P L',
      'P M L',
    ] },
  { id: 'iron', name: 'Iron Coast', size: 'standard', align: CENTER, grid: [
      'M H F',
      'M L P M',
      'H F D M P',
      'F H M L',
      'M P L',
    ] },
  { id: 'forest', name: 'Deep Forest', size: 'standard', align: CENTER, grid: [
      'L H F',
      'L P M L',
      'H F D L M',
      'F H L P',
      'L M P',
    ] },
  { id: 'brick', name: 'Clay Pits', size: 'standard', align: CENTER, grid: [
      'H F M',
      'H L P H',
      'F M D H P',
      'M F H L',
      'H P L',
    ] },
  { id: 'hexagon', name: 'Base Hexagon', size: 'standard', align: CENTER, randRes: true, grid: [
      'HHH',
      'HHHH',
      'HHHHH',
      'HHHH',
      'HHH',
    ] },
  { id: 'diamond', name: 'The Diamond', size: 'standard', align: CENTER, randRes: true, grid: [
      '..HHH..',
      '.HHHHHH.',
      'HHHHHHH',
      '.HHHHHH.',
      '..HHH..',
    ] },
  { id: 'longship', name: 'Longship', size: 'large', align: CENTER, randRes: true, grid: [
      '..HH..',
      '.HHH.',
      '.HHHH.',
      'HHHHH',
      '.HHHHHH.',
      'HHHHHHH',
      '.HHHHHH.',
      'HHHHH',
      '.HHHH.',
      '.HHH.',
      '..HH..',
    ] },
  { id: 'ring', name: 'The Ring', size: 'large', align: CENTER, randRes: true, grid: [
      '..HHHH..',
      '.HHHHH..',
      '.HHSSHH.',
      'HHSSSHH',
      '.HHSSHH.',
      '.HHHHH..',
      '..HHHH..',
    ] },
  { id: 'star', name: 'The Star', size: 'large', align: CENTER, randRes: true, grid: [
      '....H....',
      '...HHHH...',
      '..HHHHHHH..',
      '..HHHHHH..',
      '.HHHHHHHHH.',
      '..HHHHHH..',
      '..HHHHHHH..',
      '...HHHH...',
      '....H....',
    ] },
  { id: 'twins', name: 'Twin Islands', size: 'large', align: CENTER, randRes: true, grid: [
      '..HHHSSSHHH..',
      '.HHHHHSSSHHHHH.',
      'HHHHHHSSSHHHHHH',
      'HHHHHHSSSHHHHHH',
      'HHHHHHSSSHHHHHH',
      '.HHHHHSSSHHHHH.',
      '..HHHSSSHHH..',
    ] },
  { id: 'atoll', name: 'The Atoll', size: 'large', align: CENTER, randRes: true, grid: [
      'HHHHH',
      'HHHHHH',
      'HHSSSHH',
      'HHSSSSHH',
      'HHSSSSSHH',
      'HHSSSSHH',
      'HHSSSHH',
      'HHHHHH',
      'HHHHH',
    ] },
  { id: 'archipelago', name: 'Archipelago', size: 'large', align: LEFT, randRes: true, grid: [
      '...HHHHH.....',
      '..HHHHHHHH...',
      '.HHHHHHHHHH..',
      '..SSSSSSSS...',
      '..SSSSSSSS...',
      '.HSSSSSSSSH..',
      '.HH.SSSS.HH..',
      '.HHH....HHH..',
      '..HHH..HHH...',
      '...H....H....',
    ] },
  { id: 'crescent', name: 'Crescent Moon', size: 'standard', align: LEFT, randRes: true, grid: [
      '...HHHH.',
      '..HHHHHH',
      '.HHHHHH.',
      '.HHHH...',
      '.HHHH...',
      '.HHHHHH.',
      '..HHHHHH',
      '...HHHH.',
    ] },
  { id: 'usa', name: 'USA', size: 'large', align: LEFT, randRes: true, grid: [
      '....HHHHHHHHHHH.',
      '...HHHHHHHHHHHH.',
      '...HHHHHHHHHHH..',
      '..HHHHHHHHHHH..',
      '.HHHHHHHHHHHH..',
      '.HHHHHHHHHHHHH.',
      '..HHHHHHHHHHH..',
      '..HHHHHHHH.HHH.',
      '...HHHHSSSHHHH.',
      '.....HHSSSHHH..',
      '.....HHSS.HH...',
    ] },
  { id: 'europe', name: 'Europe', size: 'large', align: LEFT, randRes: true, grid: [
      '..HHS.HH.........',
      '.HHHSHHHH.......',
      '..HHSHHHHHH.....',
      '....HHHHHHHHHH...',
      '....HHHHHHHHHHH..',
      '...HHHHHHHHHHHH.',
      '...HHHHHHHHHHHH.',
      '..HHHHHHHHHHHH..',
      '..HHHHHH..HHHH..',
      '..HHHHH....HHH..',
      '..HHHH.....HHH..',
      '...HHH.....HH...',
      '...HH......HH...',
      '.SSSSSSSSSSSSS..',
    ] },
];

function presetHexes(preset) {
  const hexes = [];
  const rows = preset.grid.map(r => r.trim());
  const radius = Math.floor((rows.length - 1) / 2);
  rows.forEach((rowStr, ri) => {
    const r = ri - radius;
    const chars = rowStr.replace(/ /g, '');
    const count = chars.split('').filter(ch => ch !== '.').length;
    if (preset.align === 'center') {
      let q = Math.round(-r / 2 - (count - 1) / 2);
      for (const ch of chars) {
        if (ch !== '.') {
          const res = PRESET_TOKEN[ch];
          if (res) hexes.push({ q, r, resource: res });
          q++;
        }
      }
    } else {
      let q = -radius;
      for (const ch of chars) {
        if (ch !== '.') {
          const res = PRESET_TOKEN[ch];
          if (res) hexes.push({ q, r, resource: res });
        }
        q++;
      }
    }
  });
  return hexes;
}

export function generateBoard(opts = {}) {
  const seed = opts.seed ?? 'pioneers';
  const shape = opts.shape ?? 'classic';
  const hexSize = opts.hexSize ?? 34;
  const preset = opts.preset ? PRESETS.find(p => p.id === opts.preset) : null;
  const seafarers = !!opts.seafarers;

  let hexes, size, rng;
  const goldCount = seafarers ? 2 : 0;
  if (preset) {
    size = preset.size;
    rng = makeRng(seed + '::' + preset.id);
    hexes = presetHexes(preset);
    if (preset.randRes) assignResources(hexes, rng, goldCount);
    assignNumbers(hexes, rng);
    if (seafarers && !preset.randRes) injectGold(hexes, rng, goldCount);
  } else {
    size = SIZE_INFO[opts.size] ? opts.size : 'standard';
    rng = makeRng(seed);
    const sizeInfo = SIZE_INFO[size];
    if (seafarers) {
      hexes = generateSeafarers(rng, sizeInfo);
    } else if (shape === 'classic') {
      hexes = [];
      for (let q = -sizeInfo.radius; q <= sizeInfo.radius; q++) {
        for (let r = -sizeInfo.radius; r <= sizeInfo.radius; r++) {
          if (Math.abs(q + r) <= sizeInfo.radius) hexes.push({ q, r });
        }
      }
    } else {
      hexes = growBlob(rng, sizeInfo.target, shape);
    }
    assignResources(hexes, rng, goldCount);
    assignNumbers(hexes, rng);
  }
  const sizeInfo = SIZE_INFO[size];

  hexes.forEach((h, i) => {
    h.id = i;
    h.cx = SQRT3 * hexSize * (h.q + h.r / 2);
    h.cy = hexSize * 1.5 * h.r;
    h.corners = [];
    for (let k = 0; k < 6; k++) {
      const ang = (Math.PI / 180) * (60 * k - 30);
      h.corners.push([h.cx + hexSize * Math.cos(ang), h.cy + hexSize * Math.sin(ang)]);
    }
    h.neighbors = axialNeighbors().map(([dq, dr]) => [h.q + dq, h.r + dr]).filter(([nq, nr]) => hexes.some(he => he.q === nq && he.r === nr));
    h.isSea = h.resource === 'sea';
    h.isCoast = !h.isSea && (h.neighbors.length < 6 || h.neighbors.some(([nq, nr]) => hexes.some(he => he.q === nq && he.r === nr && he.resource === 'sea')));
  });

  const { islands, islandOf, startingIsland } = computeIslands(hexes);

  const hexById = new Map(hexes.map(h => [h.id, h]));
  const hexesByKey = new Map(hexes.map(h => [hexKey(h.q, h.r), h]));

  const vertexMap = new Map();
  const vertices = [];
  const vertexKey = (x, y) => Math.round(x * 1000) + ',' + Math.round(y * 1000);
  hexes.forEach(h => {
    h.vertexIds = [];
    h.corners.forEach(c => {
      const k = vertexKey(c[0], c[1]);
      let vid = vertexMap.get(k);
      if (vid === undefined) {
        vid = vertices.length;
        vertexMap.set(k, vid);
        vertices.push({ id: vid, x: c[0], y: c[1], hexes: [] });
      }
      h.vertexIds.push(vid);
      vertices[vid].hexes.push(h.id);
    });
  });

  const edgeMap = new Map();
  const edges = [];
  hexes.forEach(h => {
    for (let i = 0; i < 6; i++) {
      const a = h.vertexIds[i], b = h.vertexIds[(i + 1) % 6];
      const k = a < b ? a + '_' + b : b + '_' + a;
      let e = edgeMap.get(k);
      if (e === undefined) {
        e = { id: edges.length, v1: Math.min(a, b), v2: Math.max(a, b), hexes: [] };
        edgeMap.set(k, e);
        edges.push(e);
      }
      e.hexes.push(h.id);
    }
  });
  edges.forEach(e => {
    e.mid = { x: (vertices[e.v1].x + vertices[e.v2].x) / 2, y: (vertices[e.v1].y + vertices[e.v2].y) / 2 };
    e.isSeaEdge = e.hexes.some(hid => hexes[hid].isSea);
  });

  const vertexNeighbors = vertices.map(() => []);
  const vertexEdges = vertices.map(() => []);
  edges.forEach(e => {
    vertexEdges[e.v1].push(e.id);
    vertexEdges[e.v2].push(e.id);
    if (!vertexNeighbors[e.v1].includes(e.v2)) vertexNeighbors[e.v1].push(e.v2);
    if (!vertexNeighbors[e.v2].includes(e.v1)) vertexNeighbors[e.v2].push(e.v1);
  });

  const coastal = edges.filter(e => e.hexes.filter(hid => !hexes[hid].isSea).length === 1);
  const numPorts = sizeInfo.ports;
  const portTypes = ['brick', 'lumber', 'wool', 'grain', 'ore'].slice(0, numPorts);
  while (portTypes.length < numPorts) portTypes.push('generic');
  const picked = pickPortEdges(rng, coastal, numPorts);
  const types = rng.shuffle(portTypes);
  picked.forEach((e, i) => {
    e.port = { type: types[i] };
    vertices[e.v1].port = { type: types[i], edge: e.id };
    vertices[e.v2].port = { type: types[i], edge: e.id };
  });

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  vertices.forEach(v => {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  });

  const getHexByKey = (q, r) => hexesByKey.get(hexKey(q, r));

  return {
    seed, size, shape, preset: preset ? preset.id : null, hexSize, sizeInfo,
    hexes, vertices, edges,
    hexById, getHexByKey, vertexNeighbors, vertexEdges,
    islands, islandOf, startingIsland,
    bounds: { minX, maxX, minY, maxY },
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  };
}

function maxAbs(q, r) {
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
}

function growBlob(rng, target, shape) {
  const maxR = Math.max(2, Math.ceil(Math.sqrt(target * 1.1)));
  const coords = new Map();
  coords.set('0,0', { q: 0, r: 0 });
  let border = new Set();
  for (const [dq, dr] of axialNeighbors()) border.add(dq + ',' + dr);
  while (coords.size < target && border.size > 0) {
    const cands = [...border].filter(k => {
      const [q, r] = k.split(',').map(Number);
      return maxAbs(q, r) <= maxR;
    });
    const pool = cands.length ? cands : all;
    let chosenKey;
    if (shape === 'elongated') {
      let best = null, bestS = -Infinity;
      for (const k of pool) {
        const [q, r] = k.split(',').map(Number);
        const s = Math.abs(q) * 4 - Math.abs(r) * 1.5 + rng.next();
        if (s > bestS) { bestS = s; best = k; }
      }
      chosenKey = best;
    } else {
      let best = null, bestS = -Infinity;
      for (const k of pool) {
        const [q, r] = k.split(',').map(Number);
        const s = -maxAbs(q, r) * 1.15 + rng.next();
        if (s > bestS) { bestS = s; best = k; }
      }
      chosenKey = best;
    }
    if (!chosenKey) break;
    const [q, r] = chosenKey.split(',').map(Number);
    coords.set(chosenKey, { q, r });
    border.delete(chosenKey);
    for (const [dq, dr] of axialNeighbors()) {
      const nk = (q + dq) + ',' + (r + dr);
      if (!coords.has(nk)) border.add(nk);
    }
  }
  return [...coords.values()];
}

function growBlobAt(rng, target, aq, ar, maxR, penalty) {
  const coords = new Map();
  coords.set(hexKey(aq, ar), { q: aq, r: ar });
  let border = new Set();
  for (const [dq, dr] of axialNeighbors()) border.add(hexKey(aq + dq, ar + dr));
  while (coords.size < target && border.size > 0) {
    const cands = [...border].filter(k => {
      const [q, r] = k.split(',').map(Number);
      return maxAbs(q, r) <= maxR;
    });
    if (!cands.length) break;
    let best = null, bestS = -Infinity;
    for (const k of cands) {
      const [q, r] = k.split(',').map(Number);
      let s = -Math.hypot(q - aq, r - ar) * 1.3 + rng.next();
      if (penalty) s -= penalty(q, r);
      if (s > bestS) { bestS = s; best = k; }
    }
    if (!best) break;
    const [q, r] = best.split(',').map(Number);
    coords.set(best, { q, r });
    border.delete(best);
    for (const [dq, dr] of axialNeighbors()) {
      const nk = hexKey(q + dq, r + dr);
      if (!coords.has(nk)) border.add(nk);
    }
  }
  return [...coords.values()];
}

function generateSeafarers(rng, sizeInfo) {
  const R = sizeInfo.radius === 2 ? 4 : 5;
  const landBudget = sizeInfo.radius === 2 ? 24 : 36;
  const mainTarget = landBudget - 10;
  const anchors = sizeInfo.radius === 2 ? [[4, -1], [-3, 2]] : [[5, -1], [-4, 3], [-1, 5]];
  const penalty = (q, r) => {
    let p = 0;
    for (const [aq, ar] of anchors) {
      const d = Math.hypot(q - aq, r - ar);
      if (d < 2.4) p += (2.4 - d) * 2.5;
    }
    return p;
  };
  let bestHexes = null, bestScore = -Infinity;
  for (let attempt = 0; attempt < 20; attempt++) {
    const main = growBlobAt(rng, mainTarget, 0, 0, R, penalty);
    const mainKeys = new Set(main.map(h => hexKey(h.q, h.r)));
    const islands = [main];
    for (const [aq, ar] of anchors) {
      if (mainKeys.has(hexKey(aq, ar))) continue;
      const target = 2 + Math.floor(rng.next() * 4);
      islands.push(growBlobAt(rng, target, aq, ar, R));
    }
    const landKeys = new Set();
    for (const isl of islands) for (const h of isl) landKeys.add(hexKey(h.q, h.r));
    const hexes = [];
    for (let q = -R; q <= R; q++) for (let r = -R; r <= R; r++) {
      if (maxAbs(q, r) > R) continue;
      hexes.push({ q, r, resource: landKeys.has(hexKey(q, r)) ? null : 'sea' });
    }
    const landCount = hexes.filter(h => h.resource !== 'sea').length;
    hexes.forEach((h, i) => { h.id = i; });
    const comps = computeIslands(hexes);
    const score = landCount + comps.islands.length * 100 + comps.islands[0].length;
    if (score > bestScore) { bestScore = score; bestHexes = hexes; }
    if (comps.islands.length >= 3 && landCount >= landBudget - 6) break;
  }
  return bestHexes;
}

function computeIslands(hexes) {
  const byKey = new Map(hexes.map(h => [hexKey(h.q, h.r), h]));
  const seen = new Set();
  const islands = [];
  for (const h of hexes) {
    if (h.resource === 'sea' || seen.has(h.id)) continue;
    const stack = [h.id];
    seen.add(h.id);
    const ids = [];
    while (stack.length) {
      const id = stack.pop();
      ids.push(id);
      for (const [dq, dr] of axialNeighbors()) {
        const n = byKey.get(hexKey(hexes[id].q + dq, hexes[id].r + dr));
        if (n && n.resource !== 'sea' && !seen.has(n.id)) {
          seen.add(n.id);
          stack.push(n.id);
        }
      }
    }
    islands.push(ids);
  }
  islands.sort((a, b) => b.length - a.length);
  const islandOf = new Map();
  islands.forEach((ids, i) => ids.forEach(id => islandOf.set(id, i)));
  return { islands, islandOf, startingIsland: islands[0] || null };
}

function assignResources(hexes, rng, goldCount = 0) {
  const land = hexes.filter(h => h.resource !== 'sea');
  const target = land.length;
  const nonDesert = target - 1 - goldCount;
  const base = Math.floor(nonDesert / 5);
  const rem = nonDesert - base * 5;
  const deck = [];
  RESOURCES.forEach((res, i) => {
    const n = base + (i < rem ? 1 : 0);
    for (let j = 0; j < n; j++) deck.push(res);
  });
  for (let j = 0; j < target - nonDesert - goldCount; j++) deck.push('desert');
  for (let j = 0; j < goldCount; j++) deck.push('gold');
  for (let attempt = 0; attempt < 60; attempt++) {
    const arr = rng.shuffle(deck);
    land.forEach((h, i) => { h.resource = arr[i]; h.number = 0; });
    if (!hasBadClump(hexes)) return;
  }
  land.forEach((h, i) => { h.resource = deck[i % deck.length]; h.number = 0; });
}

function injectGold(hexes, rng, goldCount) {
  if (!goldCount) return;
  const candidates = hexes.filter(h => h.resource !== 'sea' && h.resource !== 'desert' && h.resource !== 'gold');
  const picked = rng.shuffle(candidates).slice(0, Math.min(goldCount, candidates.length));
  picked.forEach(h => { h.resource = 'gold'; });
}

function hasBadClump(hexes) {
  const byKey = new Map(hexes.map(h => [hexKey(h.q, h.r), h]));
  for (const h of hexes) {
    if (h.resource === 'desert' || h.resource === 'sea' || h.resource === 'gold') continue;
    for (const [dq, dr] of axialNeighbors()) {
      const n = byKey.get(hexKey(h.q + dq, h.r + dr));
      if (!n || n.resource !== h.resource) continue;
      const n2 = byKey.get(hexKey(h.q + 2 * dq, h.r + 2 * dr));
      if (n2 && n2.resource === h.resource) return true;
    }
  }
  return false;
}

function makeNumberDeck(count) {
  const counts = { 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 8: 1, 9: 1, 10: 1, 11: 1, 12: 1 };
  let n = 10;
  const pairs = [[6, 8], [3, 11], [4, 10], [5, 9], [2, 12]];
  let pi = 0, turn = 0;
  while (n < count) {
    const [a, b] = pairs[pi];
    counts[turn % 2 === 0 ? a : b]++;
    n++;
    turn++;
    if (turn % 2 === 0) pi = (pi + 1) % pairs.length;
  }
  const deck = [];
  for (const key of Object.keys(counts)) {
    const val = +key;
    for (let j = 0; j < counts[key]; j++) deck.push(val);
  }
  return deck;
}

function assignNumbers(hexes, rng) {
  const land = hexes.filter(h => h.resource !== 'desert' && h.resource !== 'sea');
  const deck = makeNumberDeck(land.length);
  const sorted = deck.slice().sort((a, b) => b - a);
  const positions = rng.shuffle(land.slice());
  const byKey = new Map(hexes.map(h => [hexKey(h.q, h.r), h]));
  let nodes = 0;
  const conflict = (h, num) => {
    for (const [dq, dr] of axialNeighbors()) {
      const n = byKey.get(hexKey(h.q + dq, h.r + dr));
      if (n && n.number) {
        if ((num === 6 || num === 8) && (n.number === 6 || n.number === 8)) return true;
        if (n.number === num) return true;
      }
    }
    return false;
  };
  const used = new Set();
  const solve = (idx) => {
    if (idx >= sorted.length) return true;
    if (++nodes > 80000) return false;
    const num = sorted[idx];
    for (const h of positions) {
      if (used.has(h)) continue;
      if (conflict(h, num)) continue;
      h.number = num;
      used.add(h);
      if (solve(idx + 1)) return true;
      h.number = 0;
      used.delete(h);
    }
    return false;
  };
  if (!solve(0)) {
    positions.forEach((h, i) => { h.number = sorted[i]; });
  }
}

function pickPortEdges(rng, coastal, n) {
  const shuf = rng.shuffle(coastal);
  const used = new Set();
  const out = [];
  for (const e of shuf) {
    if (out.length >= n) break;
    if (used.has(e.v1) || used.has(e.v2)) continue;
    used.add(e.v1);
    used.add(e.v2);
    out.push(e);
  }
  return out;
}
