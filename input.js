import { screenToBoard } from './render.js';

export function createInput(canvas, renderer, view, opts = {}) {
  const pointers = new Map();
  let pinch0 = 0;
  let downInfo = null;
  let moved = 0;

  const board = () => opts.getBoard && opts.getBoard();

  function setView(newScale, newOx, newOy) {
    view.scale = Math.max(0.18, Math.min(3.2, newScale));
    view.ox = newOx;
    view.oy = newOy;
    if (opts.onViewChange) opts.onViewChange(view);
  }

  function zoomAt(factor, sx, sy) {
    const ns = view.scale * factor;
    const clamped = Math.max(0.18, Math.min(3.2, ns));
    const k = clamped / view.scale;
    view.scale = clamped;
    view.ox = sx - (sx - view.ox) * k;
    view.oy = sy - (sy - view.oy) * k;
    if (opts.onViewChange) opts.onViewChange(view);
  }

  function local(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e) {
    const L = local(e);
    try { canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); } catch (err) {}
    pointers.set(e.pointerId, { x: L.x, y: L.y });
    moved = 0;
    if (pointers.size === 1) {
      downInfo = { x: L.x, y: L.y, ox: view.ox, oy: view.oy, sx: L.x, sy: L.y };
    } else if (pointers.size === 2) {
      const pts = [...pointers.values()];
      pinch0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      downInfo = null;
    }
  }

  function onPointerMove(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const L = local(e);
    const dx = L.x - p.x, dy = L.y - p.y;
    p.x = L.x; p.y = L.y;
    if (pointers.size === 1 && downInfo) {
      moved += Math.abs(dx) + Math.abs(dy);
      view.ox = downInfo.ox + (L.x - downInfo.x);
      view.oy = downInfo.oy + (L.y - downInfo.y);
      if (opts.onViewChange) opts.onViewChange(view);
    } else if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinch0 > 0 && d > 0) {
        const cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2;
        zoomAt(d / pinch0, cx, cy);
      }
      pinch0 = d;
    }
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch0 = 0;
    if (downInfo && pointers.size === 0) {
      const t = downInfo;
      downInfo = null;
      if (moved < 10) handleTap(t.sx, t.sy);
    }
  }

  function onPointerCancel(e) { pointers.delete(e.pointerId); downInfo = null; pinch0 = 0; }

  function onWheel(e) {
    e.preventDefault();
    const L = local(e);
    const factor = Math.exp(-e.deltaY * 0.0012);
    zoomAt(factor, L.x, L.y);
  }

  function onHoverMove(e) {
    if (!opts.onHover) return;
    const b = board();
    if (!b) { opts.onHover(null); return; }
    const L = local(e);
    const hit = computeHit(b, L.x, L.y, 999999, null);
    opts.onHover(hit ? { type: hit.type, id: hit.id } : null);
  }

  function computeHit(b, sx, sy, maxScreenDist, filter) {
    const [bx, by] = screenToBoard(view, sx, sy);
    const best = { type: 'hex', id: -1, d: Infinity };
    const maxD = maxScreenDist / view.scale;
    const cand = (type, items, getXY, idKey, member) => {
      for (const it of items) {
        if (member && !member(it)) continue;
        const [x, y] = getXY(it);
        const d = Math.hypot(x - bx, y - by);
        if (d < best.d && d <= maxD) { best.type = type; best.id = it[idKey]; best.d = d; }
      }
    };
    if (filter && filter.vertices) {
      const set = filter.vertices;
      cand('vertex', b.vertices, v => [v.x, v.y], 'id', v => set.has(v.id));
    }
    if (filter && filter.edges) {
      const set = filter.edges;
      cand('edge', b.edges, e => [e.mid.x, e.mid.y], 'id', e => set.has(e.id));
    }
    if (!filter || filter.hexes) {
      cand('hex', b.hexes, h => [h.cx, h.cy], 'id', h => (filter && filter.hexes) ? filter.hexes.has(h.id) : true);
    }
    return best.id >= 0 ? best : null;
  }

  function tapFilterFor(pending) {
    if (!pending) return null;
    if (pending.type === 'settlement' || pending.type === 'setupSettlement') return { vertices: new Set(pending.valid || []), edges: null, hexes: null };
    if (pending.type === 'city') return { vertices: new Set(pending.valid || []), edges: null, hexes: null };
    if (pending.type === 'road' || pending.type === 'setupRoad' || pending.type === 'ship') return { vertices: null, edges: new Set(pending.valid || []), hexes: null };
    if (pending.type === 'robber') return { vertices: null, edges: null, hexes: new Set(pending.valid || []) };
    return null;
  }

  function handleTap(sx, sy) {
    const b = board();
    if (!b) return;
    const filter = tapFilterFor(opts.getPending && opts.getPending());
    const hit = computeHit(b, sx, sy, filter ? 26 : 16, filter);
    if (hit) opts.onTap && opts.onTap(hit);
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', e => {
    if (pointers.size > 0) onPointerMove(e);
    else onHoverMove(e);
  });
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  return {
    handleTap,
    setView,
    computeHit,
    get view() { return view; },
    destroy() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('wheel', onWheel);
    },
  };
}
