import { memo, useEffect, useMemo } from 'react';
import { ctrl } from './ctrl.js';
import { STRATEGIES, defaultScenario } from '../engine/config.js';
import { TrafficPicker } from './TrafficPicker.jsx';
import { previewRoute } from '../engine/runner.js';
import { BOUNDARY_IDS, SEGMENTS, placeLabel } from './places.js';
import { useRenderCount } from './hooks.js';

export const ConfigureScreen = memo(function ConfigureScreen({ scenario, setScenario, onLaunch }) {
  useRenderCount('ConfigureScreen');
  const set = (k, v) => setScenario({ ...scenario, [k]: v });
  const route = useMemo(() => previewRoute(scenario), [scenario.origin, scenario.dest, scenario.blocked]);
  const same = scenario.origin === scenario.dest;

  // live preview on the map
  useEffect(() => {
    ctrl.setOverlay({ routes: route ? [{ nodes: route, style: 'main' }] : [], blocked: scenario.blocked, origin: scenario.origin, dest: scenario.dest });
    return () => ctrl.clearOverlay();
  }, [route, scenario.blocked, scenario.origin, scenario.dest]);
  useEffect(() => {
    ctrl.fitAll();
  }, []);

  const toggleBlock = (id) => set('blocked', scenario.blocked.includes(id) ? scenario.blocked.filter((x) => x !== id) : [...scenario.blocked, id]);
  const msg = same ? 'Origin and destination must differ.' : !route ? 'No route exists for this origin, destination and set of blocked roads. The simulation will run ordinary traffic only and report that there is no route.' : null;
  const sel = (key, label) => (
    <div className="field">
      <label>{label}</label>
      <select value={scenario[key]} onChange={(e) => set(key, e.target.value)}>
        {BOUNDARY_IDS.map((id) => (<option key={id} value={id}>{placeLabel(id)}</option>))}
      </select>
    </div>
  );
  return (
    <div className="screen over">
      <div className="side glass card" style={{ height: 'calc(100% - 6px)', overflow: 'auto' }}>
        <h2>Configure scenario</h2>
        <p className="note" style={{ margin: '6px 0 14px' }}>One scenario object is reused by every strategy, so comparisons use the same network, traffic, route, blocked roads and seed.</p>
        {sel('origin', 'Ambulance origin')}
        {sel('dest', 'Ambulance destination')}
        <div className="field">
          <label>Traffic density (vehicles/h per entry point)</label>
          <TrafficPicker value={{ density: scenario.density, rate: scenario.rate }} onChange={(v) => setScenario({ ...scenario, ...v })} />
        </div>
        <div className="field">
          <label>Random seed</label>
          <div className="row">
            <input type="number" value={scenario.seed} min={1} step={1} onChange={(e) => set('seed', Math.max(1, Math.floor(Number(e.target.value) || 1)))} style={{ width: 100 }} />
            <button className="btn" onClick={() => set('seed', 1 + Math.floor(Math.random() * 99999))}>Random</button>
          </div>
        </div>
        <div className="field">
          <label>Strategy to watch</label>
          <select value={scenario.strategy} onChange={(e) => set('strategy', e.target.value)}>
            {Object.values(STRATEGIES).map((s) => (<option key={s.id} value={s.id}>{s.id} · {s.name}</option>))}
          </select>
        </div>
        <div className="field">
          <label>Blocked roads ({scenario.blocked.length})</label>
          <div className="chips">
            {SEGMENTS.map((s) => (<button key={s.id} className={`chip ${scenario.blocked.includes(s.id) ? 'on' : ''}`} onClick={() => toggleBlock(s.id)}>{s.label}</button>))}
          </div>
        </div>
        {msg && <div className="warnbox" style={{ marginBottom: 12 }}>{msg}</div>}
        <div className="row">
          <button className="btn primary" onClick={onLaunch}>Launch with these settings</button>
          <button className="btn" onClick={() => setScenario({ ...defaultScenario() })}>Reset</button>
        </div>
      </div>
    </div>
  );
});
