import { useId, useState, type FormEvent } from 'react';
import { endpointNames } from '../../lib/describe';
import { formatBytes, filePayload, send, textPayload } from '../../lib/payload';
import { useSnapshot } from '../../lib/useSim';
import { STAGE_START, STAGES } from '../../sim/engine';
import { useSim } from '../../store';
import styles from './Chat.module.css';
import { Phone } from './Phone';

function senderStatus(stage: number, sent: number, total: number, lost: number): string {
  if (stage >= STAGES.length) return 'Visualizada ✓✓';
  switch (STAGES[stage]) {
    case 'send': return 'Enviando…';
    case 'encrypt': return 'Cifrando…';
    case 'packetize': return `Fatiando em ${total}…`;
    case 'transit': return `Enviando ${sent}/${total}`;
    case 'resend': return lost ? `Reenviando ${lost}…` : 'Enviada ✓';
    case 'decrypt':
    case 'render': return 'Entregue ✓✓';
    default: return 'Enviada ✓';
  }
}

export function SenderPhone() {
  const snap = useSnapshot();
  const transfer = useSim((s) => s.transfer);
  const plan = useSim((s) => s.plan);
  const origin = useSim((s) => endpointNames(s.route).origin);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputId = useId(), fileId = useId();

  const total = plan.packets.length;
  const sent = plan.packets.filter((p) => snap.t >= p.depart).length;
  const lost = plan.packets.filter((p) => p.lost).length;
  const seen = snap.stage >= STAGES.length;
  const pressing = snap.t < STAGE_START.encrypt;
  const payload = transfer?.payload;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const message = text.trim();
    if (message) { setText(''); void send(textPayload(message)); }
    else if (payload) void send(payload);
  };

  const attach = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try { await send(await filePayload(file)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível ler o arquivo.'); }
  };

  const footer = (
    <form className={styles.composer} onSubmit={submit}>
      <label htmlFor={fileId} className={styles.attach} title="Anexar foto ou vídeo (até 5 MB)">
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 4v12M4 10h12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </label>
      <input id={fileId} type="file" accept="image/*,video/*" className="sr-only" aria-label="Anexar foto ou vídeo (até 5 MB)" onChange={(e) => { void attach(e.target.files?.[0]); e.target.value = ''; }} />
      <label htmlFor={inputId} className="sr-only">Mensagem</label>
      <input id={inputId} className={styles.input} placeholder="Mensagem" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
      <button type="submit" aria-label="Enviar" className={pressing ? `${styles.send} ${styles.sendActive}` : styles.send}>
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 16V4M4.5 9.5L10 4l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </form>
  );

  return (
    <Phone side="A" role="Remetente" city={origin} contact={{ initials: 'KT', name: 'Kenji Tanaka' }} footer={footer}>
      <div className={styles.incoming}>Como está o tempo aí?</div>
      {payload && (
        <div className={styles.outgoing}>
          {payload.kind === 'text' && <p className={styles.text}>{new TextDecoder().decode(payload.bytes)}</p>}
          {payload.kind === 'photo' && <img className={styles.media} src={transfer.previewUrl} alt={`Foto enviada: ${payload.name}`} />}
          {payload.kind === 'video' && <video className={styles.media} src={transfer.previewUrl} autoPlay muted loop playsInline aria-label={`Vídeo enviado: ${payload.name}`} />}
          <div className={styles.meta}>
            <span>{payload.kind === 'text' ? formatBytes(payload.bytes.length) : `${payload.name} · ${formatBytes(payload.bytes.length)}`}</span>
            <span className={seen ? styles.read : undefined}>{senderStatus(snap.stage, sent, total, lost)}</span>
          </div>
        </div>
      )}
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </Phone>
  );
}
