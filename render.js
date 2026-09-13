import { RESOURCE_INFO, RESOURCES, NUMBER_P, RESOURCE_ICON } from './board.js';

const SQRT3 = Math.sqrt(3);

export function fitView(board, W, H, margin = 46) {
  const { bounds } = board;
  const bw = (bounds.maxX - bounds.minX) || 1;
  const bh = (bounds.maxY - bounds.minY) || 1;
  let scale = Math.min((W - margin * 2) / bw, (H - margin * 2) / bh);
  scale = Math.max(scale, 0.05);
  return { scale, ox: W / 2 - board.center.x * scale, oy: H / 2 - board.center.y * scale };
}

export function boardToScreen(view, x, y) {
  return [x * view.scale + view.ox, y * view.scale + view.oy];
}

export function screenToBoard(view, sx, sy) {
  return [(sx - view.ox) / view.scale, (sy - view.oy) / view.scale];
}

function hash2(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  let oceanT = 0;

  function resize(w, h, pixelRatio) {
    W = w; H = h;
    dpr = pixelRatio || Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(game, view, ui, time) {
    const board = game.board;
    oceanT = time;
    ctx.clearRect(0, 0, W, H);
    drawOcean(ui && ui.oceanGradient);
    drawLandShadow(board, view);
    drawTiles(board, view, time);
    drawProduced(board, view, game);
    drawPorts(board, view);
    drawTokens(board, view);
    drawRoads(board, view, game);
    drawShips(board, view, game);
    drawBuildings(board, view, game);
    drawRobber(board, view, game);
    drawPirate(board, view, game);
    drawHighlights(board, view, ui, game);
  }

  function drawOcean(grad) {
    const g = grad || ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d3f55');
    g.addColorStop(0.5, '#11617a');
    g.addColorStop(1, '#0a3a50');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const t = oceanT / 2600;
    ctx.strokeStyle = 'rgba(170,220,235,0.10)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const y = ((i * 97 + t * 22) % (H + 200)) - 100;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 24) {
        const yy = y + Math.sin(x * 0.012 + i * 1.7 + t) * 9;
        if (x === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  function drawLandShadow(board, view) {
    const s = view.scale;
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(4,24,34,0.42)';
    for (const h of board.hexes) {
      ctx.beginPath();
      for (const c of h.corners) ctx.lineTo(c[0] + 2.2, c[1] + 3.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTiles(board, view, time) {
    const s = view.scale;
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(s, s);
    const hexSize = board.hexSize;
    for (const h of board.hexes) {
      const info = RESOURCE_INFO[h.resource];
      const jitter = (hash2(h.q * 3 + 1, h.r * 7 + 2) - 0.5) * 10;
      ctx.beginPath();
      for (const c of h.corners) ctx.lineTo(c[0], c[1]);
      ctx.closePath();
      const g = ctx.createRadialGradient(h.cx - hexSize * 0.3, h.cy - hexSize * 0.35, hexSize * 0.2, h.cx, h.cy, hexSize * 1.15);
      g.addColorStop(0, shade(info.color, 14 + jitter));
      g.addColorStop(1, shade(info.deep, 4 + jitter));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = shade(info.line, 0);
      ctx.stroke();
      drawTexture(h, info, hexSize, time);
    }
    ctx.restore();
  }

  function drawTexture(h, info, hexSize, time) {
    const c = ctx;
    c.save();
    c.translate(h.cx, h.cy);
    c.scale(hexSize / 34, hexSize / 34);
    c.globalAlpha = 0.9;
    const rr = hash2(h.q * 5, h.r * 3);
    c.rotate((rr - 0.5) * 0.5);
    if (h.resource === 'forest') {
      c.fillStyle = 'rgba(20,70,30,0.55)';
      for (let t = 0; t < 3; t++) {
        const ang = rr * 6.28 + t * 2.09;
        const px = Math.cos(ang) * 9, py = Math.sin(ang) * 9 + 3;
        c.beginPath();
        c.moveTo(px, py - 9);
        c.lineTo(px - 6, py + 3);
        c.lineTo(px + 6, py + 3);
        c.closePath();
        c.fill();
        c.fillStyle = 'rgba(120,70,25,0.6)';
        c.fillRect(px - 1.2, py + 2, 2.4, 4);
        c.fillStyle = 'rgba(20,70,30,0.55)';
      }
    } else if (h.resource === 'ore') {
      c.fillStyle = 'rgba(255,255,255,0.5)';
      c.beginPath();
      c.moveTo(-9, 7);
      c.lineTo(-5, -2);
      c.lineTo(-1, 6);
      c.closePath();
      c.fill();
      c.fillStyle = 'rgba(40,48,56,0.6)';
      c.beginPath();
      c.moveTo(1, 6);
      c.lineTo(6, -5);
      c.lineTo(10, 5);
      c.closePath();
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.beginPath();
      c.moveTo(5, -2);
      c.lineTo(6, -5);
      c.lineTo(8.5, 1);
      c.closePath();
      c.fill();
    } else if (h.resource === 'wool') {
      c.fillStyle = 'rgba(250,250,240,0.85)';
      c.beginPath();
      c.ellipse(-5, 3, 5.5, 4, 0.2, 0, 6.28);
      c.fill();
      c.fillStyle = 'rgba(70,60,50,0.5)';
      c.beginPath();
      c.arc(0.5, 1, 1.5, 0, 6.28);
      c.fill();
      c.fillStyle = 'rgba(250,250,240,0.85)';
      c.beginPath();
      c.ellipse(6, 4, 4.5, 3.5, -0.2, 0, 6.28);
      c.fill();
    } else if (h.resource === 'grain') {
      c.strokeStyle = 'rgba(150,110,20,0.8)';
      c.lineWidth = 1.4;
      for (let i = -2; i <= 2; i++) {
        const x = i * 5;
        c.beginPath();
        c.moveTo(x, 6);
        c.lineTo(x, -4);
        c.stroke();
        c.beginPath();
        c.ellipse(x, -5, 1.4, 3.2, 0.3, 0, 6.28);
        c.stroke();
      }
    } else if (h.resource === 'brick') {
      c.fillStyle = 'rgba(120,55,25,0.5)';
      c.strokeStyle = 'rgba(80,38,15,0.55)';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(-10, -1);
      c.quadraticCurveTo(0, -9, 10, -1);
      c.quadraticCurveTo(0, 7, -10, -1);
      c.fill();
      c.stroke();
      c.beginPath();
      c.arc(2, -2, 3.4, 0, 6.28);
      c.stroke();
    } else if (h.resource === 'desert') {
      c.fillStyle = 'rgba(150,120,60,0.5)';
      for (let i = 0; i < 8; i++) {
        const a = rr * 6.28 + i * 2.4;
        const r = 4 + (i % 3) * 4;
        c.beginPath();
        c.arc(Math.cos(a) * r, Math.sin(a) * r, 0.9, 0, 6.28);
        c.fill();
      }
      c.fillStyle = 'rgba(120,100,50,0.6)';
      c.beginPath();
      c.arc(-6, -4, 1.1, 0, 6.28);
      c.arc(4, 5, 1, 0, 6.28);
      c.fill();
    } else if (h.resource === 'gold') {
      c.translate(13, -12);
      c.rotate(0.35);
      c.fillStyle = 'rgba(255,215,100,0.5)';
      c.beginPath();
      c.arc(0, 0, 6.6, 0, 6.28);
      c.fill();
      c.strokeStyle = 'rgba(180,140,50,0.85)';
      c.lineWidth = 1.2;
      c.stroke();
      c.fillStyle = 'rgba(255,243,190,0.95)';
      c.beginPath();
      c.arc(-1.7, -1.9, 2.3, 0, 6.28);
      c.fill();
      c.fillStyle = 'rgba(255,225,135,0.95)';
      c.beginPath();
      c.arc(2.3, 1.7, 1.6, 0, 6.28);
      c.fill();
      c.strokeStyle = 'rgba(255,238,160,0.9)';
      c.lineWidth = 1.3;
      for (let k = 0; k < 4; k++) {
        const a = k * 1.5708;
        c.beginPath();
        c.moveTo(Math.cos(a) * 7.4, Math.sin(a) * 7.4);
        c.lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
        c.stroke();
      }
    } else if (h.resource === 'sea') {
      c.strokeStyle = 'rgba(255,255,255,0.26)';
      c.lineWidth = 1.1;
      for (let w = 0; w < 3; w++) {
        const wy = (rr + w * 0.34) * 10 - 9;
        c.beginPath();
        c.moveTo(-12, wy);
        c.quadraticCurveTo(-6, wy - 3.2, 0, wy);
        c.quadraticCurveTo(6, wy + 3.2, 12, wy);
        c.stroke();
      }
    }
    c.restore();
  }

  function drawProduced(board, view, game) {
    const lp = game && game.lastProduced;
    if (!lp || !lp.length) return;
    const s = view.scale;
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(s, s);
    const set = new Set(lp);
    for (const h of board.hexes) {
      if (!set.has(h.id)) continue;
      const g = ctx.createRadialGradient(h.cx, h.cy, board.hexSize * 0.2, h.cx, h.cy, board.hexSize * 1.1);
      g.addColorStop(0, 'rgba(70,215,90,0.42)');
      g.addColorStop(1, 'rgba(40,170,60,0.16)');
      ctx.fillStyle = g;
      ctx.beginPath();
      for (const c of h.corners) ctx.lineTo(c[0], c[1]);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(70,215,90,0.55)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPorts(board, view) {
    const s = view.scale;
    const hexSize = board.hexSize;
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(s, s);
    for (const e of board.edges) {
      if (!e.port) continue;
      const v1 = board.vertices[e.v1], v2 = board.vertices[e.v2];
      const mx = e.mid.x, my = e.mid.y;
      const sea = e.hexes ? board.hexes[e.hexes.find(hid => board.hexes[hid].isSea)] : null;
      const land = e.hexes ? board.hexes[e.hexes.find(hid => !board.hexes[hid].isSea)] : null;
      let ddx, ddy;
      if (sea) { ddx = sea.cx - mx; ddy = sea.cy - my; }
      else if (land) { ddx = mx - land.cx; ddy = my - land.cy; }
      else { const ex = v2.x - v1.x, ey = v2.y - v1.y; const el = Math.hypot(ex, ey) || 1; ddx = -ey / el; ddy = ex / el; }
      const dl = Math.hypot(ddx, ddy) || 1;
      const nx = ddx / dl, ny = ddy / dl;
      const px = mx + nx * hexSize * 0.62, py = my + ny * hexSize * 0.62;
      ctx.fillStyle = 'rgba(70,45,20,0.9)';
      ctx.strokeStyle = 'rgba(40,26,12,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(mx + nx * 2, my + ny * 2);
      ctx.lineTo(px, py);
      ctx.lineWidth = hexSize * 0.14;
      ctx.stroke();
      ctx.fillStyle = '#f7edd0';
      ctx.strokeStyle = '#4a3220';
      ctx.lineWidth = 1.4;
      const r = hexSize * 0.34;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, 6.28);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#4a3220';
      ctx.font = 'bold ' + Math.round(hexSize * 0.28) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(e.port.type === 'generic' ? '⚓' : RESOURCE_ICON[e.port.type], px, py - r * 0.06);
      const ratio = e.port.type === 'generic' ? '3:1' : '2:1';
      const bw = hexSize * 0.56, bh = hexSize * 0.26;
      const by = py + r * 0.72;
      ctx.fillStyle = 'rgba(30,18,8,0.95)';
      ctx.strokeStyle = 'rgba(255,244,214,0.9)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      const bd = bh * 0.42, bx0 = px - bw / 2, by0 = by - bh / 2;
      ctx.moveTo(bx0 + bd, by0);
      ctx.lineTo(bx0 + bw - bd, by0);
      ctx.quadraticCurveTo(bx0 + bw, by0, bx0 + bw, by0 + bd);
      ctx.lineTo(bx0 + bw, by0 + bh - bd);
      ctx.quadraticCurveTo(bx0 + bw, by0 + bh, bx0 + bw - bd, by0 + bh);
      ctx.lineTo(bx0 + bd, by0 + bh);
      ctx.quadraticCurveTo(bx0, by0 + bh, bx0, by0 + bh - bd);
      ctx.lineTo(bx0, by0 + bd);
      ctx.quadraticCurveTo(bx0, by0, bx0 + bd, by0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff7e0';
      ctx.font = 'bold ' + Math.round(hexSize * 0.2) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ratio, px, by + 0.5);
    }
    ctx.restore();
  }

  function drawTokens(board, view) {
    const s = view.scale;
    const hexSize = board.hexSize;
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(s, s);
    for (const h of board.hexes) {
      if (h.isSea || h.resource === 'desert' || !h.number) continue;
      const r = hexSize * 0.46;
      const red = h.number === 6 || h.number === 8;
      ctx.fillStyle = '#fdf6e3';
      ctx.strokeStyle = red ? '#b33a2e' : '#8a6d3b';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(h.cx, h.cy, r, 0, 6.28);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#40301c';
      ctx.font = 'bold ' + Math.round(hexSize * 0.5) + 'px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(h.number), h.cx, h.cy - (red ? hexSize * 0.06 : hexSize * 0.02));
      const p = NUMBER_P[h.number];
      const dots = p;
      ctx.fillStyle = red ? '#b33a2e' : '#8a6d3b';
      const rDot = hexSize * 0.045;
      const spacing = hexSize * 0.075;
      const totalW = (dots - 1) * spacing;
      for (let i = 0; i < dots; i++) {
        ctx.beginPath();
        ctx.arc(h.cx - totalW / 2 + i * spacing, h.cy + hexSize * 0.24, rDot, 0, 6.28);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawRoads(board, view, game) {
    const s = view.scale;
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(s, s);
    for (const e of board.edges) {
      if (e.owner === undefined || e.kind === 'ship') continue;
      const color = game.players[e.owner].color;
      const v1 = board.vertices[e.v1], v2 = board.vertices[e.v2];
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(30,20,10,0.55)';
      ctx.lineWidth = board.hexSize * 0.30;
      ctx.beginPath();
      ctx.moveTo(v1.x, v1.y);
      ctx.lineTo(v2.x, v2.y);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = board.hexSize * 0.20;
      ctx.beginPath();
      ctx.moveTo(v1.x, v1.y);
      ctx.lineTo(v2.x, v2.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawShips(board, view, game) {
    const s = view.scale;
    const hexSize = board.hexSize;
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(s, s);
    const bob = Math.sin(oceanT / 420) * 1.4;
    for (const e of board.edges) {
      if (e.owner === undefined || e.kind !== 'ship') continue;
      const color = game.players[e.owner].color;
      const v1 = board.vertices[e.v1], v2 = board.vertices[e.v2];
      const mx = e.mid.x, my = e.mid.y + bob * 0.4;
      const ang = Math.atan2(v2.y - v1.y, v2.x - v1.x);
      const u = hexSize * 0.24;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(12,22,32,0.55)';
      ctx.beginPath();
      ctx.ellipse(0, u * 0.7, u * 0.95, u * 0.28, 0, 0, 6.28);
      ctx.fill();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(30,20,12,0.85)';
      ctx.lineWidth = 1.3;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(-u * 1.1, u * 0.42);
      ctx.lineTo(-u * 0.55, -u * 0.28);
      ctx.lineTo(u * 0.55, -u * 0.28);
      ctx.lineTo(u * 1.1, u * 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = 'rgba(60,40,20,0.9)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(u * 0.15, -u * 0.3);
      ctx.lineTo(u * 0.15, -u * 1.35);
      ctx.stroke();
      ctx.fillStyle = '#f7edd0';
      ctx.strokeStyle = 'rgba(70,50,25,0.8)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(u * 0.22, -u * 1.3);
      ctx.lineTo(u * 0.95, -u * 0.95);
      ctx.lineTo(u * 0.22, -u * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawBuildings(board, view, game) {
    const s = view.scale;
    const hexSize = board.hexSize;
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(s, s);
    for (const v of board.vertices) {
      if (v.owner === undefined) continue;
      const color = game.players[v.owner].color;
      drawBuilding(ctx, v.x, v.y, v.type === 'city' ? 'city' : 'settlement', color, hexSize);
    }
    ctx.restore();
  }

  function drawBuilding(c, x, y, type, color, hexSize) {
    const u = hexSize * 0.36;
    c.save();
    c.translate(x, y);
    c.fillStyle = 'rgba(20,14,8,0.35)';
    c.beginPath();
    c.ellipse(1.5, 2.5, u * 1.05, u * 0.8, 0, 0, 6.28);
    c.fill();
    const dark = shade(color, -45);
    if (type === 'settlement') {
      const w = u * 0.92, h = u * 0.6;
      c.fillStyle = '#f5ead2';
      c.fillRect(-w / 2, -h * 0.6, w, h);
      c.strokeStyle = 'rgba(40,28,14,0.5)';
      c.lineWidth = 1;
      c.strokeRect(-w / 2, -h * 0.6, w, h);
      c.fillStyle = dark;
      c.beginPath();
      c.moveTo(-w / 2 - 1, -h * 0.6);
      c.lineTo(0, -h * 0.6 - u * 0.62);
      c.lineTo(w / 2 + 1, -h * 0.6);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = color;
      c.fillRect(-w / 2 + 1.5, -h * 0.6 + 1.5, w - 3, 1.5);
      c.fillRect(-w / 2 + 1.5, -h * 0.25, w - 3, 1.5);
    } else {
      const w = u * 1.3, h = u * 0.75, tw = u * 0.42;
      c.fillStyle = '#f5ead2';
      c.fillRect(-w / 2, -h * 0.5, w, h);
      c.strokeStyle = 'rgba(40,28,14,0.5)';
      c.lineWidth = 1;
      c.strokeRect(-w / 2, -h * 0.5, w, h);
      c.fillStyle = dark;
      c.beginPath();
      c.moveTo(-w / 2 - 1, -h * 0.5);
      c.lineTo(0, -h * 0.5 - u * 0.72);
      c.lineTo(w / 2 + 1, -h * 0.5);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#f5ead2';
      c.fillRect(w / 2 - tw - 1, -h * 0.5 - u * 0.78, tw, u * 0.9);
      c.strokeRect(w / 2 - tw - 1, -h * 0.5 - u * 0.78, tw, u * 0.9);
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(w / 2 - tw - 2, -h * 0.5 - u * 0.78);
      c.lineTo(w / 2 - 1, -h * 0.5 - u * 0.78 - tw * 0.7);
      c.lineTo(w / 2 + 1, -h * 0.5 - u * 0.78);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = color;
      c.fillRect(-w / 2 + 1.5, -h * 0.5 + 1.5, w - 3, 1.5);
      c.fillRect(-w / 2 + 1.5, -h * 0.2, w - 3, 1.5);
    }
    c.restore();
  }

  function drawRobber(board, view, game) {
    const s = view.scale;
    const hexSize = board.hexSize;
    if (game.robber === undefined || game.robber === null) return;
    const h = board.hexById.get(game.robber);
    if (!h) return;
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(s, s);
    const x = h.cx, y = h.cy;
    const u = hexSize * 0.5;
    ctx.fillStyle = 'rgba(15,12,8,0.4)';
    ctx.beginPath();
    ctx.ellipse(x + 1.5, y + u * 0.62, u * 0.5, u * 0.28, 0, 0, 6.28);
    ctx.fill();
    ctx.fillStyle = '#2a2320';
    ctx.strokeStyle = '#0f0c0a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y - u * 0.34, u * 0.3, 0, 6.28);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - u * 0.34, y + u * 0.5);
    ctx.lineTo(x, y - u * 0.05);
    ctx.lineTo(x + u * 0.34, y + u * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(x, y - u * 0.4, u * 0.1, 0, 6.28);
    ctx.fill();
    ctx.restore();
  }

  function drawPirate(board, view, game) {
    const s = view.scale;
    const hexSize = board.hexSize;
    if (!game.expansions || !game.expansions.seafarers || game.pirate == null) return;
    const h = board.hexById.get(game.pirate);
    if (!h) return;
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(s, s);
    const u = hexSize * 0.38;
    ctx.translate(h.cx, h.cy + Math.sin(oceanT / 380) * 1.3);
    ctx.fillStyle = 'rgba(4,6,10,0.45)';
    ctx.beginPath();
    ctx.ellipse(0, u * 0.95, u * 0.95, u * 0.3, 0, 0, 6.28);
    ctx.fill();
    ctx.fillStyle = '#14181d';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-u * 1.0, u * 0.62);
    ctx.lineTo(-u * 0.5, -u * 0.25);
    ctx.lineTo(u * 0.5, -u * 0.25);
    ctx.lineTo(u * 1.0, u * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(u * 0.1, -u * 0.3);
    ctx.lineTo(u * 0.1, -u * 1.55);
    ctx.stroke();
    ctx.fillStyle = '#1c1c22';
    ctx.beginPath();
    ctx.moveTo(u * 0.16, -u * 1.5);
    ctx.lineTo(u * 1.05, -u * 1.08);
    ctx.lineTo(u * 0.16, -u * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e8d9a8';
    ctx.font = 'bold ' + Math.round(u * 1.3) + 'px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('☠', u * 0.6, -u * 1.1);
    ctx.restore();
  }

  function drawHighlights(board, view, ui, game) {
    if (!ui || !ui.pending) return;
    const s = view.scale;
    const hexSize = board.hexSize;
    const pend = ui.pending;
    ctx.save();
    ctx.translate(view.ox, view.oy);
    ctx.scale(s, s);
    if (pend.type === 'settlement' || pend.type === 'setupSettlement') {
      for (const vid of pend.valid || []) {
        const v = board.vertices[vid];
        if (v.owner !== undefined) continue;
        ctx.fillStyle = v.id === pend.hover ? 'rgba(255,255,120,0.95)' : 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.arc(v.x, v.y, hexSize * 0.24, 0, 6.28);
        ctx.fill();
      }
    } else if (pend.type === 'road' || pend.type === 'setupRoad' || pend.type === 'ship') {
      for (const eid of pend.valid || []) {
        const e = board.edges[eid];
        const v1 = board.vertices[e.v1], v2 = board.vertices[e.v2];
        ctx.strokeStyle = e.id === pend.hover ? 'rgba(255,255,120,0.95)' : (pend.type === 'ship' ? 'rgba(120,220,255,0.55)' : 'rgba(255,255,255,0.5)');
        ctx.lineWidth = hexSize * 0.3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(v1.x, v1.y);
        ctx.lineTo(v2.x, v2.y);
        ctx.stroke();
      }
    } else if (pend.type === 'city') {
      for (const vid of pend.valid || []) {
        const v = board.vertices[vid];
        ctx.strokeStyle = v.id === pend.hover ? 'rgba(255,255,120,0.95)' : 'rgba(255,255,255,0.6)';
        ctx.lineWidth = hexSize * 0.14;
        ctx.beginPath();
        ctx.arc(v.x, v.y, hexSize * 0.34, 0, 6.28);
        ctx.stroke();
      }
    } else if (pend.type === 'robber') {
      for (const hid of pend.valid || []) {
        const h = board.hexes[hid];
        ctx.fillStyle = hid === pend.hover ? 'rgba(255,255,120,0.4)' : 'rgba(255,80,60,0.22)';
        ctx.beginPath();
        for (const c of h.corners) ctx.lineTo(c[0], c[1]);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  return {
    resize, draw, fitView, boardToScreen, screenToBoard,
    get ctx() { return ctx; },
    get width() { return W; },
    get height() { return H; },
  };
}
