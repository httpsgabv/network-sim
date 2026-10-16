import { useId } from 'react';
import { STAGE_LABEL, DONE_LABEL, STREAM_STAGE_LABEL } from '../../copy';
import { ACTOR_GROUPS, STREAM_ACTOR_GROUPS } from '../../lib/actors';
import { send } from '../../lib/payload';
import { snapshotOf, useSnapshot, useStreamSnapshot } from '../../lib/useSim';
import { STAGES, fromStagePos, toStagePos } from '../../sim/engine';
import { ENCODE_S, streamStagePos, streamStageTime } from '../../sim/stream/engine';
import { STREAM_STAGES } from '../../sim/stream/types';
import { useSim } from '../../store';
import { Segmented } from '../Segmented';
import styles from './Dock.module.css';

const SPEEDS = [
  { value: 0.25, label: '¼×' },
  { value: 0.5, label: '½×' },
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
  { value: 4, label: '4×' },
] as const;

const LOSSES = [
  { value: 0, label: '0%' },
  { value: 0.05, label: '5%' },
  { value: 0.12, label: '12%' },
  { value: 0.3, label: '30%' },
] as const;

const MTUS = [
  { value: 256, label: '256 B' },
  { value: 1024, label: '1 KB' },
  { value: 4096, label: '4 KB' },
  { value: 8192, label: '8 KB' },
] as const;

// SACK and resend stages share the "recovery" color everywhere.
const RECOVERY = new Set<number>([STAGES.indexOf('sack'), STAGES.indexOf('resend')]);

/** Shared by both modes: in Transferência it re-packetizes the payload, in Streaming it is the TCP MSS. */
export function MtuControl() {
  const { mode, mtu, transfer, setMtu } = useSim();
  const changeMtu = (value: number) => {
    setMtu(value);
    // a new MTU means re-packetizing (and re-encrypting) the same payload for real
    if (mode === 'transfer' && transfer) void send(transfer.payload);
  };
  return <Segmented label="Tamanho máximo do pacote (MTU)" caption="MTU" options={MTUS} value={mtu} onChange={changeMtu} mono />;
}

/** Scenario settings (each one restarts the send): live in the top bar, next to the content type. */
export function NetworkControls() {
  const { loss, setLoss } = useSim();
  return (
    <>
      <Segmented label="Taxa de perda de pacotes" caption="Perda" options={LOSSES} value={loss} onChange={setLoss} mono />
      <MtuControl />
    </>
  );
}

/** Playback controls: docked under the globe. */
export function Dock() {
  const { playing, speed, toggle, stepNext, restart, setSpeed } = useSim();
  const stream = useSim((s) => s.mode === 'stream');
  const done = useSim((s) => (s.mode === 'stream' ? s.t >= s.streamPlan.end : snapshotOf(s.plan, s.t).stage >= STAGES.length));

  return (
    <section aria-label="Controles da simulação" className={styles.dock}>
      <div className={styles.transport}>
        <button type="button" className={styles.play} onClick={toggle} aria-label={playing ? 'Pausar' : done ? 'Repetir' : 'Reproduzir'}>
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <rect x="2.5" y="1.5" width="3" height="11" rx="1" fill="currentColor" />
              <rect x="8.5" y="1.5" width="3" height="11" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M4 1.5l8.5 5.5L4 12.5z" fill="currentColor" />
            </svg>
          )}
        </button>
        <button type="button" className={styles.ghost} onClick={stepNext} aria-label="Próxima etapa">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 3l6 5-6 5zM12 3v10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </button>
        <button type="button" className={styles.ghost} onClick={restart} aria-label="Reiniciar">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2.5 8a5.5 5.5 0 1 0 1.7-4M2.5 2v3h3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {stream ? <StreamTimeline /> : <TransferTimeline />}

      <div className={styles.knobs}>
        <Segmented label="Velocidade" options={SPEEDS} value={speed} onChange={setSpeed} mono />
      </div>
    </section>
  );
}

function TransferTimeline() {
  const snap = useSnapshot();
  const { scrub, msPerTick } = useSim();
  const scrubId = useId();
  const done = snap.stage >= STAGES.length;
  return (
      <div className={styles.timeline}>
        <div className={styles.segments} aria-hidden="true">
          {/* who acts in each span of the bar: A · Rede · B */}
          {ACTOR_GROUPS.map((g, i) => (
            <div key={i} className={styles.group} style={{ gridColumn: `span ${g.stages.length}` }}
              data-active={!done && g.stages.includes(STAGES[snap.stage])}>
              {g.label}
            </div>
          ))}
          {STAGES.map((stage, i) => {
            const fill = done || snap.stage > i ? 1 : snap.stage === i ? snap.stageProgress : 0;
            const tone = RECOVERY.has(i) ? styles.recovery : '';
            return (
              <div key={stage} className={styles.segment} title={STAGE_LABEL[stage]}>
                <div className={`${styles.fill} ${tone}`} style={{ transform: `scaleX(${fill})` }} />
              </div>
            );
          })}
        </div>
        <div className={styles.meta}>
          <span>{done ? DONE_LABEL : STAGE_LABEL[STAGES[snap.stage]]}</span>
          <span>t+{Math.round(snap.t * msPerTick)} ms</span>
        </div>
        <label htmlFor={scrubId} className="sr-only">Linha do tempo</label>
        <input
          id={scrubId}
          type="range"
          min={0}
          max={STAGES.length * 100}
          step={1}
          value={Math.round(toStagePos(snap.t))}
          onChange={(e) => scrub(fromStagePos(Number(e.target.value)))}
          className={styles.scrub}
        />
      </div>
  );
}

const f2 = (n: number) => n.toFixed(2).replace('.', ',');

/** Streaming: six stages grouped A · Rede · B; time is seconds since Kenji pressed play. */
function StreamTimeline() {
  const snap = useStreamSnapshot();
  const plan = useSim((s) => s.streamPlan);
  const scrub = useSim((s) => s.scrub);
  const scrubId = useId();
  const done = snap.t >= plan.end;
  const pos = streamStagePos(plan, snap.t);
  return (
    <div className={styles.timeline}>
      <div className={styles.segments} style={{ gridTemplateColumns: `repeat(${STREAM_STAGES.length}, minmax(0, 1fr))` }} aria-hidden="true">
        {STREAM_ACTOR_GROUPS.map((g, i) => (
          <div key={i} className={styles.group} style={{ gridColumn: `span ${g.stages.length}` }} data-active={!done && g.stages.includes(snap.stage)}>
            {g.label}
          </div>
        ))}
        {STREAM_STAGES.map((stage, i) => (
          <div key={stage} className={styles.segment} title={STREAM_STAGE_LABEL[stage]}>
            <div className={styles.fill} style={{ transform: `scaleX(${Math.max(0, Math.min(1, pos / 100 - i))})` }} />
          </div>
        ))}
      </div>
      <div className={styles.meta}>
        <span>{STREAM_STAGE_LABEL[STREAM_STAGES[snap.stage]]}</span>
        <span>{snap.t < ENCODE_S ? 'codificando' : `t+${f2(snap.t - ENCODE_S)} s`}</span>
      </div>
      <label htmlFor={scrubId} className="sr-only">Linha do tempo</label>
      <input
        id={scrubId}
        type="range"
        min={0}
        max={STREAM_STAGES.length * 100}
        step={1}
        value={Math.round(pos)}
        onChange={(e) => scrub(streamStageTime(plan, Number(e.target.value)))}
        className={styles.scrub}
      />
    </div>
  );
}
