import { memo, useEffect, useRef } from 'react';
import { ctrl } from './ctrl.js';

// Overview map. The canvas is drawn by the renderer every frame; this component only mounts it
// and turns pointer drags into camera moves (so React never re-renders per frame).
export const Minimap = memo(function Minimap({ style }) {
  const ref = useRef(null);
  useEffect(() => {
    ctrl.attachMinimap(ref.current);
    return () => ctrl.attachMinimap(null);
  }, []);
  const move = (e) => {
    const r = ref.current.getBoundingClientRect();
    const w = ctrl.minimapToWorld(e.clientX - r.left, e.clientY - r.top);
    if (w) ctrl.panToWorld(w[0], w[1]);
  };
  const down = (e) => {
    ref.current.setPointerCapture(e.pointerId);
    ref.current.dataset.drag = '1';
    move(e);
  };
  const mv = (e) => {
    if (ref.current.dataset.drag === '1') move(e);
  };
  const up = () => {
    ref.current.dataset.drag = '0';
  };
  return (
    <div className="minimap glass" style={style} title="Overview: drag or click to move the view">
      <div className="panel-title">Overview</div>
      <canvas ref={ref} onPointerDown={down} onPointerMove={mv} onPointerUp={up} onPointerCancel={up} />
    </div>
  );
});
