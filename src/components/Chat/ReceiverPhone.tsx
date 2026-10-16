import { endpointNames } from '../../lib/describe';
import { formatBytes } from '../../lib/payload';
import { useSnapshot } from '../../lib/useSim';
import { STAGE_START, STAGES, type Snapshot } from '../../sim/engine';
import { useSim } from '../../store';
import styles from './Chat.module.css';
import { CipherTiles } from './CipherTiles';
import { Phone } from './Phone';

function receiverStatus(snap: Snapshot, lost: number[], deliveredBytes: number | null): string {
  const missing = lost.map((s) => `#${s}`).join(', ');
  const total = snap.packets.length;
  if (snap.stage >= STAGES.length) {
    return deliveredBytes === null ? 'Visualizado' : `Visualizado · ${formatBytes(deliveredBytes)} íntegros`;
  }
  switch (STAGES[snap.stage]) {
    case 'render': return 'Renderizando…';
    case 'decrypt': return 'Decifrando…';
    case 'resend': return `Reenvio ${snap.packets.filter((p) => p.state === 'recovered').length}/${lost.length}`;
    case 'sack': return lost.length ? `Pedindo ${missing}` : 'Nada faltando';
    case 'sort': return lost.length ? `Faltam ${missing}` : 'Completo';
    default: return `Recebendo ${snap.received.length}/${total}`;
  }
}

const hex = (b: Uint8Array, n: number) => Array.from(b.subarray(0, n), (x) => x.toString(16).padStart(2, '0')).join('');

export function ReceiverPhone() {
  const snap = useSnapshot();
  const transfer = useSim((s) => s.transfer);
  const plan = useSim((s) => s.plan);
  const destination = useSim((s) => endpointNames(s.route).destination);
  const lost = plan.packets.filter((p) => p.lost).map((p) => p.seq);
  const visible = snap.received.length > 0 || snap.t >= STAGE_START.decrypt;
  const decrypted = snap.t >= STAGE_START.decrypt;
  const done = snap.stage >= STAGES.length;
  const recovering = STAGES[snap.stage] === 'sack' || STAGES[snap.stage] === 'resend';
  const payload = transfer?.payload;

  const footer = (
    <div className={styles.composer} aria-hidden="true">
      <div className={`${styles.input} ${styles.inputIdle}`}>Mensagem</div>
      <div className={`${styles.send} ${styles.sendIdle}`} />
    </div>
  );

  return (
    <Phone side="B" role="Destinatário" city={destination} contact={{ initials: 'AS', name: 'Ana Souza' }} footer={footer} align="end">
      <div className={styles.outgoing}><p className={styles.text}>Como está o tempo aí?</p></div>
      {!visible && <p className={styles.waiting}>Sem mensagens novas</p>}
      {visible && transfer && payload && (
        <div className={styles.incomingMedia}>
          {payload.kind === 'text' ? (
            <p className={snap.t >= STAGE_START.render ? styles.text : `${styles.text} ${styles.cipherText}`}>
              {snap.t >= STAGE_START.render
                ? new TextDecoder().decode(transfer.delivered)
                : snap.received.map((seq) => hex(transfer.packets[seq].payload, 12)).join(' ') || '…'}
            </p>
          ) : (
            <div className={styles.frame}>
              {decrypted && payload.kind === 'photo' && <img className={styles.media} src={transfer.deliveredUrl} alt={`Foto recebida: ${payload.name}`} />}
              {decrypted && payload.kind === 'video' && <video className={styles.media} src={transfer.deliveredUrl} autoPlay muted loop playsInline controls={done} aria-label={`Vídeo recebido: ${payload.name}`} />}
              <CipherTiles snap={snap} packets={transfer.packets} />
            </div>
          )}
          <div className={`${styles.meta} ${done ? styles.ok : recovering ? styles.warn : ''}`}>
            <span>{receiverStatus(snap, lost, done && transfer.intact ? transfer.delivered.length : null)}</span>
          </div>
        </div>
      )}
    </Phone>
  );
}
