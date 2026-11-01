// Runs the "before" and "after" comparisons for the Stress Test off the main thread and keeps the
// last result and the user's choices, so leaving and returning to the screen loses nothing.
import { runComparison } from '../engine/runner.js';

let state = { status: 'idle', key: null, progress: 0, before: null, after: null, error: null, choice: null };
const subs = new Set();
let worker = null;
let nextId = 1;
let runToken = 0;
const pending = new Map(); // id -> { resolve, reject, onProgress }

function set(p) {
  state = { ...state, ...p };
  subs.forEach((f) => f());
}
export const subscribe = (f) => {
  subs.add(f);
  return () => subs.delete(f);
};
export const getState = () => state;
export const setChoice = (patch) => set({ choice: { ...state.choice, ...patch } });

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../engine/worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (ev) => {
      const d = ev.data;
      const p = pending.get(d.id);
      if (!p) return;
      if (d.type === 'progress') p.onProgress(d.done / d.total);
      else if (d.type === 'done') {
        pending.delete(d.id);
        p.resolve(d.out);
      } else if (d.type === 'error') {
        pending.delete(d.id);
        p.reject(new Error(d.message));
      }
    };
    worker.onerror = () => {
      const ps = [...pending.values()];
      pending.clear();
      worker = null;
      ps.forEach((p) => p.reject(new Error('worker-failed')));
    };
  }
  return worker;
}

function compareOnce(scenario, strategies, seedCount, onProgress) {
  const attempt = () =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject, onProgress });
      getWorker().postMessage({ id, scenario, strategies, seedCount });
    });
  return attempt().catch((e) => {
    if (e.message !== 'worker-failed') throw e;
    // main-thread fallback
    return new Promise((resolve) => setTimeout(() => resolve(runComparison(scenario, strategies, seedCount)), 20));
  });
}

// before: scenario; after: stressed scenario or null (no route: nothing to compare after).
export async function runStress({ key, before, after, strategies, seedCount }) {
  const token = ++runToken;
  set({ status: 'running', key, progress: 0, before: null, after: null, error: null });
  const prog = [0, 0];
  const upd = () => token === runToken && set({ progress: (prog[0] + prog[1]) / (after ? 2 : 1) });
  try {
    const jobs = [compareOnce(before, strategies, seedCount, (v) => ((prog[0] = v), upd()))];
    if (after) jobs.push(compareOnce(after, strategies, seedCount, (v) => ((prog[1] = v), upd())));
    const [b, a] = await Promise.all(jobs);
    if (token === runToken) set({ status: 'done', before: b, after: a || null, progress: 1 });
  } catch (e) {
    if (token === runToken) set({ status: 'error', error: String(e.message || e) });
  }
}

export function stressKey(before, after, strategies, seedCount) {
  return JSON.stringify([before, after, strategies, seedCount]);
}
