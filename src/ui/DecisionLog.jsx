import { memo } from 'react';
import { ctrl } from './ctrl.js';
import { useRenderCount } from './hooks.js';

const MAX_SHOWN = 60;

export const DecisionLog = memo(function DecisionLog({ total, strategy, open, onToggle }) {
  useRenderCount('DecisionLog');
  // read straight from the engine's capped log (last 400); show the newest entries only
  const all = ctrl.getLog();
  const items = all.slice(-MAX_SHOWN);
  return (
    <section className={`logpanel glass ${open ? '' : 'closed'}`} aria-label="Decision log">
      <div className="log-head" onClick={onToggle} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onToggle()}>
        <span className="panel-title">Decision log <span className="faint">({total} events)</span></span>
        <span className="dim">{open ? '⌄' : '⌃'}</span>
      </div>
      {open && (items.length === 0 ? (
        <div className="log-empty">
          {strategy === 'A'
            ? 'Strategy A ignores the ambulance, so it makes no decisions. Entries appear here when the ambulance clears a junction.'
            : 'No events yet. The ambulance enters after the 60 s warm-up; controller decisions, safety-layer actions and recovery steps are logged here from real values.'}
        </div>
      ) : (
        <div className="log-list">
          {items.map((e) => (
            <div key={e.id} className={`log-item ${e.kind}`}>
              <span className="t">{e.t.toFixed(1)}s</span>{e.text}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
});
