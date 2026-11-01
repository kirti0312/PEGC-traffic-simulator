import { memo } from 'react';
import { useRenderCount } from './hooks.js';

const LAMP = { G: 'var(--sig-green)', Y: 'var(--sig-amber)', R: 'var(--sig-red)' };

export const LegendPanel = memo(function LegendPanel({ signals, open, onToggle }) {
  useRenderCount('LegendPanel');
  return (
    <aside className={`legend glass ${open ? '' : 'closed'}`} aria-label="Legend">
      <div className="legend-head" onClick={onToggle} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onToggle()}>
        <span className="panel-title">Legend</span>
        <span className="dim">{open ? '‹' : '›'}</span>
      </div>
      {open && (
        <div className="legend-body">
          <div className="lg-row"><span className="lamp" style={{ background: LAMP.G, boxShadow: `0 0 6px ${LAMP.G}` }} />Green</div>
          <div className="lg-row"><span className="lamp" style={{ background: LAMP.Y, boxShadow: `0 0 6px ${LAMP.Y}` }} />Yellow</div>
          <div className="lg-row"><span className="lamp" style={{ background: LAMP.R, boxShadow: `0 0 6px ${LAMP.R}` }} />Red / all-red</div>
          <hr />
          <div className="lg-row"><span className="sw" style={{ background: '#f2f5f8', outline: '1px solid var(--amb-red)' }} />Ambulance</div>
          <div className="lg-row"><span className="dot" style={{ background: 'var(--queue)', boxShadow: '0 0 6px var(--queue)' }} />Queued vehicles</div>
          <div className="lg-row"><span className="sw" style={{ background: 'var(--teal)' }} />Ambulance route</div>
          <div className="lg-row"><span className="sw" style={{ background: 'repeating-linear-gradient(90deg,var(--blocked) 0 4px,#14181c 4px 8px)' }} />Blocked road</div>
          <div className="lg-row"><span className="sw" style={{ background: 'var(--median)', opacity: 0.8 }} />Median strip</div>
          <hr />
          <div className="panel-title">Junction signals</div>
          <div className="mini-sig">
            {signals.map((s) => (
              <span key={s.id} className="st" title={`${s.id}: ${s.greenAxis === 'H' ? 'east-west' : 'north-south'} ${s.phase === 'G' ? 'green' : s.phase === 'Y' ? 'yellow' : 'all-red'}`}>
                <span className="lamp" style={{ background: s.phase === 'G' ? LAMP.G : s.phase === 'Y' ? LAMP.Y : LAMP.R }} />
                {s.id} {s.greenAxis === 'H' ? 'EW' : 'NS'}
              </span>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
});
