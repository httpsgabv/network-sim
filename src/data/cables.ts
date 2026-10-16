import type { LatLon } from '../sim/types';

export interface Cable {
  id: string;
  name: string;
  kind: 'submarine' | 'terrestrial';
  /** Ordered path: node ids are landing stations, coordinates are drawing waypoints. */
  path: (string | LatLon)[];
}

// Hand-authored approximations of real systems (not TeleGeography data: that is CC BY-NC-SA).
// ponytail: no US transcontinental backbone, so SP→Tóquio routes via Europe/Suez for the narrative;
// add one (nyc→lax) to get the more realistic Brazil→US→Japan path.
export const CABLES: Cable[] = [
  { id: 'backbone-br', name: 'Backbone BR', kind: 'terrestrial', path: ['sao', 'fza'] },
  { id: 'ellalink', name: 'EllaLink', kind: 'submarine', path: ['fza', [14.9, -23.5], [32.6, -16.9], 'sin'] },
  { id: 'backbone-eu', name: 'Backbone EU', kind: 'terrestrial', path: ['sin', [40.4, -3.7], 'mrs'] },
  { id: 'backbone-pt', name: 'Backbone PT', kind: 'terrestrial', path: ['sin', 'lis'] },
  { id: 'backbone-fr', name: 'Backbone FR', kind: 'terrestrial', path: ['mrs', 'fra', 'lon'] },
  {
    id: 'smw6', name: 'SEA-ME-WE 6', kind: 'submarine',
    path: ['mrs', [36.5, 14], [31.6, 32.3], [20, 38.5], [12.6, 43.4], [12.5, 50], 'bom', [5, 80.6], 'sgp'],
  },
  { id: 'sjc2', name: 'SJC2', kind: 'submarine', path: ['sgp', [10, 111], 'hkg', [26, 125], 'tyo'] },
  { id: 'monet', name: 'Monet', kind: 'submarine', path: ['sao', [-23.5, -41], [-13, -36.5], 'fza', [12, -55], 'mia'] },
  { id: 'us-east', name: 'Backbone US-East', kind: 'terrestrial', path: ['mia', 'vab', 'nyc'] },
  { id: 'marea', name: 'MAREA', kind: 'submarine', path: ['vab', 'bil'] },
  { id: 'grace-hopper', name: 'Grace Hopper', kind: 'submarine', path: ['nyc', [50.8, -4.6], 'lon'] },
  { id: 'faster', name: 'FASTER', kind: 'submarine', path: ['ore', 'tyo'] },
  { id: 'us-west', name: 'Backbone US-West', kind: 'terrestrial', path: ['lax', 'ore'] },
  { id: 'southern-cross', name: 'Southern Cross', kind: 'submarine', path: ['lax', [21.3, -157.9], [-18, 178], 'syd'] },
  { id: 'indigo', name: 'INDIGO', kind: 'submarine', path: ['sgp', [-31.9, 115.8], 'syd'] },
  { id: 'sacs', name: 'SACS', kind: 'submarine', path: ['fza', 'lad'] },
  { id: 'wacs', name: 'WACS', kind: 'submarine', path: ['lad', 'cpt'] },
  { id: '2africa', name: '2Africa', kind: 'submarine', path: ['lis', [14.7, -17.4], [6.4, 3.4], 'cpt', [-25.9, 32.6], 'mba', 'bom'] },
  { id: 'apg', name: 'APG', kind: 'submarine', path: ['hkg', [20.5, 122], [30, 131], 'tyo'] },
];
