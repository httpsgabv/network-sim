export interface Packet {
  seq: number;
  total: number;
  payload: Uint8Array;
}

export type LatLon = readonly [lat: number, lon: number];
