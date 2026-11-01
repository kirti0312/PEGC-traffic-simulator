import { CONFIG } from './config.js';

// Builds a 2x3 grid of signalised junctions with boundary entry/exit stubs.
// Directed edges carry the vehicles; segments are the undirected roads (used for blocking).
export function buildNetwork(cfg = CONFIG) {
  const L = cfg.blockLength;
  const B = cfg.boundaryLength;
  const R = cfg.rows;
  const Cc = cfg.cols;

  const nodes = {};
  const nodeList = [];
  const addNode = (id, x, y, type, extra = {}) => {
    const n = { id, x, y, type, ...extra };
    nodes[id] = n;
    nodeList.push(n);
    return n;
  };
  for (let r = 0; r < R; r++) for (let c = 0; c < Cc; c++) addNode(`J${r}${c}`, c * L, r * L, 'junction', { r, c });
  for (let r = 0; r < R; r++) {
    addNode(`W${r}`, -B, r * L, 'boundary', { side: 'W' });
    addNode(`E${r}`, (Cc - 1) * L + B, r * L, 'boundary', { side: 'E' });
  }
  for (let c = 0; c < Cc; c++) {
    addNode(`N${c}`, c * L, -B, 'boundary', { side: 'N' });
    addNode(`S${c}`, c * L, (R - 1) * L + B, 'boundary', { side: 'S' });
  }

  const segments = [];
  const addSeg = (a, b) => {
    segments.push({
      id: `${a}|${b}`,
      a,
      b,
      label: `${a}\u2013${b}`,
      internal: nodes[a].type === 'junction' && nodes[b].type === 'junction',
    });
  };
  for (let r = 0; r < R; r++) {
    addSeg(`W${r}`, `J${r}0`);
    for (let c = 0; c < Cc - 1; c++) addSeg(`J${r}${c}`, `J${r}${c + 1}`);
    addSeg(`J${r}${Cc - 1}`, `E${r}`);
  }
  for (let c = 0; c < Cc; c++) {
    addSeg(`N${c}`, `J0${c}`);
    for (let r = 0; r < R - 1; r++) addSeg(`J${r}${c}`, `J${r + 1}${c}`);
    addSeg(`J${R - 1}${c}`, `S${c}`);
  }

  const edges = [];
  const edgeById = {};
  const outEdges = {};
  nodeList.forEach((n) => (outEdges[n.id] = []));
  const addEdge = (from, to, segId) => {
    const a = nodes[from];
    const b = nodes[to];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    const ux = dx / length;
    const uy = dy / length;
    const toJunction = b.type === 'junction';
    const e = {
      id: `${from}>${to}`,
      index: edges.length,
      from,
      to,
      a,
      b,
      length,
      ux,
      uy,
      rx: -uy, // right-hand normal in y-down screen coordinates
      ry: ux,
      axis: Math.abs(dx) > Math.abs(dy) ? 'H' : 'V',
      toJunction,
      fromJunction: a.type === 'junction',
      isEntry: a.type === 'boundary',
      isExit: b.type === 'boundary',
      stopLine: toJunction ? length - cfg.junctionHalf : Infinity,
      segId,
      veh: [],
      queue: 0,
      queueStreak: 0,
      junc: null,
    };
    edges.push(e);
    edgeById[e.id] = e;
    outEdges[from].push(e);
    return e;
  };
  for (const s of segments) {
    addEdge(s.a, s.b, s.id);
    addEdge(s.b, s.a, s.id);
  }

  const junctions = [];
  const juncById = {};
  for (const n of nodeList) {
    if (n.type !== 'junction') continue;
    const j = {
      id: n.id,
      node: n,
      r: n.r,
      c: n.c,
      idx: n.r * Cc + n.c,
      approach: { H: [], V: [] },
      out: [],
      box: { H: 0, V: 0 },
      sig: null,
    };
    junctions.push(j);
    juncById[j.id] = j;
  }
  for (const e of edges) {
    if (e.toJunction) {
      const j = juncById[e.to];
      e.junc = j;
      j.approach[e.axis].push(e);
    }
    if (e.fromJunction) juncById[e.from].out.push(e);
  }

  const boundaryIds = nodeList.filter((n) => n.type === 'boundary').map((n) => n.id);
  const entryEdges = edges.filter((e) => e.isEntry);
  const segById = {};
  segments.forEach((s) => (segById[s.id] = s));

  return { cfg, nodes, nodeList, edges, edgeById, outEdges, segments, segById, junctions, juncById, boundaryIds, entryEdges };
}

// Dijkstra shortest path (by length) that respects blocked road segments.
// Returns an array of edge objects, or null when no route exists. Never invents a route.
export function findRoute(net, fromId, toId, blocked = new Set()) {
  if (fromId === toId || !net.nodes[fromId] || !net.nodes[toId]) return null;
  const dist = {};
  const prev = {};
  const done = {};
  for (const n of net.nodeList) dist[n.id] = Infinity;
  dist[fromId] = 0;
  for (;;) {
    let best = null;
    let bd = Infinity;
    for (const n of net.nodeList) {
      if (!done[n.id] && dist[n.id] < bd) {
        bd = dist[n.id];
        best = n.id;
      }
    }
    if (best === null) break;
    if (best === toId) break;
    done[best] = true;
    for (const e of net.outEdges[best]) {
      if (blocked.has(e.segId)) continue;
      const nd = bd + e.length;
      if (nd < dist[e.to]) {
        dist[e.to] = nd;
        prev[e.to] = e;
      }
    }
  }
  if (dist[toId] === Infinity) return null;
  const route = [];
  let cur = toId;
  while (cur !== fromId) {
    const e = prev[cur];
    route.unshift(e);
    cur = e.from;
  }
  return route;
}

export function routeNodeIds(route) {
  if (!route) return [];
  return [route[0].from, ...route.map((e) => e.to)];
}
