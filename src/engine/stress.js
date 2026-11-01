// Stress-test helpers (pure functions, no UI). A stress changes the scenario; it never changes results.
import { buildNetwork, findRoute, routeNodeIds } from './network.js';

const NET = buildNetwork();

// type: 'traffic' (density -> high), 'block' (close the chosen roads), 'both'.
export function stressScenario(base, type, extraBlocked = []) {
  const s = { ...base, blocked: [...(base.blocked || [])] };
  if (type === 'traffic' || type === 'both') s.density = 'high';
  if (type === 'block' || type === 'both') for (const id of extraBlocked) if (!s.blocked.includes(id)) s.blocked.push(id);
  return s;
}

export function routeFor(scenario) {
  const r = findRoute(NET, scenario.origin, scenario.dest, new Set(scenario.blocked || []));
  return r ? routeNodeIds(r) : null;
}

export function routeLength(nodeIds) {
  if (!nodeIds) return null;
  let len = 0;
  for (let i = 1; i < nodeIds.length; i++) {
    const a = NET.nodes[nodeIds[i - 1]];
    const b = NET.nodes[nodeIds[i]];
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

export function junctionsOn(nodeIds) {
  return nodeIds ? nodeIds.filter((id) => NET.nodes[id].type === 'junction').length : 0;
}

// Road segments (ids) that the route uses.
export function routeSegments(nodeIds) {
  if (!nodeIds) return [];
  const out = [];
  for (let i = 1; i < nodeIds.length; i++) {
    const a = nodeIds[i - 1];
    const b = nodeIds[i];
    const seg = NET.segments.find((s) => (s.a === a && s.b === b) || (s.a === b && s.b === a));
    if (seg) out.push(seg.id);
  }
  return out;
}

// A road on the current route whose closure still leaves some other route (preferring the middle of the route
// and roads between two junctions). Returns null if the route has no such road.
export function pickRouteRoad(base) {
  const route = routeFor(base);
  if (!route) return null;
  const segs = routeSegments(route);
  const ok = segs.filter((id) => routeFor({ ...base, blocked: [...(base.blocked || []), id] }));
  const inner = ok.filter((id) => NET.segById[id].internal);
  const pool = inner.length ? inner : ok;
  if (!pool.length) return null;
  return pool[Math.floor((pool.length - 1) / 2)];
}

export function segLabelOf(id) {
  return NET.segById[id] ? NET.segById[id].label : id;
}
