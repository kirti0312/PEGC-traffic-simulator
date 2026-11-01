import { memo } from 'react';
import { ctrl } from './ctrl.js';
import { STRATEGIES, CONFIG, DENSITY_CHOICES, entryRate } from '../engine/config.js';
import { SPEEDS } from './places.js';
import { useRenderCount } from './hooks.js';

export const ControlBar = memo(function ControlBar({ snap, scenario, onStrategy, onLaunch }) {
  useRenderCount('ControlBar');
  const run = snap.mode === 'run';
  const density = snap.scenario.density;
  return (
    <div className="controlbar glass" role="toolbar" aria-label="Simulation controls">
      <div className="cb-group">
        {run ? (
          <button className="cb-btn on" onClick={() => ctrl.toggle()} disabled={snap.finished} title="Play / pause (space)">
            {snap.playing ? '❚❚ Pause' : '▶ Play'}
          </button>
        ) : (
          <button className="cb-btn primary" onClick={onLaunch}>{'▶'} Launch</button>
        )}
        <button className="cb-btn" onClick={() => ctrl.restart()} title="Restart this scenario with the same seed">{'↺'} Restart</button>
      </div>
      <div className="cb-group">
        <span className="cb-lab">Speed</span>
        {SPEEDS.map((s) => (
          <button key={s} className={`cb-btn ${snap.speed === s ? 'on' : ''}`} onClick={() => ctrl.setSpeed(s)}>{s}×</button>
        ))}
      </div>
      <div className="cb-group">
        <span className="cb-lab">Traffic</span>
        {DENSITY_CHOICES.map((d) => (
          <button key={d} className={`cb-btn ${density === d ? 'on' : ''}`} onClick={() => (d === 'custom' ? ctrl.setDensity('custom', entryRate(snap.scenario)) : ctrl.setDensity(d))}>{d}</button>
        ))}
        {density === 'custom' && (
          <input className="cb-rate" type="number" min={CONFIG.rateMin} max={CONFIG.rateMax} step={10} value={entryRate(snap.scenario)} aria-label="Custom traffic rate, vehicles per hour per entry point" title="Vehicles per hour per entry point"
            onChange={(e) => { const n = Math.round(Number(e.target.value)); if (Number.isFinite(n)) ctrl.setDensity('custom', Math.min(CONFIG.rateMax, Math.max(CONFIG.rateMin, n))); }} />
        )}
      </div>
      <div className="cb-group">
        <span className="cb-lab">Strategy</span>
        <select className="cb-select" value={scenario.strategy} onChange={(e) => onStrategy(e.target.value)} aria-label="Strategy">
          {Object.values(STRATEGIES).map((s) => (
            <option key={s.id} value={s.id}>{s.id} · {s.name}</option>
          ))}
        </select>
      </div>
      <div className="cb-group">
        <button className={`cb-btn ${snap.view === '3d' ? 'on' : ''}`} onClick={() => ctrl.setView('3d')}>3D</button>
        <button className={`cb-btn ${snap.view === '2d' ? 'on' : ''}`} onClick={() => ctrl.setView('2d')}>2D</button>
      </div>
      <div className="cb-group">
        <button className="cb-btn" onClick={() => ctrl.zoomOut()} title="Zoom out" aria-label="Zoom out">{'−'}</button>
        <button className="cb-btn" onClick={() => ctrl.zoomIn()} title="Zoom in" aria-label="Zoom in">+</button>
        <button className="cb-btn" onClick={() => ctrl.fitAll()} title="Smoothly return to the full six-junction overview (key 0)">Overview</button>
        <button className="cb-btn" onClick={() => ctrl.centerAmbulance()} disabled={!run || snap.ambDone} title="Glide to the ambulance (key C)">Center<span className="cb-long"> ambulance</span></button>
        <button className={`cb-btn ${snap.follow ? 'on' : ''}`} onClick={() => ctrl.setFollow(!snap.follow)} disabled={!run} title="Camera follows the ambulance">Follow<span className="cb-long"> ambulance</span></button>
      </div>
      <div className="cb-group">
        <button className="cb-btn" onClick={() => ctrl.setWheelMode(snap.wheelMode === 'zoom' ? 'move' : 'zoom')} title={snap.wheelMode === 'zoom' ? 'The wheel zooms the map. Click to make the wheel and touchpad scroll move the map instead (Ctrl+wheel or pinch always zooms).' : 'The wheel and touchpad scroll move the map. Click to make the wheel zoom instead (Ctrl+wheel or pinch always zooms).'}>Wheel: {snap.wheelMode === 'zoom' ? 'Zoom' : 'Move'}</button>
      </div>
      <span className="cb-hint" title="Move the map: drag with the mouse or use the arrow keys / WASD. Zoom: mouse wheel, + and - keys, or the buttons. 0 or Fit all shows the whole grid. Double-click resets the view.">scroll or drag to move · Ctrl+wheel to zoom</span>
      <span className="cb-seed" title="Random seed: same seed gives identical traffic">seed {snap.scenario.seed}</span>
    </div>
  );
});
