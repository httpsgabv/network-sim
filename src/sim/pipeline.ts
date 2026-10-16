import { createSessionKey, open, seal } from './crypto';
import { packetize, reassemble } from './packetize';
import type { Packet } from './types';

/** Didactic MTU (see SPEC premise 6). */
export const MTU = 1024;

export interface Transmission {
  /** Ciphertext packets as they leave the sender. */
  packets: Packet[];
  /** What the receiver gets after reordering, reassembly and decryption. */
  delivered: Uint8Array<ArrayBuffer>;
  /** delivered === original, byte for byte. */
  intact: boolean;
}

/**
 * Runs the real data path once, up front: the animation then shows these exact packets.
 * Arrival order is reversed on purpose so reassembly has to sort by seq.
 */
export async function transmit(original: Uint8Array<ArrayBuffer>, mtu = MTU): Promise<Transmission> {
  const key = await createSessionKey();
  const packets = packetize(await seal(key, original), mtu);
  const sealed = reassemble([...packets].reverse());
  if (!sealed) throw new Error('reassembly failed: missing packets');
  const delivered = await open(key, sealed as Uint8Array<ArrayBuffer>);
  const intact = delivered.length === original.length && delivered.every((b, i) => b === original[i]);
  return { packets, delivered, intact };
}
