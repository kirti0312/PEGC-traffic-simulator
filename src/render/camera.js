// Fixed oblique projection (rotate + squash) approximating the tilted reference view,
// with a pure top-down "2D" mode. All ground-plane drawing uses one affine transform.
export class Camera {
  constructor(full, cluster) {
    this.full = full; // whole network incl. entry/exit roads
    this.cluster = cluster; // the six junctions + margin
    this.fitMode = 'cluster';
    this.bounds = full;
    this.mode = '3d';
    this.preset = 'close';
    this.home = null; // world point the default view centres on (a junction)
    this.defaultZoom = 4.4;
    this.zoom = this.defaultZoom;
    this.targetZoom = this.zoom;
    this.fly = null; // animated move {t,dur,from,to}
    this.vx = 0; // pan inertia (px/s)
    this.vy = 0;
    this.anchor = null; // screen point the zoom animation keeps fixed
    this.panX = 0;
    this.panY = 0;
    this.w = 1;
    this.h = 1;
    this.insets = { left: 0, right: 0, top: 52, bottom: 76 };
    this.update();
  }

  // Change the free area (space not covered by panels) while keeping the same world point centred.
  setInsets(next) {
    const keep = this.w > 1 ? this.centre() : null;
    Object.assign(this.insets, next);
    this.update();
    if (keep) this.centerOn(keep[0], keep[1]);
  }

  setSize(w, h) {
    this.w = w;
    this.h = h;
    this.update();
  }

  setMode(mode) {
    this.mode = mode;
    this.reset();
  }

  update() {
    const is3d = this.mode === '3d';
    this.theta = is3d ? 0.07 : 0;
    this.tilt = is3d ? 0.6 : 1;
    this.zk = is3d ? 0.95 : 0.35; // vertical lift factor for tall objects
    const cs = Math.cos(this.theta);
    const sn = Math.sin(this.theta);
    const { minX, maxX, minY, maxY } = this.fitMode === 'full' ? this.full : this.cluster;
    const xs = [];
    const ys = [];
    for (const [x, y] of [
      [minX, minY],
      [maxX, minY],
      [minX, maxY],
      [maxX, maxY],
    ]) {
      xs.push(x * cs - y * sn);
      ys.push((x * sn + y * cs) * this.tilt);
    }
    const bw = Math.max(...xs) - Math.min(...xs);
    const bh = Math.max(...ys) - Math.min(...ys);
    const availW = Math.max(100, this.w - this.insets.left - this.insets.right);
    const availH = Math.max(100, this.h - this.insets.top - this.insets.bottom);
    this.fit = Math.min(availW / bw, availH / bh) * 1.08;
    this.S = this.fit * this.zoom;
    const cxr = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cyr = (Math.max(...ys) + Math.min(...ys)) / 2;
    const scx = this.insets.left + availW / 2 + this.panX;
    const scy = this.insets.top + availH / 2 + this.panY;
    this.a = this.S * cs;
    this.b = this.S * sn * this.tilt;
    this.c = -this.S * sn;
    this.d = this.S * cs * this.tilt;
    this.e = scx - this.S * cxr;
    this.f = scy - this.S * cyr;
  }

  project(x, y, z = 0, out) {
    const o = out || [0, 0];
    o[0] = this.a * x + this.c * y + this.e;
    o[1] = this.b * x + this.d * y + this.f - z * this.S * this.zk;
    return o;
  }

  depth(x, y) {
    return this.b * x + this.d * y;
  }

  // Inverse of project() on the ground plane (z = 0).
  unproject(sx, sy) {
    const det = this.a * this.d - this.c * this.b;
    const X = sx - this.e;
    const Y = sy - this.f;
    return [(X * this.d - this.c * Y) / det, (this.a * Y - this.b * X) / det];
  }

  // Zoom while keeping the world point under the cursor fixed.
  zoomAt(factor, sx, sy) {
    const [wx, wy] = this.unproject(sx, sy);
    this.zoom = Math.min(9, Math.max(1, this.zoom * factor));
    this.update();
    const p = this.project(wx, wy, 0);
    this.panX += sx - p[0];
    this.panY += sy - p[1];
    this.update();
  }

  // Smooth zoom: set a target; animate() eases toward it, keeping the screen point fixed.
  zoomTo(factor, sx, sy) {
    this.fly = null;
    this.targetZoom = Math.min(9, Math.max(1, this.targetZoom * factor));
    this.anchor = [sx, sy];
  }

  // Smooth glide to a world point and zoom (ease in-out). Any user input cancels it.
  flyTo(wx, wy, zoom, dur = 0.7, track = null) {
    const [cx, cy] = this.centre();
    const z = Math.min(9, Math.max(1, zoom || this.zoom));
    this.vx = 0;
    this.vy = 0;
    this.fly = { t: 0, dur, track, from: { x: cx, y: cy, z: this.zoom }, to: { x: wx, y: wy, z } };
    this.targetZoom = z;
  }

  animate(dt) {
    if (this.fly) {
      const f = this.fly;
      if (f.track) {
        const p = f.track(); // moving target (e.g. the ambulance)
        if (p) { f.to.x = p[0]; f.to.y = p[1]; }
      }
      f.t = Math.min(f.dur, f.t + dt);
      const u = f.t / f.dur;
      const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
      const z = f.from.z * Math.pow(f.to.z / f.from.z, e);
      this.centerOn(f.from.x + (f.to.x - f.from.x) * e, f.from.y + (f.to.y - f.from.y) * e, z);
      if (u >= 1) this.fly = null;
      return;
    }
    if (this.vx || this.vy) {
      this.panBy(this.vx * dt, this.vy * dt);
      const k = Math.exp(-dt * 4.5);
      this.vx *= k;
      this.vy *= k;
      if (Math.hypot(this.vx, this.vy) < 10) this.vx = this.vy = 0;
    }
    if (Math.abs(Math.log(this.targetZoom / this.zoom)) < 0.002) {
      if (this.zoom !== this.targetZoom) {
        const a = this.anchor || [this.w / 2, this.h / 2];
        this.zoomAt(this.targetZoom / this.zoom, a[0], a[1]);
        this.zoom = this.targetZoom;
        this.update();
      }
      return;
    }
    const k = 1 - Math.exp(-dt * 10);
    const next = this.zoom * Math.pow(this.targetZoom / this.zoom, k);
    const a = this.anchor || [this.w / 2, this.h / 2];
    this.zoomAt(next / this.zoom, a[0], a[1]);
  }

  // Keep the view centre inside the network (plus a margin) so the map can't be lost.
  clampPan() {
    const b = this.full;
    const m = 40;
    const [cx, cy] = this.centre();
    const nx = Math.min(b.maxX + m, Math.max(b.minX - m, cx));
    const ny = Math.min(b.maxY + m, Math.max(b.minY - m, cy));
    if (nx !== cx || ny !== cy) this.centerOn(nx, ny);
  }

  // Put world point (wx, wy) at the centre of the usable screen area, at the given zoom.
  centerOn(wx, wy, zoom) {
    if (zoom) {
      this.zoom = zoom;
      this.targetZoom = zoom;
    }
    this.panX = 0;
    this.panY = 0;
    this.update();
    const p = this.project(wx, wy, 0);
    const cx = this.insets.left + (this.w - this.insets.left - this.insets.right) / 2;
    const cy = this.insets.top + (this.h - this.insets.top - this.insets.bottom) / 2;
    this.panX = cx - p[0];
    this.panY = cy - p[1];
    this.update();
  }

  // World point currently at the centre of the usable area.
  centre() {
    const cx = this.insets.left + (this.w - this.insets.left - this.insets.right) / 2;
    const cy = this.insets.top + (this.h - this.insets.top - this.insets.bottom) / 2;
    return this.unproject(cx, cy);
  }

  panBy(dx, dy) {
    this.fly = null;
    this.panX += dx;
    this.panY += dy;
    this.update();
    this.clampPan();
  }

  // Show the whole network (zoom 1 = fits the bounds).
  fitAll() {
    this.fitMode = 'cluster';
    this.zoom = 1;
    this.targetZoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.update();
  }

  // Named default views: 'close' (one junction, like the reference), 'fit' (the six junctions
  // fill the free area), 'full' (whole network including entry/exit roads).
  setPreset(name) {
    this.preset = name;
    this.reset();
  }

  reset() {
    const is3d = this.mode === '3d';
    let z = 1;
    let at = null;
    if (this.preset === 'close') {
      z = is3d ? 4.4 : 2.2;
      at = this.home;
      this.fitMode = 'cluster';
    } else {
      this.fitMode = this.preset === 'full' ? 'full' : 'cluster'; // 'fit' and 'wide' frame the junctions
    }
    this.defaultZoom = z;
    this.zoom = z;
    this.targetZoom = z;
    this.panX = 0;
    this.panY = 0;
    this.update();
    if (at) this.centerOn(at[0], at[1], z);
  }
}

Camera.prototype.clusterCentre = function () {
  const b = this.cluster;
  return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
};
