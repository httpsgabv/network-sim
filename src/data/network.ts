// The routable network: the 15 cities, real landing stations and cable legs (TeleGeography 2022,
// CC BY-NC-SA 3.0), land backbones and city ↔ landing backhaul.
import { CABLE_DATA } from './cableData';
import { BACKBONES, backhaul, type Cable } from './cables';
import { NODES, type NetNode } from './nodes';

const LANDINGS: NetNode[] = Object.entries(CABLE_DATA.landings).map(([id, l]) => ({ id, name: l.name, kind: 'landing', at: l.at }));

// Each leg is its own Cable entry (same id): route.ts turns [a, ...points, b] into one edge.
const SUBMARINE: Cable[] = CABLE_DATA.cables.flatMap((c) =>
  c.legs.map((l): Cable => ({ id: c.id, name: c.name, kind: 'submarine', path: [l.a, ...l.points, l.b] })),
);

export const NETWORK_NODES: NetNode[] = [...NODES, ...LANDINGS];
export const NETWORK_CABLES: Cable[] = [...SUBMARINE, ...BACKBONES, ...backhaul(NODES, LANDINGS)];

export const nodeById = new Map(NETWORK_NODES.map((n) => [n.id, n]));
export const cableById = new Map(CABLE_DATA.cables.map((c) => [c.id, c]));

const landNames = new Map([...BACKBONES, { id: 'backhaul', name: 'Backhaul' }].map((c) => [c.id, c.name]));
export const cableName = (id: string) => cableById.get(id)?.name ?? landNames.get(id) ?? id;
/** "Fortaleza, Brazil" → "Fortaleza": cities keep their pt-BR name, landings drop the country. */
export const nodeName = (id: string) => {
  const n = nodeById.get(id);
  return !n ? id : n.kind === 'landing' ? n.name.replace(/, [^,]+$/, '') : n.name;
};
