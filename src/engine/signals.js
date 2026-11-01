// Signal state machine for one junction: green(axis) -> yellow -> all-red -> green(other axis).
// Only the safety layer (safety.js) may start a switch.
export const other = (a) => (a === 'H' ? 'V' : 'H');

export function makeSignal(junc, cfg) {
  const greenAxis = (junc.r + junc.c) % 2 === 0 ? 'H' : 'V';
  const timer = (junc.idx * 7) % cfg.fixedGreen; // constant phase offsets (part of the fixed plan)
  const o = other(greenAxis);
  const sig = {
    id: junc.id,
    junc,
    greenAxis,
    nextAxis: o,
    phase: 'G', // G | Y | R (R = all-red clearance)
    timer,
    lastGreenEnd: { [greenAxis]: null, [o]: -(timer + cfg.yellow + cfg.allRed) },
    switches: 0,
    emergencyUsed: 0,
    waitLatch: { H: false, V: false },
    delayLogged: false,
    lastSwitchGreenDur: null,
    lastYellowDur: null,
    lastRedDur: null,
    ambPassedAt: null,
    c: { mode: 'idle', recovering: false, lastLogged: '', lastRecSwitch: -1 },
    bActive: false,
  };
  junc.sig = sig;
  return sig;
}

export function updateSignal(sig, cfg) {
  sig.timer += cfg.dt;
  if (sig.phase === 'Y' && sig.timer >= cfg.yellow - 1e-9) {
    sig.lastYellowDur = sig.timer;
    sig.phase = 'R';
    sig.timer = 0;
  } else if (sig.phase === 'R' && sig.timer >= cfg.allRed - 1e-9) {
    sig.lastRedDur = sig.timer;
    sig.phase = 'G';
    sig.greenAxis = sig.nextAxis;
    sig.timer = 0;
    sig.waitLatch[sig.greenAxis] = false;
    sig.delayLogged = false;
  }
}

export function startSwitch(sig, t) {
  sig.lastSwitchGreenDur = sig.timer;
  sig.lastGreenEnd[sig.greenAxis] = t;
  sig.nextAxis = other(sig.greenAxis);
  sig.phase = 'Y';
  sig.timer = 0;
  sig.switches++;
}

export function lightFor(sig, axis) {
  if (sig.greenAxis !== axis) return 'R';
  return sig.phase === 'G' ? 'G' : sig.phase === 'Y' ? 'Y' : 'R';
}
