// Headless scenario runner. Used by the worker, the tests and the UI (for route preview).
import { Simulation } from './sim.js';
import { findRoute, buildNetwork, routeNodeIds } from './network.js';
import { CONFIG } from './config.js';

export function runScenario(scenario, strategyId, opts = {}) {
  const sim = new Simulation(scenario, strategyId, opts);
  sim.runToEnd();
  return summarize(sim);
}

export function summarize(sim) {
  return {
    strategy: sim.strategyId,
    scenario: sim.scenario,
    metrics: sim.metrics(),
    log: sim.logEntries.slice(),
    logTotal: sim.logTotal,
    series: sim.series.slice(),
    route: sim.ambRoute ? routeNodeIds(sim.ambRoute) : null,
    safety: { violations: sim.safety.violations, byRule: sim.safety.byRule },
    ambPasses: sim.ambPasses.slice(),
  };
}

export function previewRoute(scenario, cfg = CONFIG) {
  const net = buildNetwork(cfg);
  const r = findRoute(net, scenario.origin, scenario.dest, new Set(scenario.blocked || []));
  return r ? routeNodeIds(r) : null;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const sd = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
};

const KEYS = ['ambTravelTime', 'ambStops', 'avgWait', 'longestWait', 'maxQueue', 'throughput', 'recoveryTime', 'violations'];

export function aggregate(runs) {
  const out = {};
  for (const k of KEYS) {
    const vals = runs.map((r) => r.metrics[k]).filter((x) => x !== null && x !== undefined);
    out[k] = { mean: mean(vals), sd: sd(vals), n: vals.length, of: runs.length };
  }
  return out;
}

// Runs every strategy on the same scenario over consecutive seeds. onProgress(done, total).
export function runComparison(scenario, strategies, seedCount, onProgress) {
  const results = {};
  const total = strategies.length * seedCount;
  let done = 0;
  for (const s of strategies) results[s] = { runs: [] };
  for (let i = 0; i < seedCount; i++) {
    const seed = scenario.seed + i;
    for (const s of strategies) {
      results[s].runs.push(runScenario({ ...scenario, seed }, s));
      done++;
      if (onProgress) onProgress(done, total);
    }
  }
  for (const s of strategies) results[s].agg = aggregate(results[s].runs);
  return { scenario, seeds: Array.from({ length: seedCount }, (_, i) => scenario.seed + i), results };
}

// Improvement versus Strategy A. Lower-is-better metrics: (A - X) / A. Throughput: (X - A) / A.
export function improvementVsA(aMean, xMean, higherIsBetter = false) {
  if (aMean === null || xMean === null || aMean === undefined || xMean === undefined || aMean === 0) return null;
  return higherIsBetter ? ((xMean - aMean) / aMean) * 100 : ((aMean - xMean) / aMean) * 100;
}
