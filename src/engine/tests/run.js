// Engine checks that run in Node without a browser:  npm run test:engine
import { Simulation } from '../sim.js';
import { runScenario } from '../runner.js';
import { buildNetwork, findRoute } from '../network.js';
import { makeRng } from '../rng.js';
import { CONFIG, defaultScenario, DENSITIES, entryRate, trafficLabel } from '../config.js';
import { stressScenario, routeFor, routeLength, routeSegments, pickRouteRoad } from '../stress.js';

let pass = 0;
let fail = 0;
const results = [];
function check(name, ok, detail = '') {
  if (ok) pass++;
  else fail++;
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  \u2014 ' + detail : ''}`);
}

const base = { ...defaultScenario() };

// 1. RNG determinism
{
  const a = makeRng(42);
  const b = makeRng(42);
  let same = true;
  for (let i = 0; i < 1000; i++) if (a.next() !== b.next()) same = false;
  check('Seeded RNG is reproducible', same);
}

// 2. Same seed gives identical metrics
{
  let ok = true;
  for (const s of ['A', 'B', 'C']) {
    const r1 = JSON.stringify(runScenario({ ...base, seed: 5 }, s).metrics);
    const r2 = JSON.stringify(runScenario({ ...base, seed: 5 }, s).metrics);
    if (r1 !== r2) ok = false;
  }
  check('Same seed gives identical metrics on repeated runs (A, B, C)', ok);
  const d1 = runScenario({ ...base, seed: 5 }, 'A').metrics.avgWait;
  const d2 = runScenario({ ...base, seed: 6 }, 'A').metrics.avgWait;
  check('Different seeds give different traffic', d1 !== d2, `${d1.toFixed(3)} vs ${d2.toFixed(3)}`);
}

// 3. No overlaps, no red-line crossings
{
  let overlaps = 0;
  let steps = 0;
  let maxLive = 0;
  for (const seed of [1, 2, 3]) {
    for (const density of DENSITIES) {
      for (const st of ['A', 'B', 'C']) {
        const sim = new Simulation({ ...base, seed, density }, st);
        while (!sim.finished) {
          sim.step();
          steps++;
          maxLive = Math.max(maxLive, sim.live.length);
          for (const e of sim.net.edges) {
            for (let i = 1; i < e.veh.length; i++) {
              const l = e.veh[i - 1];
              const f = e.veh[i];
              if (l.s - l.len < f.s - 1e-6) overlaps++;
            }
          }
        }
      }
    }
  }
  check('No vehicle overlaps another (27 runs, same-lane check every step)', overlaps === 0, `${overlaps} overlaps in ${steps} steps, up to ${maxLive} vehicles`);

  let red = 0;
  for (const seed of [1, 2, 3, 4]) {
    for (const density of DENSITIES) {
      for (const st of ['A', 'B', 'C']) {
        const sim = new Simulation({ ...base, seed, density }, st);
        sim.runToEnd();
        red += sim.stats.redCrossings;
      }
    }
  }
  check('No vehicle crosses a red stop line', red === 0, `${red} crossings`);
}

// 4. Safety violations = 0 for all strategies, >= 10 seeds, 3 densities
{
  let total = 0;
  let runs = 0;
  const by = {};
  for (let seed = 1; seed <= 10; seed++) {
    for (const density of DENSITIES) {
      for (const st of ['A', 'B', 'C', 'C1', 'C2']) {
        const sim = new Simulation({ ...base, seed, density }, st);
        sim.runToEnd();
        runs++;
        total += sim.safety.violations;
        if (sim.safety.violations) by[st] = (by[st] || 0) + sim.safety.violations;
      }
    }
  }
  check('Safety violations = 0 (A, B, C, C1, C2 \u00d7 10 seeds \u00d7 3 densities)', total === 0, `${runs} runs, ${total} violations ${JSON.stringify(by)}`);
}

// 5. Identical traffic until the ambulance appears
{
  let ok = true;
  let detail = '';
  const sims = ['A', 'B', 'C'].map((s) => new Simulation({ ...base, seed: 9, density: 'high' }, s));
  const steps = Math.round(CONFIG.warmup / CONFIG.dt) - 1;
  for (let i = 0; i < steps && ok; i++) {
    sims.forEach((s) => s.step());
    if (i % 4 === 0) {
      const snap = (s) => s.live.map((v) => `${v.id}:${v.edge.id}:${v.s.toFixed(4)}`).join('|') + s.signals.map((g) => g.greenAxis + g.phase + g.timer).join(',');
      const a = snap(sims[0]);
      if (a !== snap(sims[1]) || a !== snap(sims[2])) {
        ok = false;
        detail = `diverged at step ${i}`;
      }
    }
  }
  check('A, B and C use identical traffic and signals until the ambulance appears', ok, detail || `${steps} steps compared`);
}

// 6. A and B replay the same scenario with different outcomes
{
  let diff = 0;
  let n = 0;
  const rows = [];
  for (let seed = 1; seed <= 6; seed++) {
    const a = runScenario({ ...base, seed, density: 'high' }, 'A').metrics;
    const b = runScenario({ ...base, seed, density: 'high' }, 'B').metrics;
    n++;
    if (Math.abs(a.ambTravelTime - b.ambTravelTime) > 0.01) diff++;
    rows.push(`${a.ambTravelTime.toFixed(1)}/${b.ambTravelTime.toFixed(1)}`);
  }
  check('A and B produce different ambulance outcomes on the same scenario', diff > 0, `differ on ${diff}/${n} seeds (A/B travel time: ${rows.join(', ')})`);
}

// 7. C decisions react to queues, and log lines match real values
{
  const lowC = runScenario({ ...base, seed: 3, density: 'low' }, 'C');
  const highC = runScenario({ ...base, seed: 3, density: 'high' }, 'C');
  const decisions = (r) => r.log.filter((l) => ['prepare', 'switch', 'hold', 'decline'].includes(l.kind));
  const lowQ = decisions(lowC).map((l) => l.data.n);
  const highQ = decisions(highC).map((l) => l.data.n);
  const sum = (x) => x.reduce((a, b) => a + b, 0);
  check('C decisions change when queues change', JSON.stringify(lowC.log.map((l) => l.text)) !== JSON.stringify(highC.log.map((l) => l.text)), `queue-ahead values low=[${lowQ}] high=[${highQ}]; sum low ${sum(lowQ)} vs high ${sum(highQ)}`);

  // verify the logged values against a fresh recomputation at the moment of logging
  let checked = 0;
  let bad = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    for (const density of ['medium', 'high']) {
      const sim = new Simulation({ ...base, seed, density }, 'C');
      const orig = sim.logEvent.bind(sim);
      sim.logEvent = (sig, kind, text, data) => {
        if (['prepare', 'switch', 'hold', 'decline'].includes(kind)) {
          const info = sim.ambInfo();
          const u = info && info.upcoming.find((x) => x.junc.id === sig.id);
          checked++;
          if (!u || u.nQueue !== data.n || Math.abs(u.eta - data.eta) > 1e-9 || !text.includes(`queue ahead ${data.n}`) || !text.includes(`ETA ${data.eta.toFixed(1)} s`)) bad++;
        }
        return orig(sig, kind, text, data);
      };
      sim.runToEnd();
    }
  }
  check('Every C decision log line matches the real queue/ETA values at that moment', bad === 0 && checked > 0, `${checked} lines checked over 16 runs, ${bad} mismatches`);
}

// 8. Routing, blocked roads, impossible routes
{
  const net = buildNetwork();
  const r0 = findRoute(net, 'W0', 'E1', new Set());
  const ids = r0.map((e) => e.id);
  const blockedSeg = r0.find((e) => e.from === 'J01' && e.to === 'J02') ? 'J01|J02' : r0.find((e) => e.toJunction && e.fromJunction).segId;
  const r1 = findRoute(net, 'W0', 'E1', new Set([blockedSeg]));
  check('Blocking a road on the route changes the route', r1 && r1.map((e) => e.id).join() !== ids.join(), `${ids.join(' ')}  ->  ${r1 ? r1.map((e) => e.id).join(' ') : 'none'}`);
  const none = findRoute(net, 'W0', 'E1', new Set(['W0|J00']));
  check('Impossible case returns no route (never invents one)', none === null);
  const sim = new Simulation({ ...base, blocked: ['W0|J00'] }, 'C');
  check('Simulation reports no-route status for an impossible ambulance trip', sim.status === 'no-route' && sim.ambRoute === null);
  sim.runToEnd();
  check('Ordinary traffic still runs when the ambulance has no route', sim.completed > 0 && sim.metrics().ambTravelTime === null);
}

// 9. Density control mid-run
{
  const sim = new Simulation({ ...base, density: 'low' }, 'A');
  for (let i = 0; i < 400; i++) sim.step();
  const e1 = sim.entered;
  sim.setDensity('high');
  for (let i = 0; i < 400; i++) sim.step();
  const e2 = sim.entered - e1;
  check('Changing traffic density mid-run changes the spawn rate', e2 > e1, `first 100 s: ${e1}, next 100 s: ${e2}`);
}

// 10. Sanity: traffic flows, signals cycle
{
  const sim = new Simulation({ ...base, density: 'medium' }, 'A');
  sim.runToEnd();
  const m = sim.metrics();
  check('Traffic flows: vehicles complete trips', m.completed > 100, `${m.completed} completed, throughput ${m.throughput.toFixed(0)} veh/h, max queue ${m.maxQueue}`);
  check('Ambulance completes its trip', m.ambFinished, `travel time ${m.ambTravelTime && m.ambTravelTime.toFixed(1)} s`);
}

// 11. Performance
{
  const t0 = Date.now();
  const sim = new Simulation({ ...base, density: 'high' }, 'C');
  let maxLive = 0;
  while (!sim.finished) {
    sim.step();
    maxLive = Math.max(maxLive, sim.live.length);
  }
  const ms = Date.now() - t0;
  check('One full headless run is fast', ms < 3000, `${ms} ms for ${sim.stepIndex} steps, up to ${maxLive} vehicles`);
}

// 12. Stress test: blocking a road reroutes, never uses the blocked road, and the ambulance still finishes
{
  const road = pickRouteRoad(base);
  const st = stressScenario(base, 'block', [road]);
  const r0 = routeFor(base);
  const r1 = routeFor(st);
  check('Stress: a road on the route can be picked', !!road, road);
  check('Stress: rerouted path avoids the blocked road', !!r1 && !routeSegments(r1).includes(road));
  check('Stress: detour is not shorter than the original route', routeLength(r1) >= routeLength(r0), `${routeLength(r0)} m -> ${routeLength(r1)} m`);
  const m = runScenario({ ...st, seed: 3 }, 'C').metrics;
  check('Stress: ambulance finishes on the rerouted path', m.ambFinished, `${m.ambTravelTime && m.ambTravelTime.toFixed(1)} s`);
  check('Stress: high-traffic stress only changes density', stressScenario(base, 'traffic').density === 'high' && stressScenario(base, 'traffic').blocked.length === base.blocked.length);
}

// 13. Stress test: no route when the only way is closed (must say so, not invent a route)
{
  const st = stressScenario(base, 'block', ['W0|J00']);
  check('Stress: closing the origin road gives no route', routeFor(st) === null);
  const sim = new Simulation({ ...st, seed: 3 }, 'C');
  const before = sim.status;
  sim.runToEnd();
  const m = sim.metrics();
  check('Stress: no-route run reports no ambulance result and no crash', before === 'no-route' && sim.ambRoute === null && m.ambTravelTime === null && m.violations === 0, `status before run: ${before}`);
}

// 14. Custom traffic rate
{
  const run = (sc, strat = 'A') => { const sim = new Simulation(sc, strat); sim.runToEnd(); return sim.metrics(); };
  // presets still work and custom equal to a preset gives the identical run
  let same = true;
  for (const d of DENSITIES) {
    const a = JSON.stringify(run({ ...base, density: d, seed: 5 }));
    const b = JSON.stringify(run({ ...base, density: 'custom', rate: CONFIG.density[d], seed: 5 }));
    if (a !== b) same = false;
  }
  check('Custom rate equal to a preset reproduces that preset exactly (low, medium, high)', same);
  const lo = run({ ...base, density: 'custom', rate: 150, seed: 5 }).entered;
  const mid = run({ ...base, density: 'custom', rate: 450, seed: 5 }).entered;
  const hi = run({ ...base, density: 'custom', rate: 800, seed: 5 }).entered;
  const presetHigh = run({ ...base, density: 'high', seed: 5 }).entered;
  check('Custom rate changes how many vehicles enter (150 < 450 < 800)', lo < mid && mid < hi, `${lo} < ${mid} < ${hi} vehicles entered`);
  check('A custom rate above the high preset puts more vehicles in than high', hi > presetHigh, `${hi} vs ${presetHigh}`);
  // fairness: all strategies see the same traffic before the ambulance appears
  const sig = (strat) => { const sim = new Simulation({ ...base, density: 'custom', rate: 700, seed: 9 }, strat); while (sim.t < CONFIG.warmup - 1) sim.step(); return `${sim.entered}|${sim.live.length}|${sim.live.map((v) => v.id).join(',')}`; };
  check('Custom rate: A, B and C get identical traffic before the ambulance appears', sig('A') === sig('B') && sig('B') === sig('C'));
  // total demand (vehicles that entered + vehicles still waiting to enter) is the same for every strategy;
  // only how many managed to enter before the horizon can differ, because that depends on congestion.
  const demand = (strat, seed) => { const sim = new Simulation({ ...base, density: 'custom', rate: 700, seed }, strat); sim.runToEnd(); return sim.entered + Object.values(sim.pending).reduce((a, q) => a + q.filter((v) => v.kind !== 'amb').length, 0); };
  let fair = true; const shown = [];
  for (const seed of [9, 10, 11]) { const d = ['A', 'B', 'C'].map((s2) => demand(s2, seed)); shown.push(d[0]); if (d[0] !== d[1] || d[1] !== d[2]) fair = false; }
  check('Custom rate: A, B and C face the same total demand (entered + still waiting)', fair, `seeds 9-11 demand ${shown.join(', ')}`);
  // limits and bad input
  check('Custom rate is clamped to the allowed range', entryRate({ density: 'custom', rate: 5000 }) === CONFIG.rateMax && entryRate({ density: 'custom', rate: 1 }) === CONFIG.rateMin);
  check('Bad custom rate falls back to medium and still runs', entryRate({ density: 'custom', rate: 'abc' }) === CONFIG.density.medium && run({ ...base, density: 'custom', rate: NaN, seed: 5 }).completed > 50);
  check('Label shows the rate for custom and the name for presets', trafficLabel({ density: 'custom', rate: 450 }) === 'custom 450 veh/h per entry' && trafficLabel({ density: 'high' }) === 'high');
}

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
