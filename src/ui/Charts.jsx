import { memo, useMemo } from 'react';

// Small live line chart (SVG, no library). Draws in once on mount, then updates in place.
export const LineChart = memo(function LineChart({ data, width = 240, height = 84, color = 'var(--teal)', xLabel = 'sim time (s)', yLabel = 'queued', markX = null }) {
  const m = { l: 26, r: 6, t: 6, b: 16 };
  const geo = useMemo(() => {
    if (!data || data.length < 2) return null;
    const x0 = data[0][0];
    const x1 = data[data.length - 1][0];
    let ymax = 4;
    for (const d of data) if (d[1] > ymax) ymax = d[1];
    ymax = Math.ceil(ymax / 4) * 4;
    const W = width - m.l - m.r;
    const H = height - m.t - m.b;
    const X = (x) => m.l + ((x - x0) / Math.max(1e-6, x1 - x0)) * W;
    const Y = (y) => m.t + H - (y / ymax) * H;
    const path = data.map((d, i) => `${i ? 'L' : 'M'}${X(d[0]).toFixed(1)},${Y(d[1]).toFixed(1)}`).join('');
    return { x0, x1, ymax, path, X, Y, H };
  }, [data, width, height]);
  if (!geo) {
    return <div className="note">Queue chart starts when the simulation runs.</div>;
  }
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Total queued vehicles over simulated time">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line className="grid" x1={m.l} x2={width - m.r} y1={geo.Y(geo.ymax * f)} y2={geo.Y(geo.ymax * f)} />
          <text x={m.l - 4} y={geo.Y(geo.ymax * f) + 3} textAnchor="end">{Math.round(geo.ymax * f)}</text>
        </g>
      ))}
      {markX !== null && markX >= geo.x0 && markX <= geo.x1 && (
        <g>
          <line x1={geo.X(markX)} x2={geo.X(markX)} y1={m.t} y2={m.t + geo.H} stroke="var(--amb-red)" strokeDasharray="2 2" opacity="0.7" />
          <text x={geo.X(markX) + (geo.X(markX) > width * 0.6 ? -3 : 3)} y={m.t + 8} textAnchor={geo.X(markX) > width * 0.6 ? 'end' : 'start'}>ambulance enters</text>
        </g>
      )}
      <path d={geo.path} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
      <text x={m.l} y={height - 3}>{Math.round(geo.x0)}</text>
      <text x={width - m.r} y={height - 3} textAnchor="end">{Math.round(geo.x1)} {xLabel}</text>
      <text x={m.l + 2} y={m.t + 2} opacity="0">{yLabel}</text>
    </svg>
  );
});

// Bar chart for the Compare screen. clusters: [{label, bars:[{id, value, sd, note}]}]. One shared scale.
export const BarChart = memo(function BarChart({ clusters, unit = '', title, colors, dec = 1, width = 330, height = 170 }) {
  const m = { l: 34, r: 8, t: 12, b: 34 };
  const W = width - m.l - m.r;
  const H = height - m.t - m.b;
  let ymax = 1;
  for (const c of clusters) for (const b of c.bars) if (b.value !== null) ymax = Math.max(ymax, b.value + (b.sd || 0));
  const step = ymax > 60 ? 20 : ymax > 20 ? 10 : ymax > 8 ? 5 : ymax > 3 ? 2 : 1;
  ymax = Math.ceil(ymax / step) * step;
  const Y = (v) => m.t + H - (v / ymax) * H;
  const cw = W / clusters.length;
  const ticks = [];
  for (let v = 0; v <= ymax; v += step) ticks.push(v);
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
      {ticks.map((v) => (
        <g key={v}>
          <line className="grid" x1={m.l} x2={width - m.r} y1={Y(v)} y2={Y(v)} />
          <text x={m.l - 4} y={Y(v) + 3} textAnchor="end">{v}</text>
        </g>
      ))}
      {clusters.map((c, ci) => {
        const bw = Math.min(30, (cw * 0.8) / c.bars.length);
        const x0 = m.l + ci * cw + (cw - bw * c.bars.length) / 2;
        return (
          <g key={c.label}>
            {c.bars.map((b, bi) => {
              const x = x0 + bi * bw;
              if (b.value === null) {
                return (
                  <g key={b.id}>
                    <text x={x + bw / 2} y={Y(0) - 4} textAnchor="middle" fill="var(--text-faint)">n/a</text>
                    <text x={x + bw / 2} y={Y(0) + 11} textAnchor="middle">{b.id}</text>
                  </g>
                );
              }
              return (
                <g key={b.id}>
                  <rect x={x + 1} y={Y(b.value)} width={bw - 2} height={Math.max(0, Y(0) - Y(b.value))} fill={colors[b.id]} rx="2" opacity="0.92" />
                  {b.sd > 0 && (
                    <g stroke="var(--text)" strokeWidth="1" opacity="0.75">
                      <line x1={x + bw / 2} x2={x + bw / 2} y1={Y(Math.max(0, b.value - b.sd))} y2={Y(b.value + b.sd)} />
                      <line x1={x + bw / 2 - 3} x2={x + bw / 2 + 3} y1={Y(b.value + b.sd)} y2={Y(b.value + b.sd)} />
                    </g>
                  )}
                  <text x={x + bw / 2} y={Y(b.value + (b.sd || 0)) - 3} textAnchor="middle" fill="var(--text)">{b.value.toFixed(dec)}</text>
                  <text x={x + bw / 2} y={Y(0) + 11} textAnchor="middle">{b.id}</text>
                  {b.note && <text x={x + bw / 2} y={Y(0) + 21} textAnchor="middle" fill="var(--text-faint)">{b.note}</text>}
                </g>
              );
            })}
            <text x={m.l + ci * cw + cw / 2} y={height - 3} textAnchor="middle" fill="var(--text-dim)">{c.label}</text>
          </g>
        );
      })}
      <text x={4} y={9} fill="var(--text-faint)">{unit}</text>
    </svg>
  );
});

// Trade-off scatter: x and y are both "lower is better"; each point is one strategy's mean.
export const TradeoffChart = memo(function TradeoffChart({ points, colors, xLabel, yLabel, width = 330, height = 170 }) {
  const m = { l: 34, r: 14, t: 12, b: 30 };
  const pts = points.filter((p) => p.x !== null && p.y !== null);
  if (!pts.length) return <div className="note">No finished runs to plot.</div>;
  const pad = (lo, hi) => {
    const s = Math.max(1, (hi - lo) * 0.25);
    return [Math.max(0, lo - s), hi + s];
  };
  const [x0, x1] = pad(Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x)));
  const [y0, y1] = pad(Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y)));
  const X = (v) => m.l + ((v - x0) / (x1 - x0)) * (width - m.l - m.r);
  const Y = (v) => height - m.b - ((v - y0) / (y1 - y0)) * (height - m.t - m.b);
  return (
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Trade-off: ${xLabel} against ${yLabel}`}>
      <line className="grid" x1={m.l} x2={width - m.r} y1={height - m.b} y2={height - m.b} />
      <line className="grid" x1={m.l} x2={m.l} y1={m.t} y2={height - m.b} />
      <text x={m.l} y={height - 16}>{x0.toFixed(0)}</text>
      <text x={width - m.r} y={height - 16} textAnchor="end">{x1.toFixed(0)}</text>
      <text x={(m.l + width - m.r) / 2} y={height - 3} textAnchor="middle" fill="var(--text-dim)">{xLabel}</text>
      <text x={m.l - 4} y={height - m.b} textAnchor="end">{y0.toFixed(0)}</text>
      <text x={m.l - 4} y={m.t + 8} textAnchor="end">{y1.toFixed(0)}</text>
      <text x={4} y={9} fill="var(--text-dim)">{yLabel}</text>
      {pts.map((p) => (
        <g key={p.id}>
          <circle cx={X(p.x)} cy={Y(p.y)} r="6" fill={colors[p.id]} />
          <text x={X(p.x) + 9} y={Y(p.y) + 3} fill="var(--text)">{p.id}</text>
        </g>
      ))}
    </svg>
  );
});
