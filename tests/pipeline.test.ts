import { describe, expect, it } from 'vitest';
import { IV_BYTES, TAG_BYTES } from '../src/sim/crypto';
import { MTU, transmit } from '../src/sim/pipeline';

const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 131 + 17) & 255);
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

describe('transmit (encrypt → packetize → shuffle → reassemble → decrypt)', () => {
  it('delivers the exact original bytes', async () => {
    const original = bytes(30_000);
    const tx = await transmit(original);
    expect(tx.intact).toBe(true);
    expect(same(tx.delivered, original)).toBe(true);
  });

  it('packets carry ciphertext: iv + payload + tag, split at the MTU', async () => {
    const tx = await transmit(bytes(5000));
    expect(tx.packets).toHaveLength(Math.ceil((5000 + IV_BYTES + TAG_BYTES) / MTU));
    expect(tx.packets[0].payload.length).toBe(MTU);
  });

  it('handles a 2 MB photo', async () => {
    const original = bytes(2 * 1024 * 1024);
    const tx = await transmit(original);
    expect(tx.packets.length).toBeGreaterThan(2000);
    expect(same(tx.delivered, original)).toBe(true);
  });

  it('a one-line text message fits in a single packet', async () => {
    const tx = await transmit(new TextEncoder().encode('Olha o pôr do sol daqui de São Paulo!'));
    expect(tx.packets).toHaveLength(1);
    expect(new TextDecoder().decode(tx.delivered)).toBe('Olha o pôr do sol daqui de São Paulo!');
  });
});
