export function makeVehicle(id, kind, route, cfg, attrs = {}) {
  const amb = kind === 'amb';
  return {
    id,
    kind,
    route,
    ri: 0,
    edge: route[0],
    prevEdge: null,
    s: 0, // front bumper position along the current edge
    v: 0,
    len: amb ? cfg.ambLength : cfg.carLength,
    vmax: amb ? cfg.ambMaxSpeed : attrs.vmax,
    accel: amb ? cfg.ambAccel : cfg.accel,
    color: attrs.color | 0,
    commit: false,
    braking: false,
    stamp: -1,
    x: 0,
    y: 0,
    h: 0,
    px: 0,
    py: 0,
    ph: 0,
    waitTotal: 0,
    streak: 0,
    stopped: false,
    stops: 0,
    tEnter: 0,
    destId: route[route.length - 1].to,
  };
}

function pointOn(e, s, lane) {
  return [e.a.x + e.ux * s + e.rx * lane, e.a.y + e.uy * s + e.ry * lane];
}

function boxBezier(v, prevE, nextE, u, cfg) {
  const lane = cfg.laneOffset;
  const jh = cfg.junctionHalf;
  const p0 = pointOn(prevE, prevE.stopLine, lane);
  const p2 = pointOn(nextE, jh, lane);
  let cx;
  let cy;
  if (prevE.axis !== nextE.axis) {
    if (prevE.axis === 'H') {
      cx = p2[0];
      cy = p0[1];
    } else {
      cx = p0[0];
      cy = p2[1];
    }
  } else {
    cx = (p0[0] + p2[0]) / 2;
    cy = (p0[1] + p2[1]) / 2;
  }
  const w = 1 - u;
  v.x = w * w * p0[0] + 2 * w * u * cx + u * u * p2[0];
  v.y = w * w * p0[1] + 2 * w * u * cy + u * u * p2[1];
  const dx = 2 * w * (cx - p0[0]) + 2 * u * (p2[0] - cx);
  const dy = 2 * w * (cy - p0[1]) + 2 * u * (p2[1] - cy);
  v.h = Math.atan2(dy, dx);
}

// Writes the world pose (centre x, y and heading) of a vehicle. Turns follow a quadratic curve
// through the junction box so cornering looks smooth.
export function setPose(v, cfg) {
  const e = v.edge;
  const jh = cfg.junctionHalf;
  const p = v.s - v.len / 2; // centre position along the edge
  if (e.toJunction && p > e.stopLine) {
    const nxt = v.route[v.ri + 1];
    if (nxt) {
      boxBezier(v, e, nxt, (p - e.stopLine) / (2 * jh), cfg);
      return;
    }
  } else if (e.fromJunction && p < jh && v.prevEdge) {
    boxBezier(v, v.prevEdge, e, (jh + p) / (2 * jh), cfg);
    return;
  }
  const pt = pointOn(e, p, cfg.laneOffset);
  v.x = pt[0];
  v.y = pt[1];
  v.h = Math.atan2(e.uy, e.ux);
}
