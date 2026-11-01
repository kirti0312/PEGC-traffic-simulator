// Reads the design tokens from CSS variables once so the canvas and the UI share one palette.
const FALLBACK = {
  '--ground': '#11181e',
  '--ground-2': '#171f26',
  '--pavement': '#1a232a',
  '--kerb': '#56626b',
  '--road': '#2c363e',
  '--lane': '#e6eaee',
  '--median': '#c9dc4a',
  '--sig-red': '#ff4d4d',
  '--sig-amber': '#ffc233',
  '--sig-green': '#3be37a',
  '--tree': '#5d8a3c',
  '--tree-dark': '#3a5a28',
  '--trunk': '#3b2f26',
  '--teal': '#1fb5a5',
  '--purple': '#6a3fd0',
  '--amb-blue': '#3b82ff',
  '--amb-red': '#ff3b3b',
  '--queue': '#ffb347',
  '--blocked': '#ff6b4a',
};

export function readTheme() {
  const out = {};
  let cs = null;
  try {
    cs = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  } catch {
    cs = null;
  }
  for (const k of Object.keys(FALLBACK)) {
    const v = cs ? cs.getPropertyValue(k).trim() : '';
    out[k.slice(2)] = v || FALLBACK[k];
  }
  return out;
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export function shade(hex, f) {
  const [r, g, b] = hexToRgb(hex);
  const m = (c) => Math.max(0, Math.min(255, Math.round(c * f)));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

// Blend colour a toward colour b by t (0 = a, 1 = b); returns a hex colour (so results can be mixed again).
export function mix(a, b, t) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const m = (x, y) => Math.max(0, Math.min(255, Math.round(x + (y - x) * t)));
  const h = (v) => v.toString(16).padStart(2, '0');
  return `#${h(m(r1, r2))}${h(m(g1, g2))}${h(m(b1, b2))}`;
}
