import { endpointNames, PACKET_STATE_LABEL, whereOnRoute } from '../../lib/describe';
import { useSnapshot } from '../../lib/useSim';
import { internetChecksum } from '../../sim/checksum';
import { senderLayout } from '../../sim/queues';
import { ACTOR_SHORT, type ActorKey } from '../../lib/actors';
import { useSim } from '../../store';
import styles from './Cards.module.css';

/** TCP (20) + IPv4 (20) + TLS record overhead (~12): what each packet carries besides payload. */
const HEADER_BYTES = 52;
const HEX_BYTES = 32;

const hexLines = (bytes: Uint8Array) =>
  Array.from({ length: Math.ceil(Math.min(bytes.length, HEX_BYTES) / 16) }, (_, row) =>
    Array.from(bytes.subarray(row * 16, Math.min(row * 16 + 16, HEX_BYTES)), (b) => b.toString(16).padStart(2, '0')).join(' '),
  ).join('\n');

const WHERE_LABEL: Record<ActorKey, string> = { A: 'em A', N: 'na rede', B: 'em B' };

export function Inspector({ embedded = false }: { embedded?: boolean }) {
  const snap = useSnapshot();
  const seq = useSim((s) => s.selected);
  const transfer = useSim((s) => s.transfer);
  const plan = useSim((s) => s.plan);
  const route = useSim((s) => s.route);
  const view = snap.packets[seq];
  const planned = plan.packets[seq];
  const packet = transfer?.packets[seq];
  if (!view || !planned) return null;

  const where = view.pos !== null ? whereOnRoute(route, view.pos) : null;
  const { origin, destination } = endpointNames(route);
  const done = view.state === 'delivered' || view.state === 'recovered';
  const position =
    view.state === 'lost' ? `Descartado · ${where?.between}`
      : where ? where.between
        : done ? `${destination} (entregue)`
          : `${origin} (fila de saída)`;
  const ttl = 64 - (done ? route.legs.length : where?.leg ?? 0);
  // where the packet is right now: still at A (queued or waiting to be resent), on the network, or at B
  const atA = view.state === 'none' || senderLayout(plan, snap.t)[seq]?.slot != null;
  const whereNow: ActorKey = atA ? 'A' : done ? 'B' : 'N';
  const tone = view.state === 'lost' ? styles.badgeLost : view.state === 'resend' || view.state === 'recovered' ? styles.badgeResend : '';

  const rows: [string, string][] = [
    ['Seq', `${seq} de ${snap.packets.length}`],
    ['Origem', '189.45.12.8:443'],
    ['Destino', '126.78.3.21:51823'],
    ['Protocolo', 'TCP · TLS 1.3'],
    ['TTL', String(ttl)],
    ['Posição', position],
    ['Cabo', where?.cable ?? '—'],
    ['Tamanho', packet ? `${packet.payload.length} B + ${HEADER_BYTES} B` : '—'],
    ['Checksum', packet ? `0x${internetChecksum(packet.payload).toString(16).padStart(4, '0')}` : '—'],
  ];

  return (
    <section aria-label="Inspetor de pacote" className={embedded ? styles.embedded : styles.card}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>Pacote #{seq}</h2>
          <p className={styles.desc}>Clique num pacote da fila A ou do buffer B</p>
        </div>
        <div className={styles.badges}>
          <span className={`${styles.actor} ${styles[`actor${whereNow}`]}`} title={WHERE_LABEL[whereNow]}>{ACTOR_SHORT[whereNow]}</span>
          <span className={`${styles.badge} ${tone}`}>{PACKET_STATE_LABEL[view.state]}</span>
        </div>
      </div>
      <dl className={styles.rows}>
        {rows.map(([k, v]) => (
          <div key={k} className={styles.row}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      {packet && (
        <figure className={styles.hexWrap}>
          <figcaption>Payload cifrado · primeiros {Math.min(HEX_BYTES, packet.payload.length)} de {packet.payload.length} bytes</figcaption>
          <pre className={styles.hex}>{hexLines(packet.payload)}</pre>
        </figure>
      )}
      <p className={styles.footnote}>IPs e portas são ilustrativos; bytes e checksum são reais.</p>
    </section>
  );
}
