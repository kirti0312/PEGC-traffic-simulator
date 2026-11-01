// Pure helpers for the Compare screen. Every number shown comes from run results; nothing is hard-coded.
import { STRATEGIES, trafficLabel } from '../engine/config.js';
import { improvementVsA } from '../engine/runner.js';

export const METRICS = [
  { key: 'ambTravelTime', label: 'Ambulance travel time', unit: 's', dec: 1, higher: false },
  { key: 'ambStops', label: 'Ambulance stops', unit: '', dec: 1, higher: false },
  { key: 'avgWait', label: 'Average car wait', unit: 's', dec: 1, higher: false },
  { key: 'longestWait', label: 'Longest single wait', unit: 's', dec: 1, higher: false },
  { key: 'maxQueue', label: 'Max queue (vehicles)', unit: '', dec: 1, higher: false },
  { key: 'throughput', label: 'Throughput', unit: 'veh/h', dec: 0, higher: true },
  { key: 'recoveryTime', label: 'Queue recovery time', unit: 's', dec: 1, higher: false },
  { key: 'violations', label: 'Safety violations (total)', unit: '', dec: 0, higher: false, sum: true },
];

export const STRAT_COLOR = { A: '#8e9aa4', B: 'var(--amb-blue)', C: 'var(--teal)', C1: '#7fd6cc', C2: '#b9a2f5' };

export const f1 = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(d));

// Mean (and sd) for one strategy and metric, or null when no run produced a value.
export function cell(out, sid, m) {
  const a = out.results[sid] && out.results[sid].agg[m.key];
  if (!a) return null;
  if (m.sum) {
    const total = out.results[sid].runs.reduce((s, r) => s + (r.metrics.violations || 0), 0);
    return { mean: total, sd: 0, n: a.of, of: a.of };
  }
  if (a.mean === null) return { mean: null, sd: 0, n: 0, of: a.of };
  return a;
}

// Improvement of strategy sid versus A in percent (positive = better). null when undefined.
export function improvement(out, sid, m) {
  if (sid === 'A' || m.sum) return null;
  const a = cell(out, 'A', m);
  const x = cell(out, sid, m);
  if (!a || !x) return null;
  // Do not compare means taken over different subsets of runs (e.g. recovery reached in 1 of 10 vs 7 of 10).
  if (a.n < a.of || x.n < x.of) return null;
  return improvementVsA(a.mean, x.mean, m.higher);
}

export function improvementText(p) {
  if (p === null) return 'not compared';
  if (Math.abs(p) < 0.5) return 'no change';
  return `${Math.abs(p).toFixed(1)}% ${p > 0 ? 'better' : 'worse'}`;
}

export function valueText(c, m) {
  if (!c || c.mean === null) return 'not reached';
  const sd = c.sd > 0 && !m.sum ? ` ± ${f1(c.sd, m.dec)}` : '';
  return `${f1(c.mean, m.dec)}${sd}${m.unit ? ` ${m.unit}` : ''}`;
}

const M = Object.fromEntries(METRICS.map((m) => [m.key, m]));

// Neutral summary built only from the aggregated numbers.
export function summarise(out) {
  const n = out.seeds.length;
  const sc = out.scenario;
  const has = (s) => !!out.results[s];
  const name = (s) => STRATEGIES[s].name;
  const amb = (s) => cell(out, s, M.ambTravelTime);
  const parts = [];
  const head = `Over ${n} seeds (${sc.origin} → ${sc.dest}, ${trafficLabel(sc)} traffic${sc.blocked.length ? `, blocked: ${sc.blocked.join(', ')}` : ''}), mean ambulance travel time was `;
  const list = ['A', 'B', 'C'].filter(has).map((s) => {
    const c = amb(s);
    return c && c.mean !== null ? `${f1(c.mean)} s with ${name(s)}${c.n < c.of ? ` (finished in ${c.n} of ${c.of} runs)` : ''}` : `not finished with ${name(s)}`;
  });
  parts.push(head + list.join(', ') + '.');
  if (has('A') && has('C')) {
    const p = improvement(out, 'C', M.ambTravelTime);
    if (p !== null) parts.push(`${name('C')} was ${Math.abs(p).toFixed(1)}% ${p >= 0 ? 'faster' : 'slower'} than ${name('A')} for the ambulance.`);
    const worse = METRICS.filter((m) => !m.sum && m.key !== 'ambTravelTime')
      .map((m) => ({ m, p: improvement(out, 'C', m), c: cell(out, 'C', m), a: cell(out, 'A', m) }))
      .filter((r) => r.p !== null && r.p < -1 && r.c && r.a && r.c.mean !== null && r.a.mean !== null);
    if (worse.length) {
      parts.push(`${name('C')} was worse than ${name('A')} on: ${worse.map((r) => `${r.m.label.replace(/ \(.*\)/, '').toLowerCase()} (${f1(r.c.mean, r.m.dec)} vs ${f1(r.a.mean, r.m.dec)}${r.m.unit ? ' ' + r.m.unit : ''})`).join('; ')}.`);
    } else {
      parts.push(`${name('C')} was not worse than ${name('A')} on any other measured metric in this scenario.`);
    }
  }
  const rec = ['A', 'B', 'C'].filter(has).map((s) => ({ s, c: cell(out, s, M.recoveryTime) })).filter((r) => r.c && r.c.n < r.c.of);
  if (rec.length) parts.push(`Queue recovery was not always reached: ${rec.map((r) => `${name(r.s)} ${r.c.n} of ${r.c.of} runs`).join(', ')}.`);
  const viol = out.seeds.length && ['A', 'B', 'C'].filter(has).reduce((t, s) => t + cell(out, s, M.violations).mean, 0);
  parts.push(viol ? `Safety layer violations recorded: ${viol}.` : 'No safety-layer violations were recorded in these runs.');
  return parts.join(' ');
}
