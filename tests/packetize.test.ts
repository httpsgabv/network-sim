import { describe, expect, it } from 'vitest';
import { missing, packetize, reassemble } from '../src/sim/packetize';

const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) & 255);
// toEqual on MB-sized typed arrays is pathologically slow; compare bytes directly.
const same = (a: Uint8Array | null, b: Uint8Array) => a !== null && a.length === b.length && a.every((v, i) => v === b[i]);

describe('packetize', () => {
  it('splits into ceil(len / mtu) packets numbered 0..n-1', () => {
    const packets = packetize(bytes(2500), 1024);
    expect(packets.map((p) => p.seq)).toEqual([0, 1, 2]);
    expect(packets.map((p) => p.payload.length)).toEqual([1024, 1024, 452]);
    expect(packets.every((p) => p.total === 3)).toBe(true);
  });

  it('exact multiple of mtu has no empty tail packet', () => {
    expect(packetize(bytes(2048), 1024)).toHaveLength(2);
  });

  it('empty payload still produces one packet so the receiver can finish', () => {
    const packets = packetize(new Uint8Array(0), 1024);
    expect(packets).toHaveLength(1);
    expect(packets[0].payload.length).toBe(0);
  });

  it('rejects a non-positive mtu', () => {
    expect(() => packetize(bytes(10), 0)).toThrow();
  });
});

describe('reassemble', () => {
  it.each([0, 1, 1024, 3000, 2 * 1024 * 1024])('round-trips %i bytes byte for byte', (n) => {
    const original = bytes(n);
    expect(same(reassemble(packetize(original, 1024)), original)).toBe(true);
  });

  it('reorders packets that arrived out of order', () => {
    const original = bytes(5000);
    const shuffled = packetize(original, 1024).reverse();
    expect(reassemble(shuffled)).toEqual(original);
  });

  it('ignores duplicates from retransmission', () => {
    const original = bytes(3000);
    const packets = packetize(original, 1024);
    expect(reassemble([...packets, packets[1]])).toEqual(original);
  });

  it('returns null while there are gaps', () => {
    const packets = packetize(bytes(5000), 1024);
    expect(reassemble(packets.filter((p) => p.seq !== 2))).toBeNull();
    expect(reassemble([])).toBeNull();
  });
});

describe('missing', () => {
  it('lists exactly the absent sequence numbers in order', () => {
    expect(missing([4, 0, 2], 6)).toEqual([1, 3, 5]);
    expect(missing([0, 1, 2], 3)).toEqual([]);
  });
});
