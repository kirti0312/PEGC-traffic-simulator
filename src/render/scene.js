import { rgba, mix } from './theme.js';

// Road geometry in metres (visual only; the simulation uses lane centres at +/- laneOffset).
// Decorative city grid around the simulated area (no traffic): indices of grid lines.
export const GRID = { ix0: -6, ix1: 8, iy0: -5, iy1: 6 };

export const ROAD = { half: 7.8, kerb: 1.1, pave: 4.0, junc: 13.5, fillet: 11 };

function hash(n) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// Two framings: `full` (whole network including entry/exit roads) and `cluster` (the six
// junctions plus a small margin), used by Fit all so the junctions fill the view.
export function worldBounds(net, cfg) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let jx0 = Infinity;
  let jx1 = -Infinity;
  let jy0 = Infinity;
  let jy1 = -Infinity;
  for (const n of net.nodeList) {
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y);
    maxY = Math.max(maxY, n.y);
    if (n.type === 'junction') {
      jx0 = Math.min(jx0, n.x);
      jx1 = Math.max(jx1, n.x);
      jy0 = Math.min(jy0, n.y);
      jy1 = Math.max(jy1, n.y);
    }
  }
  const m = 40;
  return {
    full: { minX: minX - m, maxX: maxX + m, minY: minY - m, maxY: maxY + m },
    cluster: { minX: jx0 - 62, maxX: jx1 + 62, minY: jy0 - 78, maxY: jy1 + 78 },
  };
}

// Static props: trees, street lights, bus shelters. Built once, deterministic.
export function buildProps(net, cfg) {
  const props = [];
  let id = 0;
  const L = cfg.blockLength;
  const jh = cfg.junctionHalf;
  const offs = ROAD.half + ROAD.kerb + ROAD.pave * 0.55;
  net.segments.forEach((seg, si) => {
    const a = net.nodes[seg.a];
    const b = net.nodes[seg.b];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const rx = -uy;
    const ry = ux;
    const margin = 34;
    for (let s = margin; s < len - margin; s += 46) {
      for (const side of [-1, 1]) {
        const key = si * 1000 + Math.round(s) * 2 + (side > 0 ? 1 : 0);
        const r = hash(key);
        if (r < 0.8) continue;
        const j = (hash(key + 77) - 0.5) * 14;
        const o = offs + 2.2 + hash(key + 5) * 2.2;
        props.push({ id: id++, type: 'tree', x: a.x + ux * (s + j) + rx * o * side, y: a.y + uy * (s + j) + ry * o * side, v: Math.floor(hash(key + 9) * 3), sz: 0.85 + hash(key + 13) * 0.5, ph: hash(key + 3) * 6.28 });
      }
    }
    // street lights on alternating sides
    let k = 0;
    for (let s = 52; s < len - 40; s += 62) {
      const side = k++ % 2 === 0 ? 1 : -1;
      props.push({ id: id++, type: 'light', x: a.x + ux * s + rx * (ROAD.half + ROAD.kerb + 1.2) * side, y: a.y + uy * s + ry * (ROAD.half + ROAD.kerb + 1.2) * side, ang: Math.atan2(uy, ux), side });
    }
    // an occasional bus shelter on internal segments
    if (seg.internal && si % 3 === 0) {
      const s = len * 0.55;
      const side = si % 2 ? 1 : -1;
      props.push({ id: id++, type: 'shelter', x: a.x + ux * s + rx * (ROAD.half + ROAD.kerb + 3.4) * side, y: a.y + uy * s + ry * (ROAD.half + ROAD.kerb + 3.4) * side, ang: Math.atan2(uy, ux), side });
    }
  });
  // a few block-interior trees near junction corners
  for (const j of net.junctions) {
    for (const [dx, dy] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const key = 90000 + j.idx * 10 + (dx + 1) + (dy + 1) * 2;
      if (hash(key) < 0.7) continue;
      props.push({ id: id++, type: 'tree', x: j.node.x + dx * 34, y: j.node.y + dy * 34, v: Math.floor(hash(key + 1) * 3), sz: 1.0 + hash(key + 2) * 0.4, ph: hash(key + 4) * 6.28 });
    }
  }
  for (let i = GRID.ix0; i < GRID.ix1; i++) {
    for (let j = GRID.iy0; j < GRID.iy1; j++) {
      if (blockKind(i, j) !== 'park') continue;
      for (let k = 0; k < 7; k++) {
        const key = 400000 + i * 977 + j * 131 + k * 17;
        props.push({ id: id++, type: 'tree', x: i * L + 40 + hash(key) * (L - 80), y: j * L + 40 + hash(key + 1) * (L - 80), v: Math.floor(hash(key + 2) * 3), sz: 0.9 + hash(key + 3) * 0.5, ph: hash(key + 4) * 6.28 });
      }
    }
  }
  void jh;
  return props;
}

function band(ctx, a, b, half, ext0 = 0, ext1 = 0) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  ctx.save();
  ctx.transform(ux, uy, -uy, ux, a.x, a.y);
  ctx.fillRect(-ext0, -half, len + ext0 + ext1, half * 2);
  ctx.restore();
}

// Concave corner fillets at a junction: for each of the four corners, the square beyond the
// corner point minus a quarter circle, which flares the roads smoothly into the junction.
function fillets(ctx, x, y, h, r) {
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const cx = x + sx * (h + r);
      const cy = y + sy * (h + r);
      const rx = Math.min(x + sx * h, cx);
      const ry = Math.min(y + sy * h, cy);
      ctx.save();
      ctx.beginPath();
      ctx.rect(rx, ry, r, r);
      ctx.clip();
      ctx.beginPath();
      ctx.rect(rx - 1, ry - 1, r + 2, r + 2);
      ctx.arc(cx, cy, r, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
      ctx.restore();
    }
  }
}

function roundSquare(ctx, x, y, half, r) {
  ctx.beginPath();
  ctx.moveTo(x - half + r, y - half);
  ctx.lineTo(x + half - r, y - half);
  ctx.quadraticCurveTo(x + half, y - half, x + half, y - half + r);
  ctx.lineTo(x + half, y + half - r);
  ctx.quadraticCurveTo(x + half, y + half, x + half - r, y + half);
  ctx.lineTo(x - half + r, y + half);
  ctx.quadraticCurveTo(x - half, y + half, x - half, y + half - r);
  ctx.lineTo(x - half, y - half + r);
  ctx.quadraticCurveTo(x - half, y - half, x - half + r, y - half);
  ctx.closePath();
  ctx.fill();
}

// Draws the static scene in WORLD coordinates (the caller has set the camera transform).
export function drawStaticWorld(ctx, net, cfg, th) {
  const { half, kerb, pave, junc } = ROAD;
  void junc;
  const F = ROAD.fillet;
  // pavement
  ctx.fillStyle = th.pavement;
  for (const s of net.segments) band(ctx, net.nodes[s.a], net.nodes[s.b], half + kerb + pave);
  for (const j of net.junctions) fillets(ctx, j.node.x, j.node.y, half + kerb + pave, F + 6);
  for (const j of net.junctions) roundSquare(ctx, j.node.x, j.node.y, half + kerb + pave, 2);
  // kerb (light grey outline, as in the reference)
  ctx.fillStyle = th.kerb;
  for (const s of net.segments) band(ctx, net.nodes[s.a], net.nodes[s.b], half + kerb);
  for (const j of net.junctions) fillets(ctx, j.node.x, j.node.y, half + kerb, F + 1.5);
  for (const j of net.junctions) roundSquare(ctx, j.node.x, j.node.y, half + kerb, 2);
  // asphalt
  ctx.fillStyle = th.road;
  for (const s of net.segments) band(ctx, net.nodes[s.a], net.nodes[s.b], half);
  for (const j of net.junctions) fillets(ctx, j.node.x, j.node.y, half, F);
  for (const j of net.junctions) roundSquare(ctx, j.node.x, j.node.y, half, 2);

  // subtle asphalt wear texture

  // median strips (muted yellow-green, broken)
  for (const s of net.segments) {
    const a = net.nodes[s.a];
    const b = net.nodes[s.b];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    ctx.save();
    ctx.transform(ux, uy, -uy, ux, a.x, a.y);
    const from = a.type === 'junction' ? junc + 8 : 8;
    const to = b.type === 'junction' ? len - junc - 8 : len - 8;
    ctx.fillStyle = rgba(th.median, 0.82);
    for (let p = from; p < to; ) {
      const seg = Math.min(70, to - p);
      ctx.fillRect(p, -1.5, seg, 3.0);
      p += seg + 6;
    }
    // edge lines
    ctx.fillStyle = rgba(th.lane, 0.28);
    ctx.fillRect(0, -(half - 0.7), len, 0.22);
    ctx.fillRect(0, half - 0.92, len, 0.22);
    ctx.restore();
  }

  // stop lines + crosswalks at every approach
  for (const e of net.edges) {
    if (!e.toJunction) continue;
    ctx.save();
    ctx.transform(e.ux, e.uy, e.rx, e.ry, e.a.x, e.a.y);
    ctx.fillStyle = rgba(th.lane, 0.55);
    ctx.fillRect(e.stopLine - 0.55, 0.9, 0.5, half - 1.5);
    ctx.fillStyle = rgba(th.lane, 0.36);
    for (let lat = 1.2; lat < half - 0.8; lat += 1.05) ctx.fillRect(e.stopLine + 0.6, lat, 3.4, 0.55);
    ctx.restore();
  }

  // signal island (roundel) at each junction: white ring, yellow-green fill
  for (const j of net.junctions) {
    const { x, y } = j.node;
    ctx.fillStyle = rgba(th.lane, 0.55);
    ctx.beginPath();
    ctx.arc(x, y, 3.0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = th.road;
    ctx.beginPath();
    ctx.arc(x, y, 2.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(th.median, 0.92);
    ctx.beginPath();
    ctx.arc(x, y, 2.45, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawGround(ctx, w, h, th) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createRadialGradient(w * 0.5, h * 0.55, h * 0.1, w * 0.5, h * 0.55, Math.max(w, h) * 0.75);
  g.addColorStop(0, th['ground-2']);
  g.addColorStop(1, th.ground);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

const inView = (v, x0, y0, x1, y1) => !(x1 < v.minX || x0 > v.maxX || y1 < v.minY || y0 > v.maxY);

// Dimmed city grid that continues beyond the simulated roads, so a zoomed-out view never
// shows an empty void. Purely decorative: no traffic, no signals, not part of any result.
export function drawDecorWorld(ctx, cfg, th, view) {
  const L = cfg.blockLength;
  const { half, kerb, pave } = ROAD;
  const x0 = GRID.ix0 * L;
  const x1 = GRID.ix1 * L;
  const y0 = GRID.iy0 * L;
  const y1 = GRID.iy1 * L;
  const cPave = mix(th.pavement, th.ground, 0.15);
  const cKerb = mix(th.kerb, th.ground, 0.62);
  const cRoad = mix(th.road, th.ground, 0.45);
  const cMed = mix(th.median, th.ground, 0.72);
  // park tint for some blocks
  for (let i = GRID.ix0; i < GRID.ix1; i++) {
    for (let j = GRID.iy0; j < GRID.iy1; j++) {
      const bx = i * L;
      const by = j * L;
      if (!inView(view, bx, by, bx + L, by + L)) continue;
      const k = blockKind(i, j);
      if (k === 'park') {
        ctx.fillStyle = 'rgba(93,138,60,0.07)';
        ctx.fillRect(bx + 17, by + 17, L - 34, L - 34);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.016)';
        ctx.fillRect(bx + 17, by + 17, L - 34, L - 34);
      }
    }
  }
  const layers = [
    [cPave, half + kerb + pave, 2],
    [cKerb, half + kerb, 1],
    [cRoad, half, 0],
  ];
  for (const [col, hw, extra] of layers) {
    ctx.fillStyle = col;
    for (let i = GRID.ix0; i <= GRID.ix1; i++) {
      const x = i * L;
      if (x + hw < view.minX || x - hw > view.maxX) continue;
      ctx.fillRect(x - hw, y0, hw * 2, y1 - y0);
    }
    for (let j = GRID.iy0; j <= GRID.iy1; j++) {
      const y = j * L;
      if (y + hw < view.minY || y - hw > view.maxY) continue;
      ctx.fillRect(x0, y - hw, x1 - x0, hw * 2);
    }
    for (let i = GRID.ix0; i <= GRID.ix1; i++) {
      for (let j = GRID.iy0; j <= GRID.iy1; j++) {
        const x = i * L;
        const y = j * L;
        if (!inView(view, x - 40, y - 40, x + 40, y + 40)) continue;
        fillets(ctx, x, y, hw, ROAD.fillet + extra * 2);
      }
    }
  }
  // dim median strips
  ctx.fillStyle = cMed;
  for (let i = GRID.ix0; i <= GRID.ix1; i++) {
    const x = i * L;
    if (x < view.minX - 10 || x > view.maxX + 10) continue;
    for (let j = GRID.iy0; j < GRID.iy1; j++) ctx.fillRect(x - 1.5, j * L + 22, 3, L - 44);
  }
  for (let j = GRID.iy0; j <= GRID.iy1; j++) {
    const y = j * L;
    if (y < view.minY - 10 || y > view.maxY + 10) continue;
    for (let i = GRID.ix0; i < GRID.ix1; i++) ctx.fillRect(i * L + 22, y - 1.5, L - 44, 3);
  }
}

export function blockKind(i, j) {
  const h = hash(i * 131 + j * 977 + 5);
  return h < 0.16 ? 'park' : 'built';
}

// Low-rise buildings per block, deterministic. Returned as footprints with heights (metres).
let BUILDINGS = null;
export function buildBuildings(cfg) {
  if (BUILDINGS) return BUILDINGS;
  const L = cfg.blockLength;
  const inset = ROAD.half + ROAD.kerb + ROAD.pave + 9;
  const out = [];
  for (let i = GRID.ix0; i < GRID.ix1; i++) {
    for (let j = GRID.iy0; j < GRID.iy1; j++) {
      if (blockKind(i, j) === 'park') continue;
      const bx = i * L + inset;
      const by = j * L + inset;
      const w = L - inset * 2;
      const qw = w / 2;
      for (let qx = 0; qx < 2; qx++) {
        for (let qy = 0; qy < 2; qy++) {
          const key = i * 7919 + j * 104729 + qx * 31 + qy * 57;
          if (hash(key) < 0.18) continue;
          const sw = 34 + hash(key + 1) * (qw - 44);
          const sh = 30 + hash(key + 2) * (qw - 40);
          const ox = bx + qx * qw + 4 + hash(key + 3) * Math.max(0, qw - sw - 8);
          const oy = by + qy * qw + 4 + hash(key + 4) * Math.max(0, qw - sh - 8);
          out.push({ x0: ox, y0: oy, x1: ox + sw, y1: oy + sh, h: 5 + hash(key + 5) * 18, shade: hash(key + 6) });
        }
      }
    }
  }
  BUILDINGS = out;
  return out;
}

// Extruded boxes drawn in screen space (after the ground), back to front.
export function drawBuildings(ctx, cam, cfg, th, view, dpr) {
  const list = buildBuildings(cfg).filter((b) => inView(view, b.x0 - 5, b.y0 - 40, b.x1 + 5, b.y1 + 5));
  list.sort((a, b) => cam.depth((a.x0 + a.x1) / 2, a.y1) - cam.depth((b.x0 + b.x1) / 2, b.y1));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const flat = cam.mode !== '3d';
  const top = mix(th.pavement, '#4a5a66', 0.32);
  const south = mix(th.pavement, th.ground, 0.35);
  const east = mix(th.pavement, '#2a3640', 0.3);
  const west = mix(th.pavement, th.ground, 0.5);
  const sn = Math.sin(cam.theta);
  const P = (x, y, z) => cam.project(x, y, z, [0, 0]);
  const poly = (pts, fill) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.closePath();
    ctx.fill();
  };
  for (const b of list) {
    const h = flat ? 3 : b.h;
    if (!flat) {
      poly([P(b.x0, b.y1, 0), P(b.x1, b.y1, 0), P(b.x1, b.y1, h), P(b.x0, b.y1, h)], south);
      if (sn > 0.001) poly([P(b.x1, b.y0, 0), P(b.x1, b.y1, 0), P(b.x1, b.y1, h), P(b.x1, b.y0, h)], east);
      if (sn < -0.001) poly([P(b.x0, b.y0, 0), P(b.x0, b.y1, 0), P(b.x0, b.y1, h), P(b.x0, b.y0, h)], west);
    }
    poly([P(b.x0, b.y0, h), P(b.x1, b.y0, h), P(b.x1, b.y1, h), P(b.x0, b.y1, h)], b.shade > 0.5 ? top : mix(top, th.ground, 0.18));
    ctx.strokeStyle = 'rgba(230,234,238,0.05)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
