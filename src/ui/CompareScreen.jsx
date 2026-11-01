import { memo, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { STRATEGIES } from '../engine/config.js';
import { TrafficPicker } from './TrafficPicker.jsx';
import { subscribe, getState, runCompare, keyOf } from './compareStore.js';
import { METRICS, STRAT_COLOR, cell, improvement, improvementText, valueText, summarise } from './compareLogic.js';
import { BarChart, TradeoffChart } from './Charts.jsx';
import { useRenderCount } from './hooks.js';

const SEED_OPTIONS = [5, 10, 20];
const MK = Object.fromEntries(METRICS.map((m) => [m.key, m]));

export const CompareScreen = memo(function CompareScreen({ scenario }) {
  useRenderCount('CompareScreen');
  const st = useSyncExternalStore(subscribe, getState);
  const [traffic, setTraffic] = useState({ density: scenario.density, rate: scenario.rate });
  const [seedCount, setSeedCount] = useState(10);
  const [ablations, setAblations] = useState(false);
  const strategies = useMemo(() => (ablations ? ['A', 'B', 'C', 'C1', 'C2'] : ['A', 'B', 'C']), [ablations]);
  const sc = useMemo(() => ({ ...scenario, ...traffic }), [scenario, traffic]);
  const key = keyOf(sc, strategies, seedCount);
  const stale = st.key !== key;

  // Run automatically when the screen opens (or the settings change); it takes a few seconds at most.
  useEffect(() => {
    if (getState().key !== key) runCompare(sc, strategies, seedCount);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const out = !stale && st.status === 'done' ? st.out : null;
  const running = stale || st.status === 'running';

  return (
    <div className="dock cmp">
      <div className="cmp-head">
        <h2>Compare Strategies</h2>
        <div className="cmp-controls">
          <div className="field"><label>Traffic</label>
            <TrafficPicker value={traffic} onChange={setTraffic} />
          </div>
          <div className="field"><label>Seeds</label>
            <div className="seg">{SEED_OPTIONS.map((n) => <button key={n} className={seedCount === n ? 'on' : ''} onClick={() => setSeedCount(n)}>{n}</button>)}</div>
          </div>
          <label className="cmp-check"><input type="checkbox" checked={ablations} onChange={(e) => setAblations(e.target.checked)} /> include ablations C1, C2</label>
          <button className="btn" disabled={running} onClick={() => runCompare(sc, strategies, seedCount)}>{'↻'} Re-run</button>
        </div>
      </div>

      {running && (
        <div className="glass card cmp-progress" role="status">
          Running {strategies.length * seedCount} headless simulations in a background worker…
          <div className="bar"><i style={{ width: `${Math.round((stale ? 0 : st.progress) * 100)}%` }} /></div>
        </div>
      )}
      {st.status === 'error' && !stale && <div className="glass card" role="alert">Comparison failed: {st.error}</div>}

      {out && <Results out={out} strategies={strategies} />}

      <p className="note cmp-foot">
        Each strategy runs on the same {seedCount} consecutive seeds (starting at {scenario.seed}) so traffic is identical before the ambulance appears. Values are mean ± standard deviation. Improvement is measured against Strategy A, and a worse result is shown as worse.
        Browser mini-simulator: not SUMO results. Simulated six-junction grid, simplified driver behaviour, no real-world validation.
      </p>
    </div>
  );
});

const Results = memo(function Results({ out, strategies }) {
  const text = useMemo(() => summarise(out), [out]);
  const barsFor = (key) => strategies.map((s) => {
    const c = cell(out, s, MK[key]);
    return { id: s, value: c && c.mean !== null ? c.mean : null, sd: c ? c.sd : 0, note: c && c.n < c.of ? `${c.n}/${c.of}` : '' };
  });
  const scatter = strategies.map((s) => {
    const a = cell(out, s, MK.ambTravelTime);
    const w = cell(out, s, MK.avgWait);
    return { id: s, x: a && a.mean !== null ? a.mean : null, y: w && w.mean !== null ? w.mean : null };
  });
  return (
    <>
      <p className="glass card cmp-summary" role="status">{text}</p>

      <div className="cmp-cards">
        {strategies.map((s) => {
          const c = cell(out, s, MK.ambTravelTime);
          const p = improvement(out, s, MK.ambTravelTime);
          return (
            <div key={s} className="glass card cmp-card" style={{ borderTopColor: STRAT_COLOR[s] }}>
              <div className="cmp-card-name"><b>{s}</b> {STRATEGIES[s].name}</div>
              <div className="cmp-card-big">{c && c.mean !== null ? c.mean.toFixed(1) : '—'}<small> s ambulance</small></div>
              <div className={`cmp-card-tag ${p === null ? '' : p >= 0.5 ? 'good' : p <= -0.5 ? 'bad' : ''}`}>{s === 'A' ? 'baseline' : improvementText(p) + ' than A'}</div>
            </div>
          );
        })}
      </div>

      <div className="glass card cmp-tablewrap">
        <table className="cmp-table">
          <thead>
            <tr><th>Metric</th>{strategies.map((s) => <th key={s}>{s} · {STRATEGIES[s].short}</th>)}</tr>
          </thead>
          <tbody>
            {METRICS.map((m) => (
              <tr key={m.key}>
                <th scope="row">{m.label}<span className="dir">{m.higher ? 'higher is better' : 'lower is better'}</span></th>
                {strategies.map((s) => {
                  const c = cell(out, s, m);
                  const p = improvement(out, s, m);
                  return (
                    <td key={s}>
                      <div>{valueText(c, m)}</div>
                      {c && c.n < c.of && !m.sum && <div className="sub">reached in {c.n} of {c.of} runs</div>}
                      {s !== 'A' && !m.sum && (p !== null
                        ? <div className={`sub ${p >= 0.5 ? 'good' : p <= -0.5 ? 'bad' : ''}`}>{improvementText(p)} vs A</div>
                        : <div className="sub">not compared with A (different runs reached)</div>)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="cmp-charts">
        <div className="glass card"><h3>Ambulance travel time</h3>
          <BarChart title="Ambulance travel time by strategy" unit="s" colors={STRAT_COLOR} clusters={[{ label: 'mean ± sd, lower is better', bars: barsFor('ambTravelTime') }]} />
        </div>
        <div className="glass card"><h3>Car waiting</h3>
          <BarChart title="Average and longest wait by strategy" unit="s" colors={STRAT_COLOR} clusters={[{ label: 'average wait', bars: barsFor('avgWait') }, { label: 'longest wait', bars: barsFor('longestWait') }]} />
        </div>
        <div className="glass card"><h3>Max queue and recovery</h3>
          <div className="cmp-two">
            <BarChart title="Max queue by strategy" unit="veh" colors={STRAT_COLOR} width={165} clusters={[{ label: 'max queue', bars: barsFor('maxQueue') }]} />
            <BarChart title="Queue recovery time by strategy" unit="s" colors={STRAT_COLOR} width={165} clusters={[{ label: 'recovery', bars: barsFor('recoveryTime') }]} />
          </div>
          <div className="note">Recovery is only counted when the queue returned to its pre-ambulance level; "n/of" shows how many runs reached it.</div>
        </div>
        <div className="glass card"><h3>Trade-off</h3>
          <TradeoffChart points={scatter} colors={STRAT_COLOR} xLabel="ambulance time (s)" yLabel="avg car wait (s)" />
          <div className="note">Each dot is one strategy's mean. Lower-left is better on both.</div>
        </div>
      </div>
    </>
  );
});
