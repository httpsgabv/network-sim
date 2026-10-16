import type { LatLon } from '../sim/types';
import raw from './cables.json';

/** Shape of cables.json, written by scripts/build-cables.ts (TeleGeography 2022, CC BY-NC-SA 3.0). */
export interface CableData {
  source: string;
  license: string;
  snapshot: string;
  landings: Record<string, { name: string; country: string | null; at: LatLon }>;
  cables: {
    id: string;
    name: string;
    rfs: number | null;
    /** Still "planned" in the 2022 snapshot (RFS ≤ 2026): shown as "planejado em 2022". */
    planned: boolean;
    lengthKm: number | null;
    owners: string;
    landings: string[];
    /** Spans between neighbouring landings along the drawn cable; km before simplification. */
    legs: { a: string; b: string; km: number; points: LatLon[] }[];
  }[];
}

export const CABLE_DATA = raw as unknown as CableData;
