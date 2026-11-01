// Canvas renderer. Draws the static scene once to an offscreen canvas and only the dynamic
// items (vehicles, signals, effects) every frame. It never touches React state.
import { buildNetwork } from '../engine/network.js';
import { CONFIG } from '../engine/config.js';
import { lightFor } from '../engine/signals.js';
import { Camera } from './camera.js';
import { readTheme, rgba } from './theme.js';
import { makeSprites } from './sprites.js';
import { ROAD, buildProps, worldBounds, drawStaticWorld, drawGround, drawDecorWorld, drawBuildings } from './scene.js';

const TAU = Math.PI * 2;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.th = readTheme();
    this.refNet = buildNetwork(CONFIG);
    this.cfg = CONFIG;
    this.props = buildProps(this.refNet, CONFIG);
    const wb = worldBounds(this.refNet, CONFIG);
    this.cam = new Camera(wb.full, wb.cluster);
    const j01 = this.refNet.nodes.J01;
    this.cam.home = [j01.x, j01.y + 40];
    this.needHome = true;
    this.sprites = makeSprites(this.th);
    this.staticCanvas = makeCanvas(2, 2);
    this.staticDirty = true;
    this.dpr = 1;
    this.fade = new Map(); // signal lamp intensities per approach edge
    this.trail = [];
    this.trailT = 0;
    this.items = [];
    this._p = [0, 0];
    this._q = [0, 0];
    this.wheelMode = 'move';
    this.minimap = null;
    this.attachInput();
  }

  attachInput() {
    const c = this.canvas;
    let drag = null;
    c.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const r = c.getBoundingClientRect();
      const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? 400 : 1;
      const dx = ev.deltaX * unit;
      const dy = ev.deltaY * unit;
      // Pinch (ctrl+wheel) always zooms. Sideways scrolling, Shift+wheel, or "Move" mode pan the map.
      const sideways = Math.abs(dx) > Math.abs(dy);
      if (!ev.ctrlKey && (this.wheelMode === 'move' || ev.shiftKey || sideways)) {
        const px = ev.shiftKey && !sideways ? dy : dx;
        const py = ev.shiftKey && !sideways ? 0 : dy;
        if (this.onUserCamera) this.onUserCamera('pan');
        this.cam.panBy(-px * 0.9, -py * 0.9);
        return;
      }
      let d = Math.max(-60, Math.min(60, dy));
      if (ev.ctrlKey) d *= 2.5; // pinch gesture
      const f = Math.exp(-d * 0.0016);
      if (this.onUserCamera && this.onUserCamera('zoom', f) === 'handled') return;
      this.cam.zoomTo(f, ev.clientX - r.left, ev.clientY - r.top);
    }, { passive: false });
    c.addEventListener('contextmenu', (ev) => ev.preventDefault());
    let last = null; // for release velocity
    c.addEventListener('pointerdown', (ev) => {
      drag = { x: ev.clientX, y: ev.clientY };
      this.cam.vx = this.cam.vy = 0;
      this.cam.fly = null;
      last = { t: performance.now(), vx: 0, vy: 0 };
      c.setPointerCapture(ev.pointerId);
    });
    c.addEventListener('pointermove', (ev) => {
      if (!drag) return;
      if (this.onUserCamera) this.onUserCamera('pan');
      const dx = ev.clientX - drag.x;
      const dy = ev.clientY - drag.y;
      this.cam.panBy(dx, dy);
      const now = performance.now();
      const dts = Math.max(0.004, (now - last.t) / 1000);
      last = { t: now, vx: last.vx * 0.5 + (dx / dts) * 0.5, vy: last.vy * 0.5 + (dy / dts) * 0.5 };
      drag = { x: ev.clientX, y: ev.clientY };
      this.staticDirty = true;
    });
    const end = () => {
      // a flick keeps gliding and slows down (only if the pointer was moving at release)
      if (drag && last && performance.now() - last.t < 80 && Math.hypot(last.vx, last.vy) > 150) {
        this.cam.vx = Math.max(-2500, Math.min(2500, last.vx));
        this.cam.vy = Math.max(-2500, Math.min(2500, last.vy));
      }
      drag = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('dblclick', (ev) => {
      // Google-Maps style: double-click zooms in on the cursor
      const r = c.getBoundingClientRect();
      if (this.onUserCamera && this.onUserCamera('zoom', 2) === 'handled') return;
      this.cam.zoomTo(2, ev.clientX - r.left, ev.clientY - r.top);
    });
  }

  onScreen(x, y, m) {
    const p = this.cam.project(x, y, 0, this._c || (this._c = [0, 0]));
    return p[0] > -m && p[0] < this.cam.w + m && p[1] > -m - 40 && p[1] < this.cam.h + m + 40;
  }

  // Small overview map: roads, and the part of the city currently in view.
  drawMinimap() {
    const m = this.minimap;
    if (!m) return;
    const cv = m.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const b = this.cam.full;
    const pad = 8;
    const k = Math.min((W - pad * 2) / (b.maxX - b.minX), (H - pad * 2) / (b.maxY - b.minY));
    const ox = (W - (b.maxX - b.minX) * k) / 2;
    const oy = (H - (b.maxY - b.minY) * k) / 2;
    m.map = { k, ox, oy, minX: b.minX, minY: b.minY };
    const X = (x) => ox + (x - b.minX) * k;
    const Y = (y) => oy + (y - b.minY) * k;
    g.strokeStyle = 'rgba(150,165,178,0.55)';
    g.lineWidth = 2;
    g.beginPath();
    for (const sg of this.refNet.segments) {
      const a = this.refNet.nodes[sg.a];
      const z = this.refNet.nodes[sg.b];
      g.moveTo(X(a.x), Y(a.y));
      g.lineTo(X(z.x), Y(z.y));
    }
    g.stroke();
    g.fillStyle = 'rgba(230,234,238,0.8)';
    for (const j of this.refNet.junctions) g.fillRect(X(j.node.x) - 1.5, Y(j.node.y) - 1.5, 3, 3);
    const c = this.cam;
    const l = c.insets.left;
    const t = c.insets.top;
    const r = c.w - c.insets.right;
    const bt = c.h - c.insets.bottom;
    const pts = [c.unproject(l, t), c.unproject(r, t), c.unproject(r, bt), c.unproject(l, bt)];
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1]))));
    g.closePath();
    g.fillStyle = 'rgba(31,181,165,0.16)';
    g.fill();
    g.strokeStyle = 'rgba(31,181,165,0.95)';
    g.lineWidth = 1.5;
    g.stroke();
  }

  setInsets(insets) {
    this.cam.setInsets(insets);
    this.staticDirty = true;
  }

  setView(mode) {
    this.cam.setMode(mode);
    this.staticDirty = true;
  }

  resize() {
    const c = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(2, Math.floor(c.clientWidth));
    const h = Math.max(2, Math.floor(c.clientHeight));
    if (c.width !== Math.floor(w * dpr) || c.height !== Math.floor(h * dpr) || this.dpr !== dpr) {
      this.dpr = dpr;
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
      this.staticCanvas.width = c.width;
      this.staticCanvas.height = c.height;
      this.cam.setSize(w, h);
      if (this.needHome) {
        this.cam.reset();
        this.needHome = false;
      }
      this.staticDirty = true;
    }
  }

  setWorld(ctx, liftPx = 0) {
    const c = this.cam;
    const d = this.dpr;
    ctx.setTransform(c.a * d, c.b * d, c.c * d, c.d * d, c.e * d, (c.f - liftPx) * d);
  }

  // World-space rectangle currently visible (with a margin), used to skip off-screen drawing.
  viewRect() {
    const c = this.cam;
    const pts = [c.unproject(0, 0), c.unproject(c.w, 0), c.unproject(0, c.h), c.unproject(c.w, c.h)];
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const m = 90;
    return { minX: Math.min(...xs) - m, maxX: Math.max(...xs) + m, minY: Math.min(...ys) - m, maxY: Math.max(...ys) + m + 60 };
  }

  redrawStatic() {
    const sctx = this.staticCanvas.getContext('2d');
    drawGround(sctx, this.staticCanvas.width, this.staticCanvas.height, this.th);
    const view = this.viewRect();
    this.view = view;
    this.setWorld(sctx, 0);
    drawDecorWorld(sctx, this.cfg, this.th, view);
    drawStaticWorld(sctx, this.refNet, this.cfg, this.th);
    drawBuildings(sctx, this.cam, this.cfg, this.th, view, this.dpr);
    this.staticDirty = false;
  }

  // ------------------------------------------------------------------------------------------
  render(st) {
    const { sim, alpha, time, overlay, reduced, dt } = st;
    this.reduced = reduced;
    this.resize();
    const cam0 = this.cam;
    const sig = `${cam0.a.toFixed(3)}|${cam0.e.toFixed(1)}|${cam0.f.toFixed(1)}`;
    if (sig !== this.camSig) {
      this.camSig = sig;
      this.staticDirty = true;
    }
    if (this.staticDirty) this.redrawStatic();
    const ctx = this.ctx;
    const cam = this.cam;
    const th = this.th;
    const sp = this.sprites;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.staticCanvas, 0, 0);

    const is3d = cam.mode === '3d';

    // ---- ground-level layer -------------------------------------------------------------
    this.setWorld(ctx, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.32;
    for (const p of this.props) {
      if (p.type === 'light' && this.onScreen(p.x, p.y, 80)) ctx.drawImage(sp.glowWarm, p.x - 13, p.y - 13, 26, 26);
    }
    ctx.restore();
    // tree shadows
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    if (is3d) {
      for (const p of this.props) {
        if (p.type !== 'tree' || !this.onScreen(p.x, p.y, 60)) continue;
        ctx.beginPath();
        ctx.ellipse(p.x + 1.5, p.y + 1, 3.2 * p.sz, 2.4 * p.sz, 0, 0, TAU);
        ctx.fill();
      }
    }
    this.drawOverlay(ctx, st, overlay, time, reduced);

    // ---- vehicles: interpolate and collect ----------------------------------------------
    const items = this.items;
    items.length = 0;
    const live = sim.live;
    let amb = null;
    for (let i = 0; i < live.length; i++) {
      const v = live[i];
      v.rx = v.px + (v.x - v.px) * alpha;
      v.ry = v.py + (v.y - v.py) * alpha;
      v.rh = v.ph + wrapAngle(v.h - v.ph) * alpha;
      if (v.kind === 'amb') amb = v;
      if (v.kind !== 'amb' && !this.onScreen(v.rx, v.ry, 90)) continue;
      items.push({ k: cam.depth(v.rx, v.ry), t: 0, v });
    }
    for (const p of this.props) if (this.onScreen(p.x, p.y, 120)) items.push({ k: cam.depth(p.x, p.y), t: 1, p });
    for (const e of sim.net.edges) {
      if (!e.toJunction) continue;
      const px = e.a.x + e.ux * (e.stopLine + 1.4) + e.rx * (ROAD.half + 1.5);
      const py = e.a.y + e.uy * (e.stopLine + 1.4) + e.ry * (ROAD.half + 1.5);
      if (!this.onScreen(px, py, 100)) continue;
      items.push({ k: cam.depth(px, py), t: 2, e, px, py });
    }
    items.sort((a, b) => a.k - b.k);

    // queued vehicle underglow + ambulance road glow + trail (ground layer, additive)
    this.setWorld(ctx, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.34;
    for (let i = 0; i < live.length; i++) {
      const v = live[i];
      if (v.kind === 'car' && v.v < 1 && v.edge.toJunction && v.s <= v.edge.stopLine + 0.5 && this.onScreen(v.rx, v.ry, 60)) {
        ctx.drawImage(sp.glowAmber, v.rx - 3.6, v.ry - 3.6, 7.2, 7.2);
      }
    }
    ctx.restore();
    if (amb) this.drawAmbGlowAndTrail(ctx, amb, time, reduced);

    // ---- depth-sorted dynamic items -----------------------------------------------------
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.t === 0) this.drawVehicle(ctx, it.v, time, is3d, sim);
      else if (it.t === 1) this.drawProp(ctx, it.p, time, is3d, reduced);
      else this.drawSignalHead(ctx, it, sim, time, dt, reduced);
    }

    // ---- labels --------------------------------------------------------------------------
    this.drawJunctionLabels(ctx, sim);
    ctx.globalAlpha = 1;
    this.drawMinimap();
  }

  // --- overlay: blocked roads, routes, endpoints -------------------------------------------
  drawOverlay(ctx, st, overlay, time, reduced) {
    const th = this.th;
    const net = this.refNet;
    if (!overlay) return;
    for (const id of overlay.blocked || []) {
      const s = net.segById[id];
      if (!s) continue;
      const a = net.nodes[s.a];
      const b = net.nodes[s.b];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      ctx.save();
      ctx.transform(ux, uy, -uy, ux, a.x, a.y);
      ctx.fillStyle = rgba(th.blocked, 0.14 + (reduced ? 0 : 0.04 * Math.sin(time * 3)));
      ctx.fillRect(0, -ROAD.half, len, ROAD.half * 2);
      // hazard barriers across the road at both ends
      for (const p of [a.type === 'junction' ? ROAD.junc + 6 : 14, len - (b.type === 'junction' ? ROAD.junc + 6 : 14)]) {
        for (let k = 0; k < 7; k++) {
          ctx.fillStyle = k % 2 ? 'rgba(20,24,28,0.95)' : th.blocked;
          ctx.fillRect(p - 0.8, -ROAD.half + k * ((ROAD.half * 2) / 7), 1.6, (ROAD.half * 2) / 7);
        }
      }
      ctx.restore();
    }
    const nodePos = (id) => net.nodes[id];
    for (const r of overlay.routes || []) {
      if (!r.nodes || r.nodes.length < 2) continue;
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      r.nodes.forEach((id, i) => {
        const n = nodePos(id);
        if (i === 0) ctx.moveTo(n.x, n.y);
        else ctx.lineTo(n.x, n.y);
      });
      if (r.style === 'old') {
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = 'rgba(190,200,210,0.45)';
        ctx.lineWidth = 1.1;
        ctx.stroke();
      } else {
        ctx.strokeStyle = rgba(th.teal, 0.12);
        ctx.lineWidth = 6.5;
        ctx.stroke();
        ctx.strokeStyle = rgba(th.teal, 0.3);
        ctx.lineWidth = 2.6;
        ctx.stroke();
        ctx.setLineDash([5, 4]);
        ctx.lineDashOffset = reduced ? 0 : -time * 16;
        ctx.strokeStyle = rgba(th.teal, 0.98);
        ctx.lineWidth = 1.05;
        ctx.stroke();
      }
      ctx.restore();
    }
    for (const [id, col] of [
      [overlay.origin, th['sig-green']],
      [overlay.dest, th['amb-red']],
    ]) {
      if (!id || !net.nodes[id]) continue;
      const n = net.nodes[id];
      const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(time * 3);
      ctx.strokeStyle = rgba(col, 0.55 + 0.35 * pulse);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.arc(n.x, n.y, 5 + pulse * 3, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = rgba(col, 0.2);
      ctx.beginPath();
      ctx.arc(n.x, n.y, 4.2, 0, TAU);
      ctx.fill();
    }
  }

  drawAmbGlowAndTrail(ctx, amb, time, reduced) {
    const sp = this.sprites;
    const blue = reduced ? 0.6 : 0.5 + 0.5 * Math.sin(time * 11);
    const red = reduced ? 0.6 : 0.5 + 0.5 * Math.sin(time * 11 + Math.PI);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55 * blue;
    ctx.drawImage(sp.glowBlue, amb.rx - 15, amb.ry - 15, 30, 30);
    ctx.globalAlpha = 0.5 * red;
    ctx.drawImage(sp.glowRed, amb.rx - 13, amb.ry - 13, 26, 26);
    ctx.restore();
    if (reduced) {
      this.trail.length = 0;
      return;
    }
    if (time - this.trailT > 0.03) {
      this.trail.push([amb.rx, amb.ry, time]);
      this.trailT = time;
    }
    while (this.trail.length && time - this.trail[0][2] > 1.1) this.trail.shift();
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.5;
    for (let i = 1; i < this.trail.length; i++) {
      const a = 1 - (time - this.trail[i][2]) / 1.1;
      ctx.strokeStyle = `rgba(140,180,255,${(a * 0.55).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(this.trail[i - 1][0], this.trail[i - 1][1]);
      ctx.lineTo(this.trail[i][0], this.trail[i][1]);
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- vehicles ------------------------------------------------------------------------------
  drawVehicle(ctx, v, time, is3d) {
    const cam = this.cam;
    const sp = this.sprites;
    const amb = v.kind === 'amb';
    const len = v.len;
    const wid = amb ? 2.7 : 2.4;
    const lift = (m) => m * cam.S * cam.zk;
    let fade = 1;
    const e = v.edge;
    if (e.isEntry) fade = Math.min(fade, Math.max(0, (v.s - v.len) / 22));
    if (e.isExit) fade = Math.min(fade, Math.max(0, (e.length - v.s) / 22 + 0.15));
    if (fade <= 0.02) return;
    const place = (liftM) => {
      this.setWorld(ctx, lift(liftM));
      ctx.translate(v.rx, v.ry);
      ctx.rotate(v.rh);
    };
    ctx.globalAlpha = fade * 0.9;
    place(0);
    const shadow = amb ? sp.ambShadow : sp.carShadow;
    ctx.drawImage(shadow, -(len + 0.6) / 2, -(wid + 0.5) / 2, len + 0.6, wid + 0.5);
    ctx.globalAlpha = fade;
    const side = amb ? sp.ambSide : sp.sides[v.color % sp.sides.length];
    const top = amb ? sp.amb : sp.cars[v.color % sp.cars.length];
    const h = amb ? 2.0 : 1.3;
    if (is3d) {
      for (const f of [0.3, 0.65]) {
        place(h * f);
        ctx.drawImage(side, -len / 2, -wid / 2, len, wid);
      }
      place(h);
    } else place(0);
    ctx.drawImage(top, -len / 2, -wid / 2, len, wid);

    // lights
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    place(is3d ? h * 0.5 : 0);
    ctx.globalAlpha = fade * 0.4;
    ctx.drawImage(sp.beam, len / 2 - 0.3, -3.5, 15, 7);
    if (v.braking) {
      ctx.globalAlpha = fade * 0.9;
      ctx.drawImage(sp.glowRed, -len / 2 - 1.8, -1.9, 3.8, 3.8);
    }
    if (amb) {
      const reduced = this.reduced;
      const b = reduced ? 0.8 : 0.5 + 0.5 * Math.sin(time * 11);
      const r = reduced ? 0.8 : 0.5 + 0.5 * Math.sin(time * 11 + Math.PI);
      place(is3d ? h + 0.35 : 0);
      ctx.globalAlpha = fade * (0.35 + 0.65 * b);
      ctx.drawImage(sp.glowBlue, -1.6, -2.6, 3.2, 3.2);
      ctx.globalAlpha = fade * (0.35 + 0.65 * r);
      ctx.drawImage(sp.glowRed, -1.6, -0.6, 3.2, 3.2);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawProp(ctx, p, time, is3d, reduced) {
    const cam = this.cam;
    const sp = this.sprites;
    const dpr = this.dpr;
    if (p.type === 'tree') {
      if (!is3d) {
        this.setWorld(ctx, 0);
        const r = 3.4 * p.sz;
        ctx.drawImage(sp.treeTop, p.x - r, p.y - r, r * 2, r * 2);
        return;
      }
      const o = cam.project(p.x, p.y, 0, this._p);
      const hpx = 11 * p.sz * cam.S * 0.85;
      const wpx = hpx * (sp.treeW / sp.treeH) * 1.05;
      const sway = reduced ? 0 : Math.sin(time * 1.3 + p.ph) * 0.045;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.translate(o[0], o[1]);
      ctx.transform(1, 0, sway, 1, 0, 0);
      ctx.drawImage(sp.trees[p.v], -wpx / 2, -hpx, wpx, hpx);
      return;
    }
    if (p.type === 'light') {
      const a = cam.project(p.x, p.y, 0, this._p);
      const ax = a[0];
      const ay = a[1];
      const b = cam.project(p.x, p.y, 7.2, this._q);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = 'rgba(120,134,146,0.9)';
      ctx.lineWidth = Math.max(1, cam.S * 0.22);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,226,170,0.95)';
      ctx.fillRect(b[0] - cam.S * 0.5, b[1] - 1, cam.S * 1.0, 2);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      const g = cam.S * 4;
      ctx.drawImage(sp.glowWarm, b[0] - g / 2, b[1] - g / 2, g, g);
      ctx.restore();
      return;
    }
    if (p.type === 'shelter') {
      const lift = (m) => m * cam.S * cam.zk;
      this.setWorld(ctx, 0);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.ang);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(-3, -1, 6, 2);
      if (is3d) {
        this.setWorld(ctx, lift(1.3));
        ctx.translate(p.x, p.y);
        ctx.rotate(p.ang);
        ctx.fillStyle = 'rgba(110,170,185,0.28)';
        ctx.fillRect(-3, p.side > 0 ? 0.6 : -1, 6, 0.4);
        this.setWorld(ctx, lift(2.6));
        ctx.translate(p.x, p.y);
        ctx.rotate(p.ang);
      }
      ctx.fillStyle = '#4b5760';
      ctx.fillRect(-3.2, -1.2, 6.4, 2.4);
      ctx.fillStyle = 'rgba(120,200,210,0.35)';
      ctx.fillRect(-2.6, -0.6, 5.2, 1.2);
    }
  }

  // --- signals --------------------------------------------------------------------------------
  drawSignalHead(ctx, it, sim, time, dt, reduced) {
    const { e, px, py } = it;
    const cam = this.cam;
    const th = this.th;
    const sp = this.sprites;
    const sig = e.junc && sim.net.juncById[e.to].sig;
    if (!sig) return;
    const light = lightFor(sig, e.axis);
    let f = this.fade.get(e.id);
    if (!f) {
      f = { r: 0, y: 0, g: 0 };
      this.fade.set(e.id, f);
    }
    const k = Math.min(1, (dt || 0.016) * 9);
    f.r += ((light === 'R' ? 1 : 0) - f.r) * k;
    f.y += ((light === 'Y' ? 1 : 0) - f.y) * k;
    f.g += ((light === 'G' ? 1 : 0) - f.g) * k;
    const pulse = reduced ? 1 : 0.92 + 0.08 * Math.sin(time * 3 + e.index);
    const a = cam.project(px, py, 0, this._p);
    const ax = a[0];
    const ay = a[1];
    const top = cam.project(px, py, 5.4, this._q);
    const u = Math.max(1.5, cam.S * 0.5);
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = 'rgba(110,122,134,0.95)';
    ctx.lineWidth = Math.max(1, u * 0.34);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(top[0], top[1]);
    ctx.stroke();
    const hw = u * 1.7;
    const hh = u * 4.6;
    const hx = top[0] - hw / 2;
    const hy = top[1] - hh;
    ctx.fillStyle = 'rgba(14,18,22,0.96)';
    ctx.fillRect(hx, hy, hw, hh);
    const lamps = [
      [th['sig-red'], f.r, sp.glowRed],
      [th['sig-amber'], f.y, sp.glowAmber],
      [th['sig-green'], f.g, sp.glowGreen],
    ];
    lamps.forEach(([col, inten, glow], i) => {
      const cy = hy + hh * (0.18 + i * 0.32);
      const cx = top[0];
      ctx.fillStyle = rgba(col, 0.16 + 0.84 * inten * pulse);
      ctx.beginPath();
      ctx.arc(cx, cy, u * 0.52, 0, TAU);
      ctx.fill();
      if (inten > 0.05) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(0.85, inten * 0.8 * pulse);
        const g = u * 5;
        ctx.drawImage(glow, cx - g / 2, cy - g / 2, g, g);
        ctx.restore();
      }
    });
  }

  drawJunctionLabels(ctx, sim) {
    const cam = this.cam;
    if (cam.S < 0.8) return;
    const dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '600 9.5px Inter, system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const th = this.th;
    for (const sig of sim.signals) {
      const j = sig.junc.node;
      const p = cam.project(j.x, j.y, 0, this._p);
      const axis = sig.greenAxis === 'H' ? 'EW' : 'NS';
      let col = th['sig-green'];
      let txt;
      if (sig.phase === 'G') txt = `${sig.id} ${axis} ${Math.floor(sig.timer)}s`;
      else if (sig.phase === 'Y') {
        col = th['sig-amber'];
        txt = `${sig.id} ${axis} Y ${Math.max(0, Math.ceil(sim.cfg.yellow - sig.timer))}`;
      } else {
        col = th['sig-red'];
        txt = `${sig.id} all-red ${Math.max(0, Math.ceil(sim.cfg.allRed - sig.timer))}`;
      }
      const w = ctx.measureText(txt).width + 14;
      const x = p[0];
      const y = p[1] + 20 + cam.S * 2;
      ctx.fillStyle = 'rgba(12,16,19,0.72)';
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - 8, w, 16, 8);
      ctx.fill();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x - w / 2 + 7, y, 2.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(225,232,238,0.92)';
      ctx.fillText(txt, x + 3, y + 0.5);
    }
  }
}
