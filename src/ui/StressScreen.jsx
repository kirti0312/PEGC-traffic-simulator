import { memo, useEffect, useMemo, useSyncExternalStore } from 'react';
import { STRATEGIES, CONFIG, entryRate, trafficLabel } from '../engine/config.js';
import { stressScenario, routeFor, routeLength, junctionsOn, pickRouteRoad, routeSegments, segLabelOf } from '../engine/stress.js';
import { subscribe, getState, setChoice, runStress, stressKey } from './stressStore.js';
import { METRICS, STRAT_COLOR, cell, f1 } from './compareLogic.js';
import { BarChart } from './Charts.jsx';
import { SEGMENTS } from './places.js';
import { ctrl } from './ctrl.js';
import { useRenderCount } from './hooks.js';

const STRATS = ['A', 'B', 'C'];
const MK = Object.fromEntries(METRICS.map((m) => [m.key, m]));
const TYPES = [['traffic', 'High traffic'], ['block', 'Block a road'], ['both', 'Both']];
const BA_COLORS = { before: '#8e9aa4', after: 'var(--blocked)' };
const SHOWN = ['ambTravelTime', 'avgWait', 'longestWait', 'maxQueue'];

// Change from before to after in percent, positive = worse. null when not comparable.
function worsePct(m, b, a) {
  if (!b || !a || b.mean === null || a.mean === null || b.mean === 0) return null;
  if (b.n < b.of || a.n < a.of) return null;
  const p = ((a.mean - b.mean) / b.mean) * 100;
  return m.higher ? -p : p;
}
const wtext = (p) => (p === null ? 'not compared' : Math.abs(p) < 0.5 ? 'no change' : `${Math.abs(p).toFixed(1)}% ${p > 0 ? 'worse' : 'better'}`);
const wcls = (p) => (p === null || Math.abs(p) < 0.5 ? '' : p > 0 ? 'bad' : 'good');

export const StressScreen = memo(function StressScreen({ scenario }) {
  useRenderCount('StressScreen');
  const st = useSyncExternalStore(subscribe, getState);
  const choice = st.choice || { type: 'block', blocked: null, seedCount: 10 };
  // first visit: pre-select a road on the current route that still leaves another way through
  const picked = useMemo(() => pickRouteRoad(scenario), [scenario.origin, scenario.dest, scenario.blocked]);
  const extra = choice.blocked || (picked ? [picked] : []);
  const type = choice.type;
  const seedCount = choice.seedCount || 10;

  const base = scenario;
  const stressed = useMemo(() => stressScenario(base, type, extra), [base, type, extra.join(',')]);
  const routeBefore = useMemo(() => routeFor(base), [base]);
  const routeAfter = useMemo(() => routeFor(stressed), [stressed]);
  const noRouteBefore = !routeBefore;
  const noRouteAfter = !!routeBefore && !routeAfter;
  const trafficNoop = type === 'traffic' && entryRate(base) >= CONFIG.density.high;
  const nothingChanges = (type === 'block' && !extra.length) || trafficNoop;
  const key = stressKey(base, noRouteAfter ? null : stressed, STRATS, seedCount);
  const fresh = st.key === key;

  // live preview on the map: old route dashed, new route solid, blocked roads hatched
  useEffect(() => {
    const changed = routeBefore && routeAfter && routeBefore.join() !== routeAfter.join();
    const routes = [];
    if (routeBefore && (changed || noRouteAfter)) routes.push({ nodes: routeBefore, style: 'old' });
    if (routeAfter) routes.push({ nodes: routeAfter, style: 'main' });
    ctrl.setOverlay({ routes, blocked: stressed.blocked, origin: base.origin, dest: base.dest });
    return () => ctrl.clearOverlay();
  }, [routeBefore, routeAfter, noRouteAfter, stressed, base.origin, base.dest]);

  const run = () => runStress({ key, before: base, after: noRouteAfter ? null : stressed, strategies: STRATS, seedCount });
  const toggleRoad = (id) => setChoice({ type, seedCount, blocked: extra.includes(id) ? extra.filter((x) => x !== id) : [...extra, id] });
  const onRoute = new Set(routeSegments(routeBefore));
  const running = st.status === 'running' && st.key === key;

  return (
    <div className="dock cmp stress">
      <div className="cmp-head">
        <h2>Stress Test and Explain</h2>
      </div>
      <div className="glass card">
        <p className="lead" style={{ margin: '0 0 10px' }}>
          Take your current scenario ({base.origin} → {base.dest}, {trafficLabel(base)} traffic{base.blocked.length ? `, ${base.blocked.length} road(s) already blocked` : ''}, seed {base.seed}) and make it harder. Each strategy is then run before and after on the same seeds.
        </p>
        <div className="cmp-controls">
          <div className="field"><label>Stress</label>
            <div className="seg">{TYPES.map(([id, label]) => <button key={id} className={type === id ? 'on' : ''} onClick={() => setChoice({ type: id, seedCount, blocked: extra })}>{label}</button>)}</div>
          </div>
          <div className="field"><label>Seeds</label>
            <div className="seg">{[5, 10, 20].map((n) => <button key={n} className={seedCount === n ? 'on' : ''} onClick={() => setChoice({ type, blocked: extra, seedCount: n })}>{n}</button>)}</div>
          </div>
          <button className="btn primary" disabled={running || noRouteBefore || nothingChanges} onClick={run}>{running ? 'Running…' : 'Run stress test'}</button>
        </div>
        {type !== 'traffic' && (
          <div className="field" style={{ marginTop: 12 }}>
            <label>Roads to block ({extra.length}) — roads on the current route are outlined</label>
            <div className="chips">
              {SEGMENTS.map((s) => (
                <button key={s.id} className={`chip ${extra.includes(s.id) ? 'on' : ''} ${onRoute.has(s.id) ? 'onroute' : ''}`} onClick={() => toggleRoad(s.id)}>{s.label}</button>
              ))}
            </div>
          </div>
        )}
        <p className="note" style={{ margin: '10px 0 0' }}>Map: dashed grey = original route, solid teal = route after the stress, hatched = blocked road.</p>
      </div>

      {noRouteBefore && <div className="warnbox" role="alert">There is no route for this scenario even before the stress (origin {base.origin}, destination {base.dest}). Change it on Configure first.</div>}
      {trafficNoop && <div className="warnbox" role="status">Traffic is already at or above the high preset in this scenario, so “High traffic” changes nothing. Pick “Block a road” or lower the traffic on Configure.</div>}
      {type === 'block' && !extra.length && !noRouteBefore && <div className="warnbox" role="status">Choose at least one road to block.</div>}
      {noRouteAfter && (
        <div className="warnbox" role="alert">
          <b>No route available.</b> With {extra.map(segLabelOf).join(', ')} blocked there is no way from {base.origin} to {base.dest}. The ambulance cannot be dispatched, so no ambulance results exist for the stressed case and none are invented. Ordinary traffic would still run.
          {fresh && st.status === 'done' ? ' The “before” results are shown below.' : ' Run the test to see the “before” results.'}
        </div>
      )}

      {running && (
        <div className="glass card cmp-progress" role="status">Running headless simulations in a background worker…
          <div className="bar"><i style={{ width: `${Math.round(st.progress * 100)}%` }} /></div>
        </div>
      )}
      {st.status === 'error' && fresh && <div className="glass card" role="alert">Stress test failed: {st.error}</div>}
      {!fresh && st.status === 'done' && !running && <div className="note">Settings changed since the last run. Press “Run stress test” to update the results.</div>}

      {fresh && st.status === 'done' && (
        <Results before={st.before} after={st.after} base={base} stressed={stressed} routeBefore={routeBefore} routeAfter={routeAfter} type={type} extra={extra} />
      )}

      <p className="note cmp-foot">
        Browser mini-simulator: not SUMO results. Simulated six-junction grid, simplified driver behaviour, no real-world validation. Before and after use the same seeds; only the stress changes. Values are means over the seeds.
      </p>
    </div>
  );
});

function routeText(routeBefore, routeAfter, extra) {
  if (!routeAfter) return null;
  const lb = routeLength(routeBefore);
  const la = routeLength(routeAfter);
  const changed = routeBefore.join() !== routeAfter.join();
  if (!changed) return `The ambulance route did not change${extra.length ? ' (the blocked road is not on it)' : ''}: ${lb} m through ${junctionsOn(routeBefore)} junctions.`;
  const d = la - lb;
  if (d === 0) return `The ambulance was rerouted onto different roads of the same length (${lb} m through ${junctionsOn(routeAfter)} junctions), so the detour itself costs no extra distance.`;
  return `The ambulance was rerouted: ${lb} m through ${junctionsOn(routeBefore)} junctions became ${la} m through ${junctionsOn(routeAfter)} junctions (${d > 0 ? '+' : '−'}${Math.abs(d)} m).`;
}

const Results = memo(function Results({ before, after, base, stressed, routeBefore, routeAfter, type, extra }) {
  const sentences = useMemo(() => {
    const out = [];
    const rt = after ? routeText(routeBefore, routeAfter, extra) : null;
    if (rt) out.push(rt);
    if (after) {
      const parts = STRATS.map((s) => {
        const b = cell(before, s, MK.ambTravelTime);
        const a = cell(after, s, MK.ambTravelTime);
        if (!b || !a || b.mean === null || a.mean === null) return `${STRATEGIES[s].name}: ambulance did not finish in every run`;
        return `${STRATEGIES[s].name} ${f1(b.mean)} → ${f1(a.mean)} s`;
      });
      out.push(`Mean ambulance travel time before → after: ${parts.join('; ')}.`);
      const worse = [];
      for (const s of STRATS) for (const k of ['avgWait', 'longestWait', 'maxQueue']) {
        const b = cell(before, s, MK[k]);
        const a = cell(after, s, MK[k]);
        const p = worsePct(MK[k], b, a);
        if (p !== null && p > 10) worse.push(`${STRATEGIES[s].short} ${MK[k].label.replace(/ \(.*\)/, '').toLowerCase()} ${f1(b.mean)} → ${f1(a.mean)}`);
      }
      out.push(worse.length ? `More than 10% worse after the stress: ${worse.join('; ')}.` : 'No car-side metric got more than 10% worse after the stress.');
      const cAfterAmb = cell(after, 'C', MK.ambTravelTime);
      const aAfterAmb = cell(after, 'A', MK.ambTravelTime);
      if (cAfterAmb && aAfterAmb && cAfterAmb.mean !== null && aAfterAmb.mean !== null) {
        const p = ((aAfterAmb.mean - cAfterAmb.mean) / aAfterAmb.mean) * 100;
        out.push(`After the stress PEGC was ${Math.abs(p).toFixed(1)}% ${p >= 0 ? 'faster' : 'slower'} than fixed-time for the ambulance.`);
      }
    }
    return out;
  }, [before, after, routeBefore, routeAfter, extra]);

  const series = (key) => STRATS.map((s) => {
    const b = cell(before, s, MK[key]);
    const a = after ? cell(after, s, MK[key]) : null;
    return { label: s, bars: [{ id: 'before', value: b && b.mean !== null ? b.mean : null, sd: b ? b.sd : 0 }, ...(a ? [{ id: 'after', value: a.mean !== null ? a.mean : null, sd: a.sd }] : [])] };
  });

  // real decision-log lines from the first stressed (or, with no stressed run, original) run of Strategy C
  const src = after || before;
  const run0 = src.results.C.runs[0];
  const lines = run0.log.slice(0, 6) // first decisions of the run, in time order;
  const kinds = {};
  for (const e of run0.log) kinds[e.kind] = (kinds[e.kind] || 0) + 1;

  return (
    <>
      <div className="glass card cmp-summary" role="status">
        <b>What changed</b>
        {sentences.length ? sentences.map((t, i) => <p key={i} style={{ margin: '6px 0 0' }}>{t}</p>) : <p style={{ margin: '6px 0 0' }}>No stressed run: there is no route, so only the “before” results exist.</p>}
      </div>

      <div className="glass cmp-tablewrap">
        <table className="cmp-table">
          <thead><tr><th>Metric (mean ± sd)</th>{STRATS.map((s) => <th key={s}>{s} · {STRATEGIES[s].short}</th>)}</tr></thead>
          <tbody>
            {SHOWN.map((k) => (
              <tr key={k}>
                <th scope="row">{MK[k].label}<span className="dir">{after ? 'before → after' : 'before only'}</span></th>
                {STRATS.map((s) => {
                  const b = cell(before, s, MK[k]);
                  const a = after ? cell(after, s, MK[k]) : null;
                  const p = a ? worsePct(MK[k], b, a) : null;
                  return (
                    <td key={s}>
                      <div>{b && b.mean !== null ? `${f1(b.mean, MK[k].dec)} ± ${f1(b.sd, MK[k].dec)}` : 'not reached'}{a && <> → <b>{a.mean !== null ? `${f1(a.mean, MK[k].dec)} ± ${f1(a.sd, MK[k].dec)}` : 'not reached'}</b></>}{MK[k].unit && ` ${MK[k].unit}`}</div>
                      {a && <div className={`sub ${wcls(p)}`}>{wtext(p)}</div>}
                      {((b && b.n < b.of) || (a && a.n < a.of)) && <div className="sub">finished in {b ? b.n : 0}/{b ? b.of : 0}{a ? ` → ${a.n}/${a.of}` : ''} runs</div>}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th scope="row">Safety violations<span className="dir">total over all runs</span></th>
              {STRATS.map((s) => <td key={s}>{cell(before, s, MK.violations).mean}{after && <> → <b>{cell(after, s, MK.violations).mean}</b></>}</td>)}
            </tr>
          </tbody>
        </table>
      </div>

      {after && (
        <div className="cmp-charts">
          <div className="glass card"><h3>Ambulance travel time</h3>
            <BarChart title="Ambulance travel time before and after the stress" unit="s" colors={BA_COLORS} clusters={series('ambTravelTime')} />
          </div>
          <div className="glass card"><h3>Average car wait</h3>
            <BarChart title="Average car wait before and after the stress" unit="s" colors={BA_COLORS} clusters={series('avgWait')} />
          </div>
        </div>
      )}

      <div className="glass card">
        <h3>Why: decision log from the {after ? 'stressed' : 'original'} run (Strategy C, seed {run0.scenario.seed})</h3>
        {lines.length ? (
          <div className="log-list stress-log">
            {lines.map((e) => <div key={e.id} className={`log-item ${e.kind}`}><span className="t">{e.t.toFixed(1)}s</span>{e.text}</div>)}
          </div>
        ) : <p className="note">The controller logged no decisions for this run.</p>}
        <p className="note" style={{ marginTop: 8 }}>
          These are real log lines from one run, not a summary. That run logged {Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(', ') || 'no events'}. The ETA the controller uses is a rule-based estimate (distance, speed, queue ahead), not machine learning.
        </p>
      </div>
    </>
  );
});
