import { buildNetwork } from '../engine/network.js';

// Static network description used by the UI (labels, road list). No results in here.
export const NET = buildNetwork();

const SIDE = { W: 'West', E: 'East', N: 'North', S: 'South' };
export function placeLabel(id) {
  const n = NET.nodes[id];
  if (!n) return id;
  if (n.type === 'junction') return id;
  const idx = Number(id.slice(1)) + 1;
  return `${SIDE[n.side]} ${n.side === 'W' || n.side === 'E' ? 'row' : 'col'} ${idx} (${id})`;
}
export const ENTRY_COUNT = NET.entryEdges.length;
export const BOUNDARY_IDS = NET.boundaryIds;
export const SEGMENTS = NET.segments;
export const segLabel = (id) => (NET.segById[id] ? NET.segById[id].label : id);

export const SPEEDS = [1, 2, 4, 8, 16];
export const NAV = [
  ['command', 'Command Centre'],
  ['configure', 'Configure'],
  ['watch', 'Watch'],
  ['compare', 'Compare'],
  ['stress', 'Stress Test'],
];
