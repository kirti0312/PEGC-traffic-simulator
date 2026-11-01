import { useSyncExternalStore, useEffect, useRef } from 'react';
import { ctrl } from './ctrl.js';

// Throttled snapshot (about 5 per second) from the controller. Never per frame.
export function useSnapshot() {
  return useSyncExternalStore(ctrl.subscribe, ctrl.getSnapshot);
}

// Dev render counter: window.__renders = { ComponentName: count }
export function useRenderCount(name) {
  if (typeof window !== 'undefined') {
    const r = (window.__renders = window.__renders || {});
    r[name] = (r[name] || 0) + 1;
  }
}

export function prefersReducedMotion() {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useInterval(fn, ms) {
  const f = useRef(fn);
  f.current = fn;
  useEffect(() => {
    const id = setInterval(() => f.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}
