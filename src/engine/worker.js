// Web Worker entry: runs headless comparisons off the main thread.
import { runComparison } from './runner.js';

self.onmessage = (ev) => {
  const { id, scenario, strategies, seedCount } = ev.data;
  try {
    const out = runComparison(scenario, strategies, seedCount, (done, total) => {
      self.postMessage({ id, type: 'progress', done, total });
    });
    self.postMessage({ id, type: 'done', out });
  } catch (err) {
    self.postMessage({ id, type: 'error', message: String(err && err.message ? err.message : err) });
  }
};
