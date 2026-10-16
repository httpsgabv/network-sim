import { memo, type CSSProperties, type ReactNode } from 'react';
import { PACKET_STATE_LABEL } from '../../lib/describe';
import { fragmentGrid, fragmentPosition, type FragmentGrid } from '../../lib/fragments';
import { STAGE_START, type PacketState, type Snapshot } from '../../sim/engine';
import type { BufferItem, SenderItem } from '../../sim/queues';
import styles from './Cards.module.css';

// ponytail: above this, cells stand for groups of packets in seq order (kept at 44 px targets); per-packet cells would be thousands of buttons.
export const MAX_CELLS = 120;
/** Gap between pieces once the image has been fully cut apart. */
const MAX_GAP = 6;

type CellKind = PacketState | 'awaiting';
const CELL_LABEL: Record<CellKind, string> = { ...PACKET_STATE_LABEL, awaiting: 'Aguardando reenvio' };

interface CellProps {
  seq: number;
  flipId: string;
  label: string;
  kind: CellKind;
  pressed: boolean;
  /** background-position of this packet's piece of the picture, or null when there is no picture. */
  piece: string | null;
  onSelect(seq: number): void;
}

// Memoized: on each tick only the cells whose state changed touch the DOM (matters at 2000+ packets).
const Cell = memo(function Cell({ seq, flipId, label, kind, pressed, piece, onSelect }: CellProps) {
  return (
    <button
      type="button"
      className={`${styles.cell} ${styles[kind === 'awaiting' ? 'resend' : kind]}`}
      aria-label={`Pacote ${seq}, ${CELL_LABEL[kind]}`}
      aria-pressed={pressed}
      onClick={() => onSelect(seq)}
      data-flip={flipId}
    >
      {piece && <span className={styles.piece} style={{ backgroundPosition: piece }} aria-hidden="true" />}
      <span className={styles.cellLabel}>{label}</span>
    </button>
  );
});

const Slot = () => <div className={styles.slot} aria-hidden="true" />;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const pad = (seq: number) => String(seq).padStart(2, '0');

interface Common {
  snap: Snapshot;
  poster?: string;
  selected: number;
  onSelect(seq: number): void;
}

function picture(poster: string | undefined, grid: FragmentGrid): CSSProperties | undefined {
  return poster ? ({ '--img': `url("${poster}")`, '--cols': grid.cols, '--rows': grid.rows } as CSSProperties) : undefined;
}

function Card({ side, active, title, desc, children }: { side: 'A' | 'B'; active: boolean; title: string; desc: string; children: ReactNode }) {
  return (
    <section
      aria-label={`${side} · ${title}`}
      className={`${styles.card} ${styles.queue} ${side === 'A' ? styles.sideA : styles.sideB}`}
      data-active={active}
    >
      <div className={styles.queueHead}>
        <span className={`${styles.actor} ${side === 'A' ? styles.actorA : styles.actorB}`}>{side}</span>
        <h2 className={styles.title}>{title}</h2>
        <span className={styles.queueDesc}>{desc}</span>
      </div>
      <div className={styles.queueBody}>{children}</div>
    </section>
  );
}

/** A · the sender's outgoing queue: the picture cut into packets that leave one by one. */
export function OutgoingQueue({ snap, poster, selected, onSelect, items, active }: Common & { items: SenderItem[]; active: boolean }) {
  const n = snap.packets.length, t = snap.t;
  const size = n > MAX_CELLS ? Math.ceil(n / MAX_CELLS) : 1;
  const count = Math.ceil(n / size);
  const grid = fragmentGrid(count);
  const packetized = t >= STAGE_START.packetize;
  const cut = clamp01((t - STAGE_START.encrypt) / (STAGE_START.packetize - STAGE_START.encrypt));
  const atA = items.filter((i) => i.slot !== null).length;
  const waiting = items.filter((i) => i.slot === 'awaiting-resend').length;

  const desc = t < STAGE_START.encrypt ? 'conteúdo original'
    : !packetized ? 'cifrando e cortando…'
      : t < STAGE_START.transit ? `${n} pacotes prontos`
        : waiting ? `reenviando ${waiting}`
          : atA ? `enviando · ${n - atA}/${n} saíram`
            : 'fila vazia · tudo enviado';

  // A only ever holds ciphertext after encryption: its pieces stay grey.
  const gridProps = { 'data-ciphered': t >= STAGE_START.encrypt, className: `${styles.grid} ${styles.pictureGrid} ${t >= STAGE_START.encrypt ? styles.ciphered : ''}` };

  let body: ReactNode;
  if (!packetized && !poster) {
    body = <p className={styles.empty}>{t < STAGE_START.encrypt ? 'Mensagem pronta para cifrar' : 'Cifrando…'}</p>;
  } else if (!packetized) {
    // the whole picture, faded, cracking into pieces as it is encrypted (not interactive: there are no packets yet)
    body = (
      <div {...gridProps} data-testid="intact" aria-hidden="true"
        style={{ ...picture(poster, grid), gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`, maxWidth: grid.cols * 52, gap: cut * MAX_GAP }}>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className={styles.slab} style={{ borderRadius: cut * 8 }} data-flip={size === 1 ? String(i) : `ga:${i}`}>
            <span className={styles.piece} style={{ backgroundPosition: fragmentPosition(i, grid) }} />
          </div>
        ))}
      </div>
    );
  } else {
    body = (
      <div {...gridProps} data-testid="outgoing" style={{ ...picture(poster, grid), gap: MAX_GAP }}>
        {Array.from({ length: count }, (_, i) => {
          const group = items.slice(i * size, (i + 1) * size);
          const slot = group.find((g) => g.slot === 'awaiting-resend')?.slot ?? group.find((g) => g.slot)?.slot ?? null;
          if (!slot) return <Slot key={i} />;
          const seq = i * size;
          return (
            <Cell key={i} seq={seq} flipId={size === 1 ? String(seq) : `ga:${i}`} label={size === 1 ? pad(seq) : ''}
              kind={slot === 'awaiting-resend' ? 'awaiting' : 'queued'} pressed={seq === selected}
              piece={poster ? fragmentPosition(i, grid) : null} onSelect={onSelect} />
          );
        })}
      </div>
    );
  }

  return <Card side="A" active={active} title="Fila de saída" desc={desc}>{body}</Card>;
}

/** B · the receiver's incoming buffer: arrivals out of order, then sorted, gaps, colours back after decrypting. */
export function IncomingBuffer({ snap, poster, selected, onSelect, layout, active }: Common & { layout: { items: BufferItem[]; slots: number }; active: boolean }) {
  const n = snap.packets.length, t = snap.t;
  const size = n > MAX_CELLS ? Math.ceil(n / MAX_CELLS) : 1;
  const grid = fragmentGrid(Math.ceil(n / size));
  const sorted = t >= STAGE_START.sort;
  const ciphered = t < STAGE_START.decrypt;
  const missing = sorted ? snap.missing : [];

  const desc = snap.received.length === 0 && !sorted ? 'aguardando chegadas'
    : !sorted ? `ordem de chegada · ${snap.received.length}/${n}`
      : ciphered ? `ordenado · ${missing.length ? `faltam ${missing.map((s) => `#${s}`).join(', ')}` : 'completo'}`
        : 'decifrado · íntegro';

  let cells: ReactNode[];
  if (size > 1) {
    // grouped: seq order throughout (arrival order of thousands of packets says nothing at this scale)
    cells = Array.from({ length: Math.ceil(n / size) }, (_, i) => {
      const group = snap.packets.slice(i * size, (i + 1) * size).map((p) => p.state);
      if (!sorted && group.some((s) => s !== 'delivered')) return <Slot key={i} />;
      const kind = (['lost', 'transit', 'resend', 'queued', 'none', 'recovered', 'delivered'] as const).find((s) => group.includes(s))!;
      return <Cell key={i} seq={i * size} flipId={`gb:${i}`} label="" kind={kind === 'transit' ? 'lost' : kind} pressed={i * size === selected}
        piece={poster && kind !== 'lost' ? fragmentPosition(i, grid) : null} onSelect={onSelect} />;
    });
  } else {
    cells = layout.items.map((it) => (
      <Cell key={it.flipId} seq={it.seq} flipId={it.flipId} label={pad(it.seq)} kind={it.state} pressed={it.seq === selected}
        piece={poster && it.state !== 'lost' ? fragmentPosition(it.seq, grid) : null} onSelect={onSelect} />
    ));
    for (let i = 0; i < layout.slots; i++) cells.push(<Slot key={`slot-${i}`} />);
  }

  return (
    <Card side="B" active={active} title="Buffer de entrada" desc={desc}>
      <div data-testid="incoming" data-ciphered={ciphered}
        className={`${styles.grid} ${styles.pictureGrid} ${ciphered ? styles.ciphered : ''}`}
        style={{ ...picture(poster, grid), gap: MAX_GAP }}>
        {cells}
      </div>
    </Card>
  );
}
