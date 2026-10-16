import { memo } from 'react';
import type { PacketState, Snapshot } from '../../sim/engine';
import { STAGE_START } from '../../sim/engine';
import { fragmentGrid } from '../../lib/fragments';
import type { Packet } from '../../sim/types';
import styles from './Chat.module.css';

const MAX_TILES = 96;
const REVEAL_SPAN = STAGE_START.render - STAGE_START.decrypt;

type TileState = 'empty' | 'cipher' | 'lost' | 'resend' | 'clear';

function tileState(states: PacketState[], revealed: boolean): TileState {
  if (revealed) return 'clear';
  if (states.includes('lost')) return 'lost';
  if (states.includes('resend')) return 'resend';
  return states.every((s) => s === 'delivered' || s === 'recovered') ? 'cipher' : 'empty';
}

/**
 * The received image as the receiver "sees" it: one tile per packet (or group of packets),
 * scrambled while encrypted, then revealed in seq order while decrypting.
 */
export function CipherTiles({ snap, packets }: { snap: Snapshot; packets: Packet[] }) {
  const n = snap.packets.length;
  const count = Math.min(n, MAX_TILES);
  const { cols } = fragmentGrid(count);

  return (
    <div className={styles.tiles} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }} aria-hidden="true">
      {Array.from({ length: count }, (_, j) => {
        const from = Math.floor((j * n) / count), to = Math.max(from + 1, Math.floor(((j + 1) * n) / count));
        const state = tileState(
          snap.packets.slice(from, to).map((p) => p.state),
          snap.t >= STAGE_START.decrypt + REVEAL_SPAN * (j / count),
        );
        return <Tile key={j} state={state} byte={packets[from]?.payload[0] ?? 0} showHex={cols <= 8} />;
      })}
    </div>
  );
}

// Memoized like the buffer cells: a tick only repaints tiles that changed state.
const Tile = memo(function Tile({ state, byte, showHex }: { state: TileState; byte: number; showHex: boolean }) {
  // ciphertext looks like noise: shade and label come from the packet's real first byte
  return (
    <div className={`${styles.tile} ${styles[state]}`} style={state === 'cipher' ? { background: `hsl(240 5% ${6 + (byte / 255) * 12}%)` } : undefined}>
      {state === 'cipher' && showHex ? byte.toString(16).padStart(2, '0') : state === 'lost' ? '×' : ''}
    </div>
  );
});
