import { describe, expect, it } from 'vitest';
import { internetChecksum } from '../src/sim/checksum';

describe('internetChecksum (RFC 1071)', () => {
  it('matches the RFC 1071 worked example', () => {
    expect(internetChecksum(Uint8Array.from([0x00, 0x01, 0xf2, 0x03, 0xf4, 0xf5, 0xf6, 0xf7]))).toBe(0x220d);
  });

  it('pads an odd trailing byte with zero', () => {
    expect(internetChecksum(Uint8Array.from([0x01]))).toBe(internetChecksum(Uint8Array.from([0x01, 0x00])));
  });

  it('verifies: data + its checksum sums to zero', () => {
    const data = Uint8Array.from({ length: 101 }, (_, i) => (i * 37) & 255);
    const padded = Uint8Array.from([...data, 0]);
    const sum = internetChecksum(padded);
    expect(internetChecksum(Uint8Array.from([...padded, sum >> 8, sum & 255]))).toBe(0);
  });
});
