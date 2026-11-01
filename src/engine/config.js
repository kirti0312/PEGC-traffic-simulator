// All tunable parameters live here (engine + defaults used by the UI).
export const CONFIG = {
  dt: 0.25, // simulated seconds per step
  warmup: 60, // seconds before the ambulance enters
  maxSimTime: 420, // fixed run horizon for every strategy (s)

  // geometry (metres)
  cols: 3,
  rows: 2,
  blockLength: 220, // distance between junction centres
  boundaryLength: 180, // entry/exit stub length
  junctionHalf: 12, // stop line is this far before the junction centre
  laneOffset: 3.9, // lateral offset of the lane centre (drawing only; does not affect results)

  // vehicles
  carLength: 4.5,
  ambLength: 6.5,
  minGap: 2.0,
  carMaxSpeed: 13.9, // 50 km/h
  ambMaxSpeed: 19.4, // 70 km/h
  accel: 2.0,
  ambAccel: 3.0,
  decel: 3.5, // comfortable braking
  hardDecel: 7.0, // emergency braking (used for the commit decision)
  timeHeadway: 1.1,
  speedJitter: 0.12,

  // demand: vehicles per hour per entry point (10 entry points)
  density: { low: 180, medium: 330, high: 520 },
  rateMin: 100, // custom traffic rate limits (vehicles/h per entry point)
  rateMax: 900,

  // signals / safety layer
  minGreen: 7,
  yellow: 3,
  allRed: 2,
  maxEmergencyHold: 25, // s per junction
  maxWait: 90, // s any approach may wait (overrides emergency)
  lockout: 4, // s after a phase starts before it may be changed
  fixedGreen: 20, // Strategy A green per axis

  // strategy B
  bTriggerDistance: 120, // m from the stop line

  // strategy C (PEGC)
  cLookaheadJunctions: 2,
  cDischargeHeadway: 2.0, // s per queued vehicle discharge
  cEtaCruise: 14.5, // m/s assumed cruise speed in the rule-based ETA
  cMinDelaySaved: 1.0, // s; below this PEGC does not intervene
  cWeightAmbDelay: 12.0, // value of one second of ambulance delay
  cCostPerCar: 1.0, // cost of one second of delay for one cross-street car
  cWaitWeight: 0.5, // weight on longest cross-street wait
  cSpillbackPenalty: 4.0,
  cRecoveryMax: 60, // s: recovery mode timeout per junction

  // recovery metric (same rule for every strategy)
  recoveryTolerance: 2, // queued vehicles above the pre-ambulance average
  recoverySustain: 10, // s the queue must stay within tolerance
  baselineWindow: 30, // s before ambulance entry used for the baseline

  logCap: 400,
};

export const STRATEGIES = {
  A: { id: 'A', name: 'Fixed-time', short: 'Fixed' },
  B: { id: 'B', name: 'Basic priority', short: 'Basic' },
  C: { id: 'C', name: 'PEGC predictive', short: 'PEGC' },
  C1: { id: 'C1', name: 'PEGC without queue awareness', short: 'C1' },
  C2: { id: 'C2', name: 'PEGC without recovery', short: 'C2' },
};

export const DENSITIES = ['low', 'medium', 'high'];

export function defaultScenario() {
  return {
    origin: 'W0',
    dest: 'E1',
    density: 'medium',
    rate: 330, // veh/h per entry point; only used when density === 'custom'
    seed: 7,
    blocked: [],
    strategy: 'C',
  };
}

export const DENSITY_CHOICES = ['low', 'medium', 'high', 'custom'];

// Vehicles per hour per entry point for a scenario: a preset, or the custom rate (clamped to the limits).
// Invalid custom values fall back to the medium preset rather than breaking the run.
export function entryRate(scenario, cfg = CONFIG) {
  if (scenario.density === 'custom') {
    const r = Number(scenario.rate);
    if (!Number.isFinite(r)) return cfg.density.medium;
    return Math.min(cfg.rateMax, Math.max(cfg.rateMin, Math.round(r)));
  }
  return cfg.density[scenario.density] ?? cfg.density.medium;
}

// Short text for screens: "medium", or "custom 450 veh/h per entry".
export function trafficLabel(scenario, cfg = CONFIG) {
  return scenario.density === 'custom' ? `custom ${entryRate(scenario, cfg)} veh/h per entry` : scenario.density;
}

// Compact text for the top bar.
export function trafficShort(scenario, cfg = CONFIG) {
  return scenario.density === 'custom' ? `custom ${entryRate(scenario, cfg)}/h` : scenario.density;
}
