// Signal strategies. All share one interface: control(sim) is called once per step and may only
// REQUEST signal changes through sim.requestSignal(), which passes them through the safety layer.
import { other } from './signals.js';
import { axisQueue } from './safety.js';

// Normal fixed-time plan used by A, and by B/C whenever they are not acting on the ambulance.
export function fixedReq(sig, cfg) {
  const want = sig.timer >= cfg.fixedGreen ? other(sig.greenAxis) : sig.greenAxis;
  return { desired: want, emergency: false, baselineDesired: want };
}

// Rule-based (kinematic) free-flow arrival time for the ambulance over distance D. Not machine learning.
export function etaFree(v, D, cfg) {
  if (D <= 0) return 0;
  const a = cfg.ambAccel;
  const vm = Math.min(cfg.ambMaxSpeed, cfg.cEtaCruise);
  const v0 = Math.min(v, vm);
  const da = (vm * vm - v0 * v0) / (2 * a);
  if (D <= da) return (-v0 + Math.sqrt(v0 * v0 + 2 * a * D)) / a;
  return (vm - v0) / a + (D - da) / vm;
}

function pressure(sig, axis) {
  let p = 0;
  for (const e of sig.junc.approach[axis]) p += e.queue + 0.1 * e.queueStreak;
  return p;
}

function crossStats(sig, axis) {
  let cars = 0;
  let longest = 0;
  for (const e of sig.junc.approach[axis]) {
    cars += e.queue;
    for (const v of e.veh) {
      if (v.s <= e.stopLine && v.s > e.stopLine - 50 && v.v >= 1.0) cars++;
      if (v.streak > longest && v.s <= e.stopLine) longest = v.streak;
    }
  }
  return { cars, longest };
}

function outOccupancy(sim, sig, axis) {
  let occ = 0;
  for (const e of sig.junc.out) {
    if (e.axis !== axis) continue;
    let used = 0;
    for (const v of e.veh) used += v.len + sim.cfg.minGap;
    occ = Math.max(occ, used / e.length);
  }
  return occ;
}

// Time until the ambulance's axis (A) can be green, under the normal plan and if PEGC acts.
function timing(sig, A, cfg) {
  const Y = cfg.yellow;
  const R = cfg.allRed;
  const fg = cfg.fixedGreen;
  const mg = Math.max(cfg.minGreen, cfg.lockout);
  if (sig.greenAxis === A) {
    if (sig.phase === 'G') return { greenNow: true, tGreenBase: 0, tGreenAct: 0, tEndBase: Math.max(0, fg - sig.timer), minRem: 0 };
    if (sig.phase === 'Y') {
      const rem = Y - sig.timer;
      return { greenNow: false, tGreenBase: rem + R + fg + Y + R, tGreenAct: rem + R + mg + Y + R, fixedSeq: true };
    }
    const rem = R - sig.timer;
    return { greenNow: false, tGreenBase: rem + fg + Y + R, tGreenAct: rem + mg + Y + R, fixedSeq: true };
  }
  if (sig.phase === 'G') {
    const minRem = Math.max(0, mg - sig.timer);
    return { greenNow: false, tGreenBase: Math.max(0, fg - sig.timer) + Y + R, tGreenAct: minRem + Y + R, minRem };
  }
  const r = sig.phase === 'Y' ? Y - sig.timer + R : R - sig.timer;
  return { greenNow: false, tGreenBase: r, tGreenAct: r, fixedSeq: true };
}

const fmt = (x, d = 1) => Number(x).toFixed(d);

function strategyA() {
  return {
    id: 'A',
    control(sim) {
      for (const sig of sim.signals) sim.requestSignal(sig, fixedReq(sig, sim.cfg));
    },
  };
}

function strategyB() {
  return {
    id: 'B',
    control(sim) {
      const cfg = sim.cfg;
      const info = sim.ambInfo();
      const first = info && info.upcoming[0];
      for (const sig of sim.signals) {
        const base = fixedReq(sig, cfg);
        if (first && first.junc.sig === sig && first.dStop <= cfg.bTriggerDistance) {
          if (!sig.bActive) {
            sig.bActive = true;
            sim.logEvent(sig, 'request', `${sig.id}: ambulance ${fmt(first.dStop, 0)} m from the stop line, ETA ${fmt(first.eta)} s, queue ahead ${first.nQueue} \u2192 requesting ${first.axis}-axis green now (ignores cross traffic).`, {
              dStop: first.dStop,
              eta: first.eta,
              nQueue: first.nQueue,
            });
          }
          sim.requestSignal(sig, { desired: first.axis, emergency: true, baselineDesired: base.desired });
        } else {
          if (sig.bActive) {
            sig.bActive = false;
            sim.logEvent(sig, 'release', `${sig.id}: ambulance request released; back to the fixed plan.`, {});
          }
          sim.requestSignal(sig, base);
        }
      }
    },
  };
}

function evaluate(sim, u, extra, opts) {
  const cfg = sim.cfg;
  const sig = u.junc.sig;
  const A = u.axis;
  const O = other(A);
  const base = fixedReq(sig, cfg);
  const n = opts.queueAware ? u.nQueue : 0;
  const h = cfg.cDischargeHeadway;
  const eta = u.eta + extra;
  const Y = cfg.yellow;
  const R = cfg.allRed;
  const fg = cfg.fixedGreen;
  const tm = timing(sig, A, cfg);

  let delaySaved;
  let lostGreen;
  let lead;
  let tStartIn = 0;
  let tPassBase;
  let tPassAct;
  if (tm.greenNow) {
    const tNeed = Math.max(eta, n * h);
    tPassAct = tNeed;
    if (tNeed + 1 <= tm.tEndBase) {
      delaySaved = 0;
      lostGreen = 0;
      tPassBase = tNeed;
    } else {
      const tAgain = tm.tEndBase + 2 * (Y + R) + fg;
      tPassBase = Math.max(eta, tAgain + n * h);
      delaySaved = tPassBase - tNeed;
      lostGreen = Math.max(0, tNeed + 1 - tm.tEndBase);
    }
    lead = n * h;
  } else {
    tPassBase = Math.max(eta, tm.tGreenBase + n * h);
    tPassAct = Math.max(eta, tm.tGreenAct + n * h);
    delaySaved = tPassBase - tPassAct;
    lostGreen = Math.max(0, tm.tGreenBase - tm.tGreenAct);
    lead = tm.tGreenAct + n * h;
    if (tm.fixedSeq) {
      tStartIn = Math.max(0, eta - n * h - tm.tGreenAct);
    } else {
      const latest = eta - n * h - (Y + R);
      tStartIn = latest <= tm.minRem ? 0 : latest;
    }
  }

  const cs = crossStats(sig, O);
  const occ = outOccupancy(sim, sig, A);
  const benefit = cfg.cWeightAmbDelay * delaySaved;
  const spill = cfg.cSpillbackPenalty * 20 * Math.max(0, occ - 0.5);
  const cost = cfg.cCostPerCar * cs.cars * lostGreen + cfg.cWaitWeight * cs.longest + spill;

  const st = sig.c;
  let mode;
  if (st.mode === 'active') mode = 'active'; // sticky until the ambulance has passed
  else if (delaySaved < cfg.cMinDelaySaved) mode = 'idle';
  else if (benefit <= cost) mode = 'declined';
  else mode = tStartIn > 0.75 ? 'prepare' : 'active';

  const data = { eta: u.eta, n: u.nQueue, nUsed: n, lead, delaySaved, benefit, cost, crossCars: cs.cars, tStartIn, mode };
  const axisName = `${A}-axis`;
  const key = mode;
  if (mode !== 'idle' && st.lastLogged !== key) {
    st.lastLogged = key;
    const head = `${sig.id}: ambulance ETA ${fmt(u.eta)} s, queue ahead ${u.nQueue}, lead time ${fmt(lead)} s`;
    const tail = `est. delay saved ${fmt(delaySaved)} s (benefit ${fmt(benefit, 0)}) vs cross-street cost ${fmt(cost, 0)} (${cs.cars} cars)`;
    let text;
    if (mode === 'prepare') text = `${head} \u2192 preparing: switch to ${axisName} green in ${fmt(tStartIn)} s; ${tail}.`;
    else if (mode === 'declined') text = `${head} \u2192 not interrupting cross traffic; cost exceeds benefit; ${tail}.`;
    else if (tm.greenNow) text = `${head} \u2192 holding ${axisName} green; ${tail}.`;
    else text = `${head} \u2192 switching to ${axisName} green now; ${tail}.`;
    sim.logEvent(sig, mode === 'declined' ? 'decline' : mode === 'prepare' ? 'prepare' : tm.greenNow ? 'hold' : 'switch', text, data);
  }
  if (mode !== 'active' && mode !== 'prepare' && st.lastLogged === 'prepare') st.lastLogged = '';
  st.mode = mode;

  const req =
    mode === 'active'
      ? { desired: A, emergency: true, baselineDesired: base.desired }
      : base;
  return { req, predictedPass: mode === 'active' || mode === 'prepare' ? tPassAct : tPassBase, eta };
}

function recoveryReq(sim, sig) {
  const cfg = sim.cfg;
  const cur = sig.greenAxis;
  const oth = other(cur);
  const pc = pressure(sig, cur);
  const po = pressure(sig, oth);
  let want;
  if (pc === 0 && po === 0) want = fixedReq(sig, cfg).desired;
  else if (po > pc + 1) want = oth;
  else if (sig.timer >= cfg.fixedGreen * 2) want = oth;
  else want = cur;
  return { desired: want, emergency: false, baselineDesired: want, rec: { pc, po, cur, oth } };
}

function strategyC(id, opts) {
  return {
    id,
    control(sim) {
      const cfg = sim.cfg;
      const info = sim.ambInfo();
      const reqs = new Map();
      if (info) {
        let extra = 0;
        info.upcoming.slice(0, cfg.cLookaheadJunctions).forEach((u) => {
          const r = evaluate(sim, u, extra, opts);
          reqs.set(u.junc.sig, r.req);
          extra = Math.max(0, r.predictedPass - r.eta) + extra;
        });
      }
      for (const sig of sim.signals) {
        let req = reqs.get(sig);
        if (!req) {
          if (opts.recovery && sig.c.recovering) {
            if (sim.recovery.time !== null || sim.t - sig.ambPassedAt > cfg.cRecoveryMax) {
              sig.c.recovering = false;
              const why = sim.recovery.time !== null ? 'queues are back near the pre-ambulance level' : `${cfg.cRecoveryMax} s recovery window ended`;
              sim.logEvent(sig, 'recovery', `${sig.id}: recovery finished (${why}); back to the fixed plan.`, { queued: sim.totalQueued });
              req = fixedReq(sig, cfg);
            } else req = recoveryReq(sim, sig);
          } else req = fixedReq(sig, cfg);
        }
        const res = sim.requestSignal(sig, req);
        if (res.switched && req.rec) {
          sim.logEvent(
            sig,
            'recovery',
            `${sig.id}: recovery after the ambulance \u2192 serving ${req.rec.oth}-axis approach first (queue/wait pressure ${fmt(req.rec.po)} vs ${fmt(req.rec.pc)}).`,
            { po: req.rec.po, pc: req.rec.pc }
          );
        }
      }
    },
  };
}

export function createStrategy(id) {
  switch (id) {
    case 'A':
      return strategyA();
    case 'B':
      return strategyB();
    case 'C':
      return strategyC('C', { queueAware: true, recovery: true });
    case 'C1':
      return strategyC('C1', { queueAware: false, recovery: true });
    case 'C2':
      return strategyC('C2', { queueAware: true, recovery: false });
    default:
      throw new Error(`Unknown strategy ${id}`);
  }
}

export { axisQueue };
