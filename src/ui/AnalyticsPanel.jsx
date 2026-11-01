import { memo } from 'react';
import { Num } from './Num.jsx';
import { LineChart } from './Charts.jsx';
import { useRenderCount } from './hooks.js';
import { CONFIG } from '../engine/config.js';

function Kpi({ label, children, cls = '', tag }) {
  return (
    <div className={`kpi ${cls}`}>
      <div className="v">{children}</div>
      <div className="l">{label}{tag && <span className="tag rb">{tag}</span>}</div>
    </div>
  );
}

export const AnalyticsPanel = memo(function AnalyticsPanel({ snap, open, onToggle }) {
  useRenderCount('AnalyticsPanel');
  const m = snap.metrics;
  const run = !snap.ambient;
  const noRoute = snap.status === 'no-route';
  let recovery;
  if (m.recoveryTime !== null) recovery = <Num value={m.recoveryTime} suffix=" s" />;
  else if (snap.finished && run) recovery = <span className="bad">not reached</span>;
  else if (snap.ambCleared) recovery = <span className="dim">measuring…</span>;
  else recovery = <span className="dim">—</span>;
  return (
    <aside className={`analytics glass ${open ? '' : 'closed'}`} aria-label="Overall analytics">
      <div className="an-head" onClick={onToggle} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onToggle()}>
        <span className="panel-title">Overall analytics</span>
        <span className="dim mono">{open ? 'sim ' : ''}{open ? <Num value={snap.t} digits={0} suffix=" s" /> : '›'}</span>
      </div>
      {open && (
        <div className="an-body">
          {noRoute && <div className="warnbox">No route exists for this origin, destination and blocked roads. Ordinary traffic still runs; there is no ambulance to measure.</div>}
          {run && !noRoute && (
            <div className="kpis">
              <Kpi label="Ambulance time" cls="hi">
                {snap.ambActive || snap.ambDone ? <><Num value={m.ambTravelTime} /><small>s</small></> : <span className="dim">waiting</span>}
              </Kpi>
              <Kpi label="Live ETA to destination" tag="rule-based estimate">
                {snap.ambActive ? <><Num value={snap.ambEta} /><small>s</small></> : <span className="dim">—</span>}
              </Kpi>
              <Kpi label="Ambulance stops"><Num value={snap.ambActive || snap.ambDone ? m.ambStops : null} digits={0} /></Kpi>
              <Kpi label={snap.ambNext ? `Next junction · ${Math.round(snap.ambNext.dStop)} m · queue ${snap.ambNext.nQueue}` : 'Next junction'}>
                {snap.ambNext ? snap.ambNext.junction : <span className="dim">—</span>}
              </Kpi>
            </div>
          )}
          <div className="kpis">
            <Kpi label="Avg wait (ordinary)"><Num value={m.avgWait} /><small>s</small></Kpi>
            <Kpi label="Longest single wait"><Num value={m.longestWait} /><small>s</small></Kpi>
            <Kpi label="Queued now"><Num value={m.totalQueued} digits={0} /></Kpi>
            <Kpi label="Max queue (one approach)"><Num value={m.maxQueue} digits={0} /></Kpi>
            <Kpi label="Throughput"><Num value={m.throughput} digits={0} /><small>veh/h</small></Kpi>
            <Kpi label="Vehicles on map"><Num value={snap.vehicleCount} digits={0} /></Kpi>
            {run && <Kpi label="Recovery time">{recovery}</Kpi>}
            {run && <Kpi label="Safety violations" cls={m.violations ? 'badv' : ''}><Num value={m.violations} digits={0} /></Kpi>}
          </div>
          <div>
            <div className="panel-title" style={{ marginBottom: 4 }}>Total queued vehicles</div>
            <LineChart data={snap.series} markX={run && !noRoute ? CONFIG.warmup : null} />
          </div>
          {run && (
            <p className="note">
              <b>Recovery rule</b> (same for every strategy): time after the ambulance leaves its last junction until total queued vehicles stay within {CONFIG.recoveryTolerance} of the pre-ambulance average for {CONFIG.recoverySustain} s.
              {m.recoveryBaseline !== null && <> Baseline this run: {m.recoveryBaseline.toFixed(1)} queued.</>}
            </p>
          )}
          {snap.densityChanged && <div className="warnbox">Traffic density was changed during this run, so these numbers are not comparable with a run at the original density.</div>}
        </div>
      )}
    </aside>
  );
});
