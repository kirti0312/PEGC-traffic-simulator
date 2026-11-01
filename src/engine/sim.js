// Core traffic simulator. Pure JavaScript: no React, no DOM. Works in the main thread, a worker and Node.
import { CONFIG, entryRate } from './config.js';
import { buildNetwork, findRoute } from './network.js';
import { makeRng, deriveSeed } from './rng.js';
import { makeSignal, updateSignal, lightFor } from './signals.js';
import { makeSafetyCounter, checkSafety, applyRequest } from './safety.js';
import { makeVehicle, setPose } from './vehicles.js';
import { createStrategy, etaFree } from './strategies.js';

export class Simulation {
  constructor(scenario, strategyId, opts = {}) {
    this.cfg = { ...CONFIG, ...(opts.cfg || {}) };
    const cfg = this.cfg;
    this.scenario = { ...scenario, blocked: [...(scenario.blocked || [])] };
    this.strategyId = strategyId || scenario.strategy || 'A';
    this.net = buildNetwork(cfg);
    this.blocked = new Set(this.scenario.blocked);

    this.rngSpawn = makeRng(deriveSeed(this.scenario.seed, 1));
    this.rngVeh = makeRng(deriveSeed(this.scenario.seed, 2));
    this.nextId = 1;
    this.stepIndex = 0;
    this.t = 0;
    this.live = [];
    this.pending = {};
    for (const e of this.net.entryEdges) this.pending[e.id] = [];
    this.routeCache = new Map();

    this.signals = this.net.junctions.map((j) => makeSignal(j, cfg));
    this.safety = makeSafetyCounter();
    this.strategy = createStrategy(this.strategyId);

    // log
    this.logEntries = [];
    this.logTotal = 0;

    // ambulance
    this.ambient = !!opts.ambient; // ambient mode: ordinary traffic only, runs indefinitely
    this.ambRoute = this.ambient ? null : findRoute(this.net, this.scenario.origin, this.scenario.dest, this.blocked);
    this.ambLastJIdx = -1;
    if (this.ambRoute) this.ambRoute.forEach((e, i) => e.toJunction && (this.ambLastJIdx = i));
    this.amb = null;
    this.ambInjected = false;
    this.ambPasses = [];
    this.ambExitT = null;
    this.tLast = null;

    // stats
    this.entered = 0;
    this.completed = 0;
    this.waitSumDone = 0;
    this.doneCount = 0;
    this.maxStreak = 0;
    this.maxQueue = 0;
    this.totalQueued = 0;
    this.stats = { redCrossings: 0, yellowCrossings: 0, redCrossDetails: [] };
    this.series = [];
    this.baseSum = 0;
    this.baseN = 0;
    this.baseline = null;
    this.recovery = { time: null, windowStart: null, baseline: null };

    this.finished = false;
    this.status = this.ambient ? 'ambient' : this.ambRoute ? 'ready' : 'no-route';
    this._computeBox();
  }

  // ---------- public helpers ----------
  setDensity(d, rate) {
    this.scenario.density = d;
    if (rate !== undefined) this.scenario.rate = rate;
  }

  signalFor(junctionId) {
    return this.net.juncById[junctionId].sig;
  }

  logEvent(sig, kind, text, data) {
    const entry = { id: ++this.logTotal, t: this.t, junction: sig ? sig.id : null, kind, text, data: data || {} };
    this.logEntries.push(entry);
    if (this.logEntries.length > this.cfg.logCap) this.logEntries.shift();
    return entry;
  }

  requestSignal(sig, req) {
    const res = applyRequest(sig, req, this.t, this.cfg);
    for (const ev of res.events) this.logEvent(sig, ev.kind, ev.text, ev.data);
    return res;
  }

  // ---------- ambulance information (rule-based, no machine learning) ----------
  ambInfo() {
    const a = this.amb;
    if (!a || a.done || !a.inNet) return null;
    const cfg = this.cfg;
    const upcoming = [];
    let dEnd = a.edge.length - a.s;
    for (let k = a.ri; k < a.route.length; k++) {
      const e = a.route[k];
      if (k > a.ri) dEnd += e.length;
      if (!e.toJunction) continue;
      const dStop = dEnd - cfg.junctionHalf;
      if (dStop < -0.5) continue;
      let nQ = 0;
      for (const v of e.veh) {
        if (v === a) continue;
        if (k === a.ri && v.s <= a.s) continue;
        if (v.s <= e.stopLine + 0.5 && v.v < 1.0) nQ++;
      }
      upcoming.push({ junc: e.junc, axis: e.axis, edge: e, k, dStop, nQueue: nQ, eta: etaFree(a.v, Math.max(0, dStop), cfg) });
    }
    return { amb: a, upcoming };
  }

  // Rule-based ETA to the destination from distance, speed and queue ahead. Labelled as such in the UI.
  ambLiveEta() {
    const a = this.amb;
    if (!a || a.done || !a.inNet) return null;
    let d = a.edge.length - a.s;
    let q = 0;
    for (let k = a.ri; k < a.route.length; k++) {
      const e = a.route[k];
      if (k > a.ri) d += e.length;
      for (const v of e.veh) {
        if (v === a || (k === a.ri && v.s <= a.s)) continue;
        if (e.toJunction && v.s <= e.stopLine + 0.5 && v.v < 1.0) q++;
      }
    }
    return etaFree(a.v, d, this.cfg) + q * this.cfg.cDischargeHeadway;
  }

  // ---------- stepping ----------
  step() {
    if (this.finished) return;
    if (this.status === 'ready') this.status = 'running';
    if (this.ambient && this.series.length > 600) this.series.splice(0, 200);
    this.stepIndex++; // stamp for this step
    this._spawn();
    this._injectAmb();
    for (const sig of this.signals) updateSignal(sig, this.cfg);
    this.strategy.control(this);
    checkSafety(this);
    this._computeBox();
    this._moveVehicles();
    this._sample();
    this.t = this.stepIndex * this.cfg.dt;
    if (!this.ambient && this.t >= this.cfg.maxSimTime - 1e-9) {
      this.finished = true;
      this.status = 'finished';
    }
  }

  runToEnd() {
    while (!this.finished) this.step();
  }

  _route(from, to) {
    const key = `${from}>${to}`;
    if (!this.routeCache.has(key)) this.routeCache.set(key, findRoute(this.net, from, to, this.blocked));
    return this.routeCache.get(key);
  }

  _spawn() {
    const cfg = this.cfg;
    const p = (entryRate(this.scenario, cfg) / 3600) * cfg.dt;
    for (const e of this.net.entryEdges) {
      const draw = this.rngSpawn.next(); // always consumed, so streams never depend on the strategy
      if (!this.blocked.has(e.segId) && draw < p) this._makeOrdinary(e);
      this._tryInsert(e);
    }
  }

  _makeOrdinary(entryEdge) {
    const cfg = this.cfg;
    const r = this.rngVeh;
    const vmax = cfg.carMaxSpeed * (1 + r.range(-cfg.speedJitter, cfg.speedJitter));
    const color = r.int(6);
    const options = this.net.boundaryIds.filter((id) => id !== entryEdge.from);
    let route = null;
    for (let i = 0; i < 6 && !route; i++) {
      const dest = r.pick(options);
      route = this._route(entryEdge.from, dest);
    }
    if (!route) return;
    const v = makeVehicle(this.nextId++, 'car', route, cfg, { vmax, color });
    this.pending[entryEdge.id].push(v);
  }

  _injectAmb() {
    if (this.ambInjected || !this.ambRoute || this.t < this.cfg.warmup - 1e-9) return;
    this.ambInjected = true;
    const a = makeVehicle(this.nextId++, 'amb', this.ambRoute, this.cfg, { color: 0 });
    a.inNet = false;
    a.done = false;
    this.amb = a;
    this.pending[this.ambRoute[0].id].unshift(a);
  }

  _tryInsert(e) {
    const q = this.pending[e.id];
    if (!q.length) return;
    const v = q[0];
    const rear = e.veh.length ? e.veh[e.veh.length - 1] : null;
    const room = rear ? rear.s - rear.len : Infinity;
    if (room < v.len + this.cfg.minGap + 1.0) return;
    q.shift();
    v.edge = e;
    v.s = v.len;
    const base = v.vmax * 0.6;
    v.v = rear ? Math.min(base, Math.max(0, rear.v)) : base;
    v.stamp = this.stepIndex;
    v.tEnter = this.t;
    setPose(v, this.cfg);
    v.px = v.x;
    v.py = v.y;
    v.ph = v.h;
    e.veh.push(v);
    this.live.push(v);
    if (v.kind === 'amb') v.inNet = true;
    else this.entered++;
  }

  _computeBox() {
    const jh = this.cfg.junctionHalf;
    for (const j of this.net.junctions) {
      j.box.H = 0;
      j.box.V = 0;
    }
    for (const e of this.net.edges) {
      if (e.toJunction) {
        for (const v of e.veh) if (v.s > e.stopLine) e.junc.box[e.axis]++;
      }
      if (e.fromJunction) {
        const j = this.net.juncById[e.from];
        for (const v of e.veh) if (v.prevEdge && v.s - v.len < jh) j.box[v.prevEdge.axis]++;
      }
    }
  }

  _boxBlocked(e, v) {
    const cfg = this.cfg;
    const oth = e.axis === 'H' ? 'V' : 'H';
    if (e.junc.box[oth] > 0) return true;
    const nxt = v.route[v.ri + 1];
    if (!nxt || !nxt.veh.length) return false;
    const rear = nxt.veh[nxt.veh.length - 1];
    return cfg.junctionHalf + (rear.s - rear.len) < v.len + cfg.minGap;
  }

  _moveVehicles() {
    const cfg = this.cfg;
    const dt = cfg.dt;
    const b = cfg.decel;
    const tau = cfg.timeHeadway;
    const tn = this.t + dt;
    for (const e of this.net.edges) {
      const arr = e.veh;
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (v.stamp === this.stepIndex) continue;
        v.px = v.x;
        v.py = v.y;
        v.ph = v.h;
        let vsafe = Infinity;
        let hard = Infinity;
        const consider = (gap, vl, margin) => {
          const g = gap < 0 ? 0 : gap;
          const vs = -b * tau + Math.sqrt(b * b * tau * tau + vl * vl + 2 * b * g);
          if (vs < vsafe) vsafe = vs;
          const hl = v.s + gap + margin;
          if (hl < hard) hard = hl;
        };

        // leader on the same edge, otherwise the rear vehicle of the next edge (spillback)
        if (i > 0) {
          const l = arr[i - 1];
          consider(l.s - l.len - v.s - cfg.minGap, l.v, cfg.minGap - 0.3);
        } else {
          const nxt = v.route[v.ri + 1];
          if (nxt && nxt.veh.length) {
            const r = nxt.veh[nxt.veh.length - 1];
            consider(e.length - v.s + (r.s - r.len) - cfg.minGap, r.v, cfg.minGap - 0.3);
          }
        }

        // signal / box rules at the stop line
        let light = 'G';
        const oldS = v.s;
        if (e.toJunction && v.s <= e.stopLine) {
          light = lightFor(e.junc.sig, e.axis);
          if (!v.commit) {
            const dist = e.stopLine - v.s;
            let must = false;
            if (light === 'R') {
              must = true;
              if (dist < (v.v * v.v) / (2 * cfg.hardDecel)) {
                v.commit = true;
                must = false;
              }
            } else if (light === 'Y') {
              if (dist < (v.v * v.v) / (2 * cfg.decel)) v.commit = true;
              else must = true;
            } else if (this._boxBlocked(e, v)) {
              must = true;
              if (dist < (v.v * v.v) / (2 * cfg.hardDecel)) {
                v.commit = true;
                must = false;
              }
            }
            if (must) consider(dist - 0.5, 0, 0.5);
          }
        }

        let vt = Math.min(v.v + v.accel * dt, v.vmax, vsafe);
        if (vt < 0) vt = 0;
        let sNew = v.s + vt * dt;
        if (sNew > hard) sNew = hard;
        if (sNew < v.s) sNew = v.s;
        const vNew = (sNew - v.s) / dt;
        v.braking = vNew < v.v - 0.1 || vNew < 0.3;
        v.v = vNew;
        v.s = sNew;

        if (e.toJunction && oldS <= e.stopLine && sNew > e.stopLine) {
          if (light === 'R' && !v.commit) {
            this.stats.redCrossings++;
            if (this.stats.redCrossDetails.length < 20) this.stats.redCrossDetails.push({ t: tn, v: v.id, edge: e.id });
          } else if (light === 'Y') this.stats.yellowCrossings++;
        }

        // statistics
        if (v.v < 0.5) {
          v.waitTotal += dt;
          v.streak += dt;
          if (v.kind === 'car' && v.streak > this.maxStreak) this.maxStreak = v.streak;
        } else v.streak = 0;
        if (v.kind === 'amb') {
          if (v.v < 0.3 && !v.stopped) {
            v.stopped = true;
            v.stops++;
          } else if (v.v > 1.5) v.stopped = false;
        }

        // end of edge: transition or leave the network
        if (v.s >= e.length) {
          arr.splice(i, 1);
          i--;
          if (v.kind === 'amb' && e.toJunction) this._onAmbPass(e, tn);
          const nxt = v.route[v.ri + 1];
          if (nxt) {
            v.prevEdge = e;
            v.edge = nxt;
            v.ri++;
            v.s -= e.length;
            v.commit = false;
            v.stamp = this.stepIndex;
            nxt.veh.push(v);
          } else {
            this._finish(v, tn);
            continue;
          }
        }
        setPose(v, cfg);
      }
    }
  }

  _onAmbPass(e, tn) {
    const sig = e.junc.sig;
    sig.ambPassedAt = tn;
    sig.c.mode = 'passed';
    sig.c.recovering = true;
    sig.bActive = false;
    this.ambPasses.push({ junction: sig.id, t: tn });
    this.logEvent(sig, 'pass', `Ambulance cleared ${sig.id} at t = ${tn.toFixed(1)} s.`, { t: tn });
    if (e === this.ambRoute[this.ambLastJIdx]) this.tLast = tn;
  }

  _finish(v, tn) {
    const idx = this.live.indexOf(v);
    if (idx >= 0) this.live.splice(idx, 1);
    if (v.kind === 'amb') {
      v.done = true;
      v.inNet = false;
      this.ambExitT = tn;
      this.logEvent(null, 'arrive', `Ambulance reached ${v.destId} after ${(tn - v.tEnter).toFixed(1)} s (${v.stops} stop${v.stops === 1 ? '' : 's'}).`, { time: tn - v.tEnter });
    } else {
      this.completed++;
      this.waitSumDone += v.waitTotal;
      this.doneCount++;
    }
  }

  _sample() {
    const cfg = this.cfg;
    const tn = this.t + cfg.dt;
    let total = 0;
    for (const e of this.net.edges) {
      if (!e.toJunction) continue;
      let q = 0;
      let st = 0;
      for (const v of e.veh) {
        if (v.s <= e.stopLine + 0.5 && v.v < 1.0) {
          q++;
          if (v.streak > st) st = v.streak;
        }
      }
      e.queue = q;
      e.queueStreak = st;
      total += q;
      if (q > this.maxQueue) this.maxQueue = q;
    }
    this.totalQueued = total;
    if (this.stepIndex % 4 === 0) this.series.push([tn, total]);

    if (tn > cfg.warmup - cfg.baselineWindow + 1e-9 && tn <= cfg.warmup + 1e-9) {
      this.baseSum += total;
      this.baseN++;
    }
    if (this.baseline === null && tn >= cfg.warmup - 1e-9 && this.baseN > 0) {
      this.baseline = this.baseSum / this.baseN;
      this.recovery.baseline = this.baseline;
    }
    // recovery rule (identical for every strategy)
    if (this.tLast !== null && this.recovery.time === null && this.baseline !== null) {
      if (total <= this.baseline + cfg.recoveryTolerance) {
        if (this.recovery.windowStart === null) this.recovery.windowStart = tn;
        if (tn - this.recovery.windowStart >= cfg.recoverySustain - 1e-9) {
          this.recovery.time = Math.max(0, this.recovery.windowStart - this.tLast);
        }
      } else this.recovery.windowStart = null;
    }
  }

  // ---------- metrics (all derived from this run's events) ----------
  metrics() {
    const cfg = this.cfg;
    const a = this.amb;
    let waitSum = this.waitSumDone;
    let n = this.doneCount;
    for (const v of this.live) {
      if (v.kind === 'car') {
        waitSum += v.waitTotal;
        n++;
      }
    }
    const tNow = Math.max(this.t, 1e-9);
    let ambTime = null;
    let ambFinished = false;
    if (a && this.ambExitT !== null) {
      ambTime = this.ambExitT - a.tEnter;
      ambFinished = true;
    } else if (a && a.inNet) ambTime = this.t - a.tEnter;
    return {
      ambTravelTime: ambTime,
      ambFinished,
      ambStops: a ? a.stops : 0,
      avgWait: n ? waitSum / n : 0,
      longestWait: this.maxStreak,
      maxQueue: this.maxQueue,
      throughput: (this.completed * 3600) / tNow,
      completed: this.completed,
      entered: this.entered,
      recoveryTime: this.recovery.time,
      recoveryBaseline: this.baseline,
      violations: this.safety.violations,
      redCrossings: this.stats.redCrossings,
      totalQueued: this.totalQueued,
      time: this.t,
    };
  }

  snapshot() {
    const a = this.amb;
    const info = a && a.inNet ? this.ambInfo() : null;
    return {
      t: this.t,
      status: this.status,
      finished: this.finished,
      strategy: this.strategyId,
      scenario: this.scenario,
      metrics: this.metrics(),
      ambEta: this.ambLiveEta(),
      ambActive: !!(a && a.inNet),
      ambCleared: this.tLast !== null,
      ambDone: this.ambExitT !== null,
      ambNext: info && info.upcoming[0] ? { junction: info.upcoming[0].junc.id, dStop: info.upcoming[0].dStop, nQueue: info.upcoming[0].nQueue } : null,
      logTotal: this.logTotal,
      signals: this.signals.map((s) => ({ id: s.id, greenAxis: s.greenAxis, phase: s.phase, timer: s.timer })),
      vehicleCount: this.live.length,
      series: this.series.slice(-140),
      hasRoute: !!this.ambRoute,
    };
  }
}
