import { useRef } from 'react';
import { actorAt, actorKeyOf } from '../../lib/actors';
import { useFlip } from '../../lib/useFlip';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { useSnapshot } from '../../lib/useSim';
import { STAGE_START } from '../../sim/engine';
import { receiverLayout, senderLayout } from '../../sim/queues';
import { useSim, type Panel } from '../../store';
import { Segmented } from '../Segmented';
import styles from './Cards.module.css';
import { EventLog } from './EventLog';
import { Inspector } from './Inspector';
import { IncomingBuffer, OutgoingQueue } from './Queues';
import { CableCard } from './CableCard';
import { RouteLegs } from './RouteLegs';
import { Ladder, PlaybackBuffer } from './StreamCards';

const PANELS = [
  { value: 'events', label: 'Eventos' },
  { value: 'packet', label: 'Pacote' },
  { value: 'route', label: 'Rota' },
] as const satisfies readonly { value: Panel; label: string }[];

const STREAM_PANELS = [
  { value: 'chart', label: 'Gráfico' },
  { value: 'events', label: 'Eventos' },
  { value: 'segment', label: 'Segmento' },
] as const satisfies readonly { value: Panel; label: string }[];

export function Details({ className }: { className?: string }) {
  const stream = useSim((s) => s.mode === 'stream');
  return stream ? <StreamDetails className={className} /> : <TransferDetails className={className} />;
}

/** Streaming detail row: the encoder's ladder under A, the playback buffer under B, chart/events/segment between. */
function StreamDetails({ className }: { className?: string }) {
  const actor = useSim(actorKeyOf);
  const panel = useSim((s) => s.panel);
  const setPanel = useSim((s) => s.setPanel);
  return (
    <div className={className}>
      <Ladder active={actor === 'A'} />
      <section aria-label="Detalhes" className={`${styles.card} ${styles.middle}`}>
        <Segmented label="Painel de detalhes" options={STREAM_PANELS} value={panel} onChange={setPanel} />
      </section>
      <PlaybackBuffer active={actor === 'B'} />
    </div>
  );
}

/**
 * Detail row, laid out like the stage row above it: A's outgoing queue under phone A,
 * B's incoming buffer under phone B, packet/events in the middle.
 *
 * Both queues share one FLIP root on purpose: a packet keeps its flip id while it crosses the
 * network, so when it lands in B it flies over from the place it left in A.
 */
function TransferDetails({ className }: { className?: string }) {
  const snap = useSnapshot();
  const plan = useSim((s) => s.plan);
  const poster = useSim((s) => s.transfer?.posterUrl);
  const selected = useSim((s) => s.selected);
  const select = useSim((s) => s.select);
  const panel = useSim((s) => s.panel);
  const setPanel = useSim((s) => s.setPanel);
  const selectedCable = useSim((s) => s.selectedCable);
  const actor = actorAt(snap.t).key;

  const sent = senderLayout(plan, snap.t);
  const received = receiverLayout(snap);
  const root = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const phase = snap.t < STAGE_START.packetize ? 'i' : 'p';
  useFlip(root, `${phase}|${sent.map((s) => (s.slot ? s.seq : '_')).join(',')}|${received.items.map((i) => i.flipId).join(',')}`, reduced);

  const common = { snap, poster, selected, onSelect: select };
  return (
    <div ref={root} className={className} style={{ position: 'relative' }}>
      <OutgoingQueue {...common} items={sent} active={actor === 'A'} />
      <section aria-label="Detalhes" className={`${styles.card} ${styles.middle}`}>
        <Segmented label="Painel de detalhes" options={PANELS} value={panel} onChange={setPanel} />
        {panel === 'events' ? <EventLog embedded />
          : panel === 'packet' ? <Inspector embedded />
            : selectedCable ? <CableCard id={selectedCable} /> : <RouteLegs />}
      </section>
      <IncomingBuffer {...common} layout={received} active={actor === 'B'} />
    </div>
  );
}
