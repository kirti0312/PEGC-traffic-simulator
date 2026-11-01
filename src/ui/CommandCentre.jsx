import { memo } from 'react';
import { Num } from './Num.jsx';
import { useRenderCount } from './hooks.js';

export const CommandCentre = memo(function CommandCentre({ snap, onLaunch, onNav }) {
  useRenderCount('CommandCentre');
  const m = snap.metrics;
  return (
    <div className="cc-hero">
      <div className="glass card idle-breathe">
        <div className="panel-title">Command Centre</div>
        <h1 style={{ margin: '6px 0 8px' }}>Clear a path for the ambulance without gridlocking the city.</h1>
        <p className="note">Same traffic, same route, three signal strategies: fixed-time, basic priority and PEGC (predictive, queue-aware). Launch a run to watch it, or compare all three on measured data.</p>
      </div>
      <div className="glass card">
        <div className="panel-title" style={{ marginBottom: 8 }}>Live city (ordinary traffic)</div>
        <div className="cc-live">
          <div className="kpi"><div className="v"><Num value={snap.vehicleCount} digits={0} /></div><div className="l">vehicles</div></div>
          <div className="kpi"><div className="v"><Num value={m.totalQueued} digits={0} /></div><div className="l">queued now</div></div>
          <div className="kpi"><div className="v"><Num value={m.avgWait} /><small>s</small></div><div className="l">avg wait</div></div>
        </div>
        <p className="note" style={{ marginTop: 8 }}>Simulated six-junction grid, fixed-time signals, no ambulance. These are live numbers from this browser simulation.</p>
      </div>
      <div className="row">
        <button className="btn primary big" onClick={onLaunch}>Launch simulation</button>
      </div>
      <div className="cc-nav">
        <button className="btn" onClick={() => onNav('configure')}>Configure scenario</button>
        <button className="btn" onClick={() => onNav('compare')}>Compare strategies</button>
        <button className="btn" onClick={() => onNav('stress')}>Stress test</button>
        <button className="btn" onClick={() => onNav('watch')}>Watch simulation</button>
      </div>
      <div className="limits"><b>Limitations:</b> simulated six-junction grid, simplified driver behaviour, no real-world validation.</div>
    </div>
  );
});
