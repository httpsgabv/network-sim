import { formatBytes } from '../../lib/payload';
import { DESTINATION_NAME, ORIGIN_NAME, whereOnRoute } from '../../lib/describe';
import { ACTOR_OF_EVENT, ACTOR_SHORT } from '../../lib/actors';
import { useSnapshot } from '../../lib/useSim';
import type { SimEvent } from '../../sim/engine';
import { MS_PER_TICK, useSim, type Transfer } from '../../store';
import styles from './Cards.module.css';

const SHOWN = 8;

function describe(e: SimEvent, missing: string, transfer: Transfer | null, count: number, mtu: number): { text: string; tone: string } {
  const size = transfer ? formatBytes(transfer.payload.bytes.length) : '';
  switch (e.kind) {
    case 'send': return { text: `Send pressionado${transfer ? ` · ${transfer.payload.name} (${size})` : ''}`, tone: styles.muted };
    case 'encrypt': return { text: 'Payload cifrado com AES-256-GCM', tone: styles.muted };
    case 'packetize': return { text: `${count} pacote(s) de até ${formatBytes(mtu)} criados`, tone: styles.muted };
    case 'depart': return { text: `Primeiro pacote deixa o CDN ${ORIGIN_NAME}`, tone: '' };
    case 'lost': return { text: `Pacote #${e.seq} perdido · ${whereOnRoute(e.pos!).cable}`, tone: styles.lostDot };
    case 'first-arrival': return { text: `Primeiro pacote chega ao CDN ${DESTINATION_NAME}`, tone: '' };
    case 'sorted': return { text: missing ? `Ordenado por seq · faltam ${missing}` : 'Ordenado · nenhuma lacuna', tone: missing ? styles.resendDot : '' };
    case 'sack': return { text: `SACK enviado: pedir ${missing}`, tone: styles.resendDot };
    case 'resend': return { text: 'Retransmitindo os pacotes faltantes', tone: styles.resendDot };
    case 'complete': return { text: `Todos os ${count} pacotes recebidos`, tone: '' };
    case 'decrypt': return { text: transfer?.intact ? 'Tag GCM válida · conteúdo decifrado' : 'Conteúdo decifrado', tone: '' };
    case 'seen': return { text: 'Kenji visualizou', tone: styles.doneDot };
  }
}

const WHO: Record<string, string> = { A: 'A · remetente', N: 'rede', B: 'B · destinatário' };

export function EventLog({ embedded = false }: { embedded?: boolean }) {
  const snap = useSnapshot();
  const plan = useSim((s) => s.plan);
  const transfer = useSim((s) => s.transfer);
  const mtu = useSim((s) => s.mtu);
  const missing = plan.packets.filter((p) => p.lost).map((p) => `#${p.seq}`).join(', ');
  const latest = snap.events.slice(-SHOWN).reverse();

  return (
    <section aria-label="Registro de eventos" className={embedded ? styles.embedded : styles.card}>
      <h2 className={embedded ? 'sr-only' : styles.title}>Eventos</h2>
      <ol className={styles.log} aria-live="polite">
        {latest.map((e) => {
          const { text } = describe(e, missing, transfer, plan.packets.length, mtu);
          const who = ACTOR_OF_EVENT[e.kind];
          return (
            <li key={`${e.kind}-${e.seq ?? ''}-${e.t}`} className={styles.event}>
              <span className={`${styles.actor} ${styles[`actor${who}`]}`} title={WHO[who]}>{ACTOR_SHORT[who]}</span>
              <span>{text}</span>
              <time>+{Math.round(e.t * MS_PER_TICK)} ms</time>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
