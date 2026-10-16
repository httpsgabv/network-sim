import { angle, toVec } from '../sim/geo';
import type { LatLon } from '../sim/types';
import type { NetNode } from './nodes';

export interface Cable {
  id: string;
  name: string;
  kind: 'submarine' | 'terrestrial';
  /** Ordered path: node ids are landing stations or cities, coordinates are drawing waypoints. */
  path: (string | LatLon)[];
}

/**
 * Land backbones between cities. Submarine cables come from cables.json (data/network.ts).
 * ponytail: hand-drawn trunks, not the real terrestrial topology; swap for an open backbone dataset if one appears.
 */
export const BACKBONES: Cable[] = [
  { id: 'backbone-br', name: 'Backbone BR', kind: 'terrestrial', path: ['sao', 'fza'] },
  { id: 'backbone-eu', name: 'Backbone EU', kind: 'terrestrial', path: ['sin', [40.4, -3.7], 'mrs'] },
  { id: 'backbone-fr', name: 'Backbone FR', kind: 'terrestrial', path: ['mrs', 'fra', 'lon'] },
  { id: 'us-east', name: 'Backbone US-East', kind: 'terrestrial', path: ['mia', [33.75, -84.39], 'nyc'] },
  { id: 'us-transcon', name: 'Backbone US-Transcon', kind: 'terrestrial', path: ['nyc', [41.9, -87.6], [39.7, -105], 'lax'] },
];

/** Cities reach landing stations up to this far by land (approved in the spec). */
export const BACKHAUL_KM = 1500;

/**
 * Backhaul: each city ↔ every landing station within BACKHAUL_KM. The route pays the land detour
 * (sim/route TERRESTRIAL_DETOUR) on these too.
 * ponytail: radius rule, ignores real fibre routes and borders; replace with real backhaul data if we get it.
 */
export function backhaul(cities: NetNode[], landings: NetNode[], maxKm = BACKHAUL_KM): Cable[] {
  const out: Cable[] = [];
  for (const c of cities) {
    const v = toVec(c.at);
    for (const l of landings)
      if (angle(v, toVec(l.at)) * 6371 <= maxKm) out.push({ id: 'backhaul', name: 'Backhaul', kind: 'terrestrial', path: [c.id, l.id] });
  }
  return out;
}
