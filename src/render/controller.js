// Plain-JavaScript controller. Owns the simulation, the requestAnimationFrame loop and the
// renderer. React only reads throttled snapshots from it (about 5 per second); it never
// receives per-frame updates.
import { Simulation } from '../engine/sim.js';
import { CONFIG, defaultScenario } from '../engine/config.js';
import { routeNodeIds } from '../engine/network.js';
import { previewRoute } from '../engine/runner.js';
import { Renderer } from './renderer.js';

const SNAP_INTERVAL = 200; // ms (5 Hz)
const MAX_STEPS_PER_FRAME = 48;

export class SimController {
  constructor() {
    this.sim = null;
    this.mode = 'ambient'; // 'ambient' | 'run'
    this.playing = true;
    this.speed = 4;
    this.acc = 0;
    this.alpha = 1;
    this.view = '3d';
    this.scenario = defaultScenario();
    this.densityChanged = false;
    this.overlayExtra = { routes: [], blocked: null, origin: null, dest: null, mode: 'auto' };
    this.listeners = new Set();
    this.snapshot = null;
    this.lastEmit = 0;
    this.dirty = true;
    this.renderer = null;
    this.raf = 0;
    this.lastT = 0;
    this.time = 0;
    this.frames = 0;
    this.fpsT = 0;
    this.fps = 0;
    this.stepsLastSec = 0;
    this.reduced = false;
    this.insetsMode = 'default';
    this.follow = false;
    this.wheelMode = 'move';
    this.followZoom = 5.4;
    this.startAmbient('medium', 11);
    this.snapshot = this.buildSnapshot();
    this.subscribe = this.subscribe.bind(this);
    this.getSnapshot = this.getSnapshot.bind(this);
  }

  // ---------- lifecycle ----------
  attach(canvas) {
    this.renderer = new Renderer(canvas);
    this.renderer.setView(this.view);
    this.renderer.wheelMode = this.wheelMode;
    // dragging or wheel-zooming by hand leaves follow mode; zoom keeps working
    this.renderer.onUserCamera = (kind, f) => {
      if (kind === 'zoom') {
        if (this.follow) {
          this.followZoom = Math.min(9, Math.max(1, this.followZoom * f));
          return 'handled';
        }
        return null;
      }
      if (this.follow) this.setFollow(false); // dragging the map leaves follow mode
      return null;
    };
    this.lastT = performance.now();
    const mq = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.reduced = !!(mq && mq.matches);
    if (mq) mq.addEventListener?.('change', (e) => (this.reduced = e.matches));
    const loop = (now) => {
      this.raf = requestAnimationFrame(loop);
      this.frame(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  detach() {
    cancelAnimationFrame(this.raf);
    this.renderer = null;
  }

  // ---------- simulation setup ----------
  startAmbient(density = 'medium', seed = 11) {
    this.mode = 'ambient';
    this.sim = new Simulation({ ...defaultScenario(), density, seed }, 'A', { ambient: true });
    this.playing = true;
    this.acc = 0;
    this.alpha = 1;
    this.densityChanged = false;
    this.dirty = true;
    // warm the network so the city already looks busy
    for (let i = 0; i < 160; i++) this.sim.step();
    this.emit(true);
  }

  loadRun(scenario, { autoplay = true } = {}) {
    this.mode = 'run';
    this.scenario = { ...scenario, blocked: [...(scenario.blocked || [])] };
    this.sim = new Simulation(this.scenario, this.scenario.strategy);
    this.playing = autoplay;
    this.acc = 0;
    this.alpha = 1;
    this.densityChanged = false;
    this.dirty = true;
    this.emit(true);
  }

  restart() {
    if (this.mode === 'run') this.loadRun(this.scenario, { autoplay: true });
    else this.startAmbient(this.sim.scenario.density, this.sim.scenario.seed);
  }

  // ---------- controls ----------
  play() {
    if (this.sim && this.sim.finished) return;
    this.playing = true;
    this.dirty = true;
    this.emit(true);
  }
  pause() {
    this.playing = false;
    this.dirty = true;
    this.emit(true);
  }
  toggle() {
    this.playing ? this.pause() : this.play();
  }
  setSpeed(s) {
    this.speed = s;
    this.dirty = true;
    this.emit(true);
  }
  setDensity(d, rate) {
    if (!this.sim) return;
    this.sim.setDensity(d, rate);
    if (this.mode === 'run') {
      this.scenario = { ...this.scenario, density: d, ...(rate !== undefined ? { rate } : {}) };
      this.densityChanged = true;
    }
    this.dirty = true;
    this.emit(true);
  }
  setView(v) {
    this.view = v;
    if (this.renderer) this.renderer.setView(v);
    this.dirty = true;
    this.emit(true);
  }
  // ---------- camera controls ----------
  zoomBy(f) {
    const r = this.renderer;
    if (!r) return;
    if (this.follow) {
      this.followZoom = Math.min(9, Math.max(1, this.followZoom * f));
      return;
    }
    const c = r.cam;
    c.zoomTo(f, c.insets.left + (c.w - c.insets.left - c.insets.right) / 2, c.insets.top + (c.h - c.insets.top - c.insets.bottom) / 2);
  }
  setWheelMode(mode) {
    this.wheelMode = mode;
    if (this.renderer) this.renderer.wheelMode = mode;
    this.dirty = true;
    this.emit(true);
  }
  attachMinimap(canvas) {
    if (this.renderer) this.renderer.minimap = canvas ? { canvas, map: null } : null;
  }
  // Move the view so world point (x, y) is centred (used by the minimap).
  panToWorld(x, y) {
    if (!this.renderer) return;
    if (this.follow) this.setFollow(false);
    this.renderer.cam.centerOn(x, y);
    this.renderer.cam.clampPan();
  }
  minimapToWorld(px, py) {
    const m = this.renderer && this.renderer.minimap && this.renderer.minimap.map;
    if (!m) return null;
    return [(px - m.ox) / m.k + m.minX, (py - m.oy) / m.k + m.minY];
  }
  panBy(dx, dy) {
    if (!this.renderer) return;
    if (this.follow) this.setFollow(false);
    this.renderer.cam.panBy(dx, dy);
  }
  zoomIn() { this.zoomBy(1.4); }
  zoomOut() { this.zoomBy(1 / 1.4); }
  setPreset(name) {
    if (this.follow) this.setFollow(false);
    if (this.renderer) this.renderer.cam.setPreset(name);
  }
  // Smooth glide back to the six-junction overview.
  fitAll() {
    this.setFollow(false);
    const cam = this.renderer && this.renderer.cam;
    if (!cam) return;
    cam.fitMode = 'cluster';
    cam.update();
    const [x, y] = cam.clusterCentre();
    cam.flyTo(x, y, 1, 0.8);
  }
  resetView() {
    this.fitAll();
  }
  // One-shot smooth move to the ambulance (stays put afterwards; use Follow for continuous tracking).
  centerAmbulance() {
    const a = this.sim && this.sim.amb;
    const cam = this.renderer && this.renderer.cam;
    if (!a || !cam || !a.inNet || a.done) return false;
    this.setFollow(false);
    const sim = this.sim;
    cam.flyTo(a.x, a.y, Math.max(cam.zoom, 4.5), 0.8, () => (sim.amb && sim.amb.inNet ? [sim.amb.x, sim.amb.y] : null));
    return true;
  }
  setFollow(on) {
    this.follow = !!on;
    if (!on) this.followLock = false;
    this.dirty = true;
    this.emit(true);
  }

  setInsets(i) {
    if (this.renderer) this.renderer.setInsets(i);
  }

  // Overlay (routes, blocked roads, endpoints) used by Configure and Stress screens.
  setOverlay(extra) {
    this.overlayExtra = { routes: [], blocked: null, origin: null, dest: null, mode: 'manual', ...extra };
  }
  clearOverlay() {
    this.overlayExtra = { routes: [], blocked: null, origin: null, dest: null, mode: 'auto' };
  }

  currentOverlay() {
    const x = this.overlayExtra;
    if (x.mode === 'manual') return x;
    if (this.mode === 'run' && this.sim && this.sim.ambRoute) {
      return {
        routes: [{ nodes: routeNodeIds(this.sim.ambRoute), style: 'main' }],
        blocked: this.sim.scenario.blocked,
        origin: this.sim.scenario.origin,
        dest: this.sim.scenario.dest,
      };
    }
    if (this.mode === 'run' && this.sim) return { routes: [], blocked: this.sim.scenario.blocked, origin: this.sim.scenario.origin, dest: this.sim.scenario.dest };
    return { routes: [], blocked: [], origin: null, dest: null };
  }

  // ---------- subscription (throttled snapshots for React) ----------
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  getSnapshot() {
    return this.snapshot;
  }
  getLog() {
    return this.sim ? this.sim.logEntries : [];
  }
  buildSnapshot() {
    const s = this.sim.snapshot();
    return {
      ...s,
      mode: this.mode,
      playing: this.playing,
      speed: this.speed,
      view: this.view,
      densityChanged: this.densityChanged,
      fps: this.fps,
      follow: this.follow,
      wheelMode: this.wheelMode,
      ambient: this.sim.ambient,
    };
  }
  emit(force) {
    this.snapshot = this.buildSnapshot();
    this.lastEmit = performance.now();
    this.dirty = false;
    for (const l of this.listeners) l();
    void force;
  }

  // Smoothly centre the camera on the ambulance (interpolated position); when it is not on
  // the network, follow nothing and keep the current view.
  updateFollow(dtReal) {
    const a = this.sim.amb;
    if (!a || !a.inNet || a.done) return;
    const cam = this.renderer.cam;
    const wx = a.px + (a.x - a.px) * this.alpha;
    const wy = a.py + (a.y - a.py) * this.alpha;
    const k = this.followLock ? Math.min(1, dtReal * 6) : Math.min(1, dtReal * 2.5);
    const [cx, cy] = cam.centre();
    const nz = cam.zoom + (this.followZoom - cam.zoom) * k;
    const tx = cx + (wx - cx) * k;
    const ty = cy + (wy - cy) * k;
    cam.centerOn(tx, ty, nz);
    if (Math.hypot(wx - tx, wy - ty) < 6) this.followLock = true;
  }

  // ---------- frame loop ----------
  frame(now) {
    const dtReal = Math.min(0.1, Math.max(0.0005, (now - this.lastT) / 1000));
    this.lastT = now;
    this.time += dtReal;
    const sim = this.sim;
    const dt = CONFIG.dt;
    let steps = 0;
    const running = this.playing && !sim.finished;
    if (running) {
      this.acc += dtReal * this.speed;
      while (this.acc >= dt && steps < MAX_STEPS_PER_FRAME && !sim.finished) {
        sim.step();
        this.acc -= dt;
        steps++;
      }
      if (steps >= MAX_STEPS_PER_FRAME) this.acc = Math.min(this.acc, dt);
      this.alpha = Math.min(1, this.acc / dt);
      if (sim.finished) {
        this.playing = false;
        this.alpha = 1;
        this.dirty = true;
      }
    }
    if (this.renderer && this.follow) this.updateFollow(dtReal);
    else if (this.renderer) this.renderer.cam.animate(dtReal);
    if (this.renderer) {
      this.renderer.render({ sim, alpha: this.alpha, time: this.time, overlay: this.currentOverlay(), reduced: this.reduced, dt: dtReal });
    }
    // fps bookkeeping
    this.frames++;
    this.stepsLastSec += steps;
    if (now - this.fpsT >= 1000) {
      this.fps = Math.round((this.frames * 1000) / (now - this.fpsT));
      this.frames = 0;
      this.fpsT = now;
      this.stepsPerSec = this.stepsLastSec;
      this.stepsLastSec = 0;
    }
    if ((running || this.dirty) && now - this.lastEmit >= SNAP_INTERVAL) this.emit();
  }
}

export function routePreview(scenario) {
  return previewRoute(scenario);
}
