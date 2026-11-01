import { memo, useEffect, useRef } from 'react';
import { prefersReducedMotion } from './hooks.js';

// Animated number. Writes straight into the DOM text node, so counting up/down never
// triggers React renders.
export const Num = memo(function Num({ value, digits = 1, suffix = '', dash = '—' }) {
  const ref = useRef(null);
  const cur = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const show = (x) => {
      cur.current = x;
      el.textContent = x.toFixed(digits) + suffix;
    };
    if (value === null || value === undefined || !Number.isFinite(value)) {
      cur.current = null;
      el.textContent = dash;
      return undefined;
    }
    const from = cur.current === null ? value : cur.current;
    if (from === value || prefersReducedMotion()) {
      show(value);
      return undefined;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / 450);
      const e = 1 - Math.pow(1 - k, 3);
      show(from + (value - from) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, digits, suffix, dash]);
  return <span ref={ref} className="mono" />;
});
