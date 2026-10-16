import type { LatLon } from '../sim/types';

export type NodeKind = 'endpoint' | 'cdn' | 'landing';

export interface NetNode {
  id: string;
  name: string;
  kind: NodeKind;
  at: LatLon;
}

// endpoint/cdn get labels on the globe; landing stations are routing-only.
export const NODES: NetNode[] = [
  { id: 'sao', name: 'São Paulo', kind: 'endpoint', at: [-23.55, -46.63] },
  { id: 'tyo', name: 'Tóquio', kind: 'endpoint', at: [35.68, 139.69] },
  { id: 'fza', name: 'Fortaleza', kind: 'cdn', at: [-3.73, -38.52] },
  { id: 'sin', name: 'Sines', kind: 'cdn', at: [37.95, -8.87] },
  { id: 'mrs', name: 'Marselha', kind: 'cdn', at: [43.3, 5.37] },
  { id: 'bom', name: 'Mumbai', kind: 'cdn', at: [19.08, 72.88] },
  { id: 'sgp', name: 'Singapura', kind: 'cdn', at: [1.35, 103.82] },
  { id: 'hkg', name: 'Hong Kong', kind: 'cdn', at: [22.3, 114.17] },
  { id: 'mia', name: 'Miami', kind: 'cdn', at: [25.76, -80.19] },
  { id: 'nyc', name: 'Nova York', kind: 'cdn', at: [40.71, -74.0] },
  { id: 'lon', name: 'Londres', kind: 'cdn', at: [51.5, -0.12] },
  { id: 'fra', name: 'Frankfurt', kind: 'cdn', at: [50.11, 8.68] },
  { id: 'lax', name: 'Los Angeles', kind: 'cdn', at: [33.94, -118.4] },
  { id: 'syd', name: 'Sydney', kind: 'cdn', at: [-33.87, 151.2] },
  { id: 'cpt', name: 'Cidade do Cabo', kind: 'cdn', at: [-33.92, 18.42] },
  { id: 'vab', name: 'Virginia Beach', kind: 'landing', at: [36.85, -75.98] },
  { id: 'bil', name: 'Bilbao', kind: 'landing', at: [43.26, -2.93] },
  { id: 'ore', name: 'Hillsboro', kind: 'landing', at: [45.5, -123.9] },
  { id: 'lis', name: 'Lisboa', kind: 'landing', at: [38.72, -9.14] },
  { id: 'lad', name: 'Luanda', kind: 'landing', at: [-8.84, 13.23] },
  { id: 'mba', name: 'Mombasa', kind: 'landing', at: [-4.04, 39.67] },
];

export const nodeById = new Map(NODES.map((n) => [n.id, n]));
