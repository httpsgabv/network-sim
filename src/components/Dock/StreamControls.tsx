import { sendDemo } from '../../lib/payload';
import { PROFILE_IDS, PROFILES } from '../../sim/stream/profiles';
import { KINDS, STREAM_LOSSES, useSim, type Kind, type Mode } from '../../store';
import { Segmented } from '../Segmented';
import { MtuControl, NetworkControls } from './Dock';

const MODES = [
  { value: 'transfer', label: 'Transferência' },
  { value: 'stream', label: 'Streaming' },
] as const satisfies readonly { value: Mode; label: string }[];

const KIND_OPTIONS = (Object.keys(KINDS) as Kind[]).map((k) => ({ value: k, label: KINDS[k].label }));
const PROFILE_OPTIONS = PROFILE_IDS.map((id) => ({ value: id, label: PROFILES[id].label, title: PROFILES[id].title }));
const STREAM_LOSS_OPTIONS = STREAM_LOSSES.map((v) => ({ value: v, label: `${String(v * 100).replace('.', ',')}%` }));

/** Transferência | Streaming, next to the brand: switching restarts the clock in the other mode. */
export function ModeSwitch() {
  const mode = useSim((s) => s.mode);
  const setMode = useSim((s) => s.setMode);
  return <Segmented label="Modo" options={MODES} value={mode} onChange={setMode} />;
}

/** Streaming scenario: Kenji's last-mile profile, its own loss steps and the MTU. */
export function StreamControls() {
  const { profile, streamLoss, setProfile, setStreamLoss } = useSim();
  return (
    <>
      <Segmented label="Perfil da rede de Kenji" caption="Rede" options={PROFILE_OPTIONS} value={profile} onChange={setProfile} />
      <Segmented label="Taxa de perda de pacotes" caption="Perda" options={STREAM_LOSS_OPTIONS} value={streamLoss} onChange={setStreamLoss} mono />
      <MtuControl />
    </>
  );
}

/** The top bar's scenario group for the current mode. */
export function ScenarioControls() {
  const mode = useSim((s) => s.mode);
  const kind = useSim((s) => s.kind);
  if (mode === 'stream') return <StreamControls />;
  return (
    <>
      <Segmented label="Tipo de conteúdo" options={KIND_OPTIONS} value={kind} onChange={(k) => void sendDemo(k)} />
      <NetworkControls />
    </>
  );
}
