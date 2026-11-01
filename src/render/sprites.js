import { rgba, shade } from './theme.js';

const PPM = 16; // sprite pixels per metre

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

const CAR_COLORS = ['#23282d', '#1b1f23', '#31373d', '#262d36', '#2c2a29', '#202830'];

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function carTop(color, len, wid) {
  const w = Math.ceil(len * PPM);
  const h = Math.ceil(wid * PPM);
  const c = makeCanvas(w, h);
  const x = c.getContext('2d');
  x.fillStyle = color;
  roundRect(x, 0, 0, w, h, h * 0.28);
  x.fill();
  // roof highlight and glass
  x.fillStyle = 'rgba(255,255,255,0.10)';
  roundRect(x, w * 0.3, h * 0.1, w * 0.36, h * 0.8, h * 0.18);
  x.fill();
  x.fillStyle = 'rgba(15,22,28,0.82)';
  roundRect(x, w * 0.58, h * 0.12, w * 0.15, h * 0.76, h * 0.12); // windscreen
  x.fill();
  roundRect(x, w * 0.14, h * 0.14, w * 0.12, h * 0.72, h * 0.1); // rear glass
  x.fill();
  // lamps
  x.fillStyle = 'rgba(255,240,200,0.95)';
  x.fillRect(w - 3, h * 0.12, 3, h * 0.2);
  x.fillRect(w - 3, h * 0.68, 3, h * 0.2);
  x.fillStyle = 'rgba(190,40,40,0.9)';
  x.fillRect(0, h * 0.12, 3, h * 0.2);
  x.fillRect(0, h * 0.68, 3, h * 0.2);
  return c;
}

function ambTop(len, wid) {
  const w = Math.ceil(len * PPM);
  const h = Math.ceil(wid * PPM);
  const c = makeCanvas(w, h);
  const x = c.getContext('2d');
  x.fillStyle = '#f2f5f8';
  roundRect(x, 0, 0, w, h, h * 0.22);
  x.fill();
  x.fillStyle = '#d33b3b';
  x.fillRect(w * 0.12, h * 0.42, w * 0.58, h * 0.16);
  x.fillStyle = 'rgba(20,30,40,0.85)';
  roundRect(x, w * 0.76, h * 0.12, w * 0.13, h * 0.76, h * 0.1);
  x.fill();
  // red cross on the roof
  x.fillStyle = '#d33b3b';
  x.fillRect(w * 0.36, h * 0.28, w * 0.12, h * 0.44);
  x.fillRect(w * 0.3, h * 0.4, w * 0.24, h * 0.2);
  x.fillStyle = 'rgba(255,240,200,0.95)';
  x.fillRect(w - 3, h * 0.12, 3, h * 0.2);
  x.fillRect(w - 3, h * 0.68, 3, h * 0.2);
  return c;
}

function solid(color, len, wid) {
  const w = Math.ceil(len * PPM);
  const h = Math.ceil(wid * PPM);
  const c = makeCanvas(w, h);
  const x = c.getContext('2d');
  x.fillStyle = color;
  roundRect(x, 0, 0, w, h, h * 0.28);
  x.fill();
  return c;
}

function radial(rgb, size, a0 = 0.9) {
  const c = makeCanvas(size, size);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${rgb},${a0})`);
  g.addColorStop(0.35, `rgba(${rgb},${a0 * 0.35})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}

function beam(len, wid) {
  const w = Math.ceil(len * PPM);
  const h = Math.ceil(wid * PPM);
  const c = makeCanvas(w, h);
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(255,244,214,0.55)');
  g.addColorStop(1, 'rgba(255,244,214,0)');
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(0, h * 0.4);
  x.lineTo(w, 0);
  x.lineTo(w, h);
  x.lineTo(0, h * 0.6);
  x.closePath();
  x.fill();
  return c;
}

function tree(variant, th) {
  const W = 128;
  const H = 176;
  const c = makeCanvas(W, H);
  const x = c.getContext('2d');
  // trunk
  x.fillStyle = th.trunk;
  x.fillRect(W / 2 - 4, H - 46, 8, 46);
  const tiers = variant === 0 ? 3 : variant === 1 ? 4 : 2;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const y = H - 40 - i * (variant === 2 ? 52 : 34);
    const w = (variant === 2 ? 56 : 52) * (1 - t * 0.45);
    const col = i % 2 ? shade(th.tree, 0.82) : th.tree;
    // low-poly: two shaded halves
    x.fillStyle = col;
    x.beginPath();
    x.moveTo(W / 2, y - 56);
    x.lineTo(W / 2 - w, y);
    x.lineTo(W / 2, y + 6);
    x.closePath();
    x.fill();
    x.fillStyle = shade(th.tree, 0.62);
    x.beginPath();
    x.moveTo(W / 2, y - 56);
    x.lineTo(W / 2 + w, y);
    x.lineTo(W / 2, y + 6);
    x.closePath();
    x.fill();
  }
  return c;
}

function treeTop(th) {
  const S = 96;
  const c = makeCanvas(S, S);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(S * 0.42, S * 0.4, 4, S / 2, S / 2, S / 2);
  g.addColorStop(0, th.tree);
  g.addColorStop(1, shade(th.tree, 0.55));
  x.fillStyle = g;
  x.beginPath();
  x.arc(S / 2, S / 2, S * 0.46, 0, Math.PI * 2);
  x.fill();
  return c;
}

export function makeSprites(th) {
  const len = 4.5;
  const wid = 1.95;
  const cars = CAR_COLORS.map((c) => carTop(c, len, wid));
  const sides = CAR_COLORS.map((c) => solid(shade(c, 0.5), len, wid));
  return {
    cars,
    sides,
    carShadow: solid('rgba(0,0,0,0.55)', len + 0.6, wid + 0.5),
    amb: ambTop(6.5, 2.3),
    ambSide: solid('#8a9099', 6.5, 2.3),
    ambShadow: solid('rgba(0,0,0,0.55)', 7.1, 2.8),
    beam: beam(15, 7),
    glowRed: radial('255,60,60', 64, 0.85),
    glowBlue: radial('70,120,255', 128, 0.9),
    glowWarm: radial('255,214,150', 128, 0.5),
    glowWhite: radial('255,255,255', 64, 0.8),
    glowGreen: radial('59,227,122', 64, 0.9),
    glowAmber: radial('255,194,51', 64, 0.9),
    trees: [tree(0, th), tree(1, th), tree(2, th)],
    treeTop: treeTop(th),
    PPM,
    treeW: 128,
    treeH: 176,
  };
}
