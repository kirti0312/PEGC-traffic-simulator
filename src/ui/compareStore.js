// Runs the A/B/C comparison off the main thread (Web Worker) and keeps the last result, so
// leaving and re-opening the Compare screen does not lose it. Falls back to the main thread.
import { runComparison } from '../engine/runner.js';
import { entryRate } from '../engine/config.js';

let state = { status: 'idle', key: null, progress: 0, out: null, error: null };
const subs = new Set();
let worker = null;
let reqId = 0;

function set(p) {
  state = { ...state, ...p };
  subs.forEach((f) => f());
}
export const subscribe = (f) => {
  subs.add(f);
  return () => subs.delete(f);
};
export const getState = () => state;

export function keyOf(scenario, strategies, seedCount) {
  return JSON.stringify([scenario.origin, scenario.dest, scenario.density, entryRate(scenario), [...scenario.blocked].sort(), scenario.seed, seedCount, strategies]);
}

function fallback(id, scenario, strategies, seedCount) {
  setTimeout(() => {
    if (id !== reqId) return;
    try {
      const out = runComparison(scenario, strategies, seedCount);
      if (id === reqId) set({ status: 'done', out, progress: 1 });
    } catch (e) {
      set({ status: 'error', error: String(e.message || e) });
    }
  }, 30);
}

export function runCompare(scenario, strategies, seedCount) {
  const id = ++reqId;
  const sc = { ...scenario, blocked: [...scenario.blocked] };
  set({ status: 'running', key: keyOf(sc, strategies, seedCount), progress: 0, out: null, error: null });
  try {
    if (!worker) {
      worker = new Worker(new URL('../engine/worker.js', import.meta.url), { type: 'module' });
    }
    worker.onmessage = (ev) => {
      const d = ev.data;
      if (d.id !== reqId) return;
      if (d.type === 'progress') set({ progress: d.done / d.total });
      else if (d.type === 'done') set({ status: 'done', out: d.out, progress: 1 });
      else if (d.type === 'error') set({ status: 'error', error: d.message });
    };
    worker.onerror = () => {
      worker = null;
      fallback(id, sc, strategies, seedCount);
    };
    worker.postMessage({ id, scenario: sc, strategies, seedCount });
  } catch {
    worker = null;
    fallback(id, sc, strategies, seedCount);
  }
}
