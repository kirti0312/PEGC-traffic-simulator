import { memo } from 'react';
import { ctrl } from './ctrl.js';
import { STRATEGIES, trafficLabel } from '../engine/config.js';
import { useRenderCount } from './hooks.js';

const f = (x, d = 1, u = '') => (x === null || x === undefined ? 'not reached' : `${x.toFixed(d)}${u}`);

export const SummaryCard = memo(function SummaryCard({ snap, scenario, onCompare, onClose }) {
  useRenderCount('SummaryCard');
  const m = snap.metrics;
  const s = snap.scenario;
  const rows = [
    ['Ambulance travel time', snap.status === 'no-route' ? 'no route' : m.ambFinished ? f(m.ambTravelTime, 1, ' s') : 'did not arrive in time'],
    ['Ambulance stops', m.ambStops],
    ['Avg wait (ordinary)', f(m.avgWait, 1, ' s')],
    ['Longest single wait', f(m.longestWait, 1, ' s')],
    ['Max queue (one approach)', m.maxQueue],
    ['Throughput', `${m.throughput.toFixed(0)} veh/h`],
    ['Recovery time', f(m.recoveryTime, 1, ' s')],
    ['Safety violations', m.violations],
  ];
  return (
    <div className="summary glass" role="dialog" aria-label="Simulation summary">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 style={{ fontSize: 15 }}>Run summary</h3>
        <span className="badge strat">Strategy {snap.strategy} · {STRATEGIES[snap.strategy].name}</span>
      </div>
      <div className="sum-grid">
        {rows.map(([k, v]) => (<div key={k}><span className="dim">{k}</span><b className="mono">{v}</b></div>))}
      </div>
      <p className="note"><b>Scenario:</b> {s.origin} → {s.dest}, {trafficLabel(s)} traffic{snap.densityChanged ? ' (changed mid-run)' : ''}, seed {s.seed}, blocked roads: {s.blocked.length ? s.blocked.join(', ') : 'none'}. Horizon {m.time.toFixed(0)} s. Browser mini-simulator: not SUMO results.</p>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={() => ctrl.restart()}>Run again</button>
        <button className="btn" onClick={onCompare}>Compare strategies</button>
        <button className="btn" onClick={onClose}>Close</button>
      </div>
      <span hidden>{scenario.seed}</span>
    </div>
  );
});
