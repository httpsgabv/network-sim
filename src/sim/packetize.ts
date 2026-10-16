import type { Packet } from './types';

// MTU here is "didactic" (default 1 KB): a real 1500 B MTU would turn one photo into thousands of dots.
export function packetize(bytes: Uint8Array, mtu: number): Packet[] {
  if (!(mtu > 0)) throw new RangeError(`mtu must be > 0, got ${mtu}`);
  const total = Math.max(1, Math.ceil(bytes.length / mtu));
  return Array.from({ length: total }, (_, seq) => ({
    seq,
    total,
    payload: bytes.subarray(seq * mtu, (seq + 1) * mtu),
  }));
}

export function missing(received: Iterable<number>, total: number): number[] {
  const have = new Set(received);
  return Array.from({ length: total }, (_, i) => i).filter((seq) => !have.has(seq));
}

export function reassemble(packets: Packet[]): Uint8Array | null {
  const total = packets[0]?.total;
  if (total === undefined) return null;
  const bySeq = new Map(packets.map((p) => [p.seq, p.payload]));
  if (missing(bySeq.keys(), total).length > 0) return null;
  const parts = Array.from({ length: total }, (_, seq) => bySeq.get(seq)!);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
