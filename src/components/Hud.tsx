import { RUNG_LABEL } from '../copy';
import { focusAt } from '../lib/camera';
import { mbps, routeSummary, whereOnRoute } from '../lib/describe';
import { useSnapshot, useStreamSnapshot } from '../lib/useSim';
import { STREAM_STAGES } from '../sim/stream/types';
import { useSim } from '../store';
import styles from './Hud.module.css';

/** Live counters in the corner of the globe, so the numbers sit next to the motion they describe. */
export function Hud() {
  const stream = useSim((s) => s.mode === 'stream');
  return stream ? <StreamHud /> : <TransferHud />;
}

const STARTUP = STREAM_STAGES.indexOf('startup');

function StreamHud() {
  const snap = useStreamSnapshot();
  const plan = useSim((s) => s.streamPlan);
  const { sample, download } = snap;
  const ms = (rtt: number) => `${Math.round(rtt * 1000)} ms`;
  return (
    <dl className={styles.hud} aria-label="Números do streaming">
      <div><dt>Qualidade</dt><dd>{snap.playingRung >= 0 ? RUNG_LABEL[snap.playingRung] : '—'}</dd></div>
      <div><dt>Throughput medido</dt><dd className={styles.small}>{mbps(sample.thrKbps)} · banda {sample.bwMbps.toFixed(1).replace('.', ',')} Mbps</dd></div>
      <div><dt>cwnd</dt><dd className={styles.small}>{sample.cwnd} pacotes</dd></div>
      <div><dt>ABR</dt><dd className={styles.small}>{snap.stage < STARTUP ? '—' : sample.bola ? 'BOLA' : 'Throughput'}</dd></div>
      <div><dt>RTT</dt><dd className={styles.small}>borda {ms(plan.config.rttEdge)} · origem {ms(plan.config.rttOrigin)}</dd></div>
      <div><dt>Pacotes</dt><dd className={styles.small}>{download ? `${Math.ceil(download.bytesTotal / plan.config.mss).toLocaleString('pt-BR')} no segmento` : '—'}</dd></div>
    </dl>
  );
}

function TransferHud() {
  const snap = useSnapshot();
  const route = useSim((s) => s.route);
  const msPerTick = useSim((s) => s.msPerTick);
  const flying = snap.packets.filter((p) => p.state === 'transit' || p.state === 'resend').length;
  const lost = snap.events.filter((e) => e.kind === 'lost').length;

  return (
    <dl className={styles.hud} aria-label="Números do envio">
      <div><dt>Rota</dt><dd className={styles.small}>{routeSummary(route)} · ≈ {Math.round(100 * msPerTick)} ms</dd></div>
      <div><dt>Em voo</dt><dd>{flying}</dd></div>
      <div><dt>Recebidos</dt><dd>{snap.received.length}/{snap.packets.length}</dd></div>
      <div><dt>Perdidos</dt><dd className={lost ? styles.lost : undefined}>{lost}</dd></div>
      <div><dt>Cabo</dt><dd className={styles.small}>{whereOnRoute(route, focusAt(snap)).cable}</dd></div>
    </dl>
  );
}
