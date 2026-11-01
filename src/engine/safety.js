// Safety layer: every strategy request passes through here. Strategies can only ask;
// this module decides whether and when a phase change really happens.
import { other, lightFor, startSwitch } from './signals.js';

export function axisQueue(sig, axis) {
  let q = 0;
  for (const e of sig.junc.approach[axis]) q += e.queue;
  return q;
}

export function applyRequest(sig, req, t, cfg) {
  const res = { events: [], switched: false, delayed: false, delayRemaining: 0 };
  if (sig.phase !== 'G') return res; // a transition is already in progress

  let want = req.desired;
  const cur = sig.greenAxis;
  const oth = other(cur);

  // 1. Emergency hold cap: holding green against the normal plan is limited per junction.
  if (req.emergency && want === cur && req.baselineDesired !== cur) {
    if (sig.emergencyUsed >= cfg.maxEmergencyHold - 1e-9) {
      want = req.baselineDesired;
      res.events.push({
        kind: 'safety',
        text: `Safety layer: emergency hold at ${sig.id} reached the ${cfg.maxEmergencyHold} s cap; releasing to normal plan.`,
        data: { rule: 'holdCap', used: sig.emergencyUsed },
      });
    } else {
      sig.emergencyUsed += cfg.dt;
    }
  }

  // 2. No approach may wait longer than maxWait (overrides emergency requests).
  const waited = t - (sig.lastGreenEnd[oth] ?? t);
  const limit = cfg.maxWait - cfg.yellow - cfg.allRed - 1;
  if (want === cur && waited >= limit && axisQueue(sig, oth) > 0 && sig.timer >= cfg.minGreen) {
    want = oth;
    res.events.push({
      kind: 'safety',
      text: `Safety layer: ${oth}-axis approach at ${sig.id} has waited ${waited.toFixed(0)} s; forcing a switch (overrides emergency requests).`,
      data: { rule: 'maxWait', waited },
    });
  }

  // 3. Minimum green / lockout before any switch.
  if (want !== cur) {
    const need = Math.max(cfg.minGreen, cfg.lockout);
    if (sig.timer + 1e-9 >= need) {
      startSwitch(sig, t);
      res.switched = true;
    } else {
      res.delayed = true;
      res.delayRemaining = need - sig.timer;
      if (req.emergency && !sig.delayLogged) {
        sig.delayLogged = true;
        res.events.push({
          kind: 'safety',
          text: `Safety layer delayed the switch at ${sig.id} by ${res.delayRemaining.toFixed(1)} s (minimum green ${cfg.minGreen} s).`,
          data: { rule: 'minGreen', remaining: res.delayRemaining },
        });
      }
    }
  }
  return res;
}

// Independent per-step verification. The target is zero violations.
export function checkSafety(sim) {
  const cfg = sim.cfg;
  const s = sim.safety;
  const t = sim.t;
  for (const sig of sim.signals) {
    if (lightFor(sig, 'H') !== 'R' && lightFor(sig, 'V') !== 'R') s.add('conflict', sig.id, t);
    if (sig.lastSwitchGreenDur !== null) {
      if (sig.lastSwitchGreenDur + 1e-9 < cfg.minGreen) s.add('minGreen', sig.id, t);
      sig.lastSwitchGreenDur = null;
    }
    if (sig.lastYellowDur !== null) {
      if (Math.abs(sig.lastYellowDur - cfg.yellow) > 1e-6) s.add('yellow', sig.id, t);
      sig.lastYellowDur = null;
    }
    if (sig.lastRedDur !== null) {
      if (Math.abs(sig.lastRedDur - cfg.allRed) > 1e-6) s.add('allRed', sig.id, t);
      sig.lastRedDur = null;
    }
    if (sig.emergencyUsed > cfg.maxEmergencyHold + cfg.dt + 1e-9) s.add('holdCap', sig.id, t);
    for (const axis of ['H', 'V']) {
      const lg = sig.lastGreenEnd[axis];
      if (lg === null || lightFor(sig, axis) !== 'R') continue;
      if (t - lg > cfg.maxWait && axisQueue(sig, axis) > 0 && !sig.waitLatch[axis]) {
        sig.waitLatch[axis] = true;
        s.add('maxWait', sig.id, t);
      }
    }
  }
}

export function makeSafetyCounter() {
  const byRule = {};
  const details = [];
  return {
    violations: 0,
    byRule,
    details,
    add(rule, where, t) {
      this.violations++;
      byRule[rule] = (byRule[rule] || 0) + 1;
      if (details.length < 50) details.push({ rule, where, t });
    },
  };
}
