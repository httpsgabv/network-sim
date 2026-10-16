import type { Stage } from './sim/engine';
import type { StreamStage } from './sim/stream/types';

export const STAGE_LABEL: Record<Stage, string> = {
  send: 'Send',
  encrypt: 'Criptografia',
  packetize: 'Fatiamento',
  transit: 'Trânsito',
  sort: 'Ordenação',
  sack: 'Pedido de faltantes',
  resend: 'Retransmissão',
  decrypt: 'Descriptografia',
  render: 'Renderização',
};

export const STAGE_HINT: Record<Stage, string> = {
  send: 'O app serializa o conteúdo e entrega ao sistema operacional para envio.',
  encrypt: 'O payload é cifrado com a chave de sessão (AES-256-GCM). Só o destino consegue ler.',
  packetize: 'Os bytes cifrados viram pacotes numerados, cada um com seu cabeçalho.',
  transit: 'Os pacotes saltam entre CDNs por cabos submarinos, cada um com seu próprio tempo.',
  sort: 'O receptor ordena os pacotes pelo número de sequência e encontra as lacunas.',
  sack: 'Um SACK volta pela rota dizendo exatamente quais pacotes faltam.',
  resend: 'Só os pacotes faltantes são enviados de novo.',
  decrypt: 'Payload remontado. A tag GCM confere a integridade antes de decifrar.',
  render: 'O app decodifica e desenha o conteúdo na tela.',
};

export const DONE_LABEL = 'Visualizado';
export const DONE_HINT = 'Kenji visualizou. A confirmação de leitura volta para Ana.';

export const STREAM_STAGE_LABEL: Record<StreamStage, string> = {
  encode: 'Codificação',
  connect: 'Conexão + TLS',
  manifest: 'Manifesto',
  startup: 'Arranque',
  playback: 'Reprodução adaptativa',
  end: 'Fim',
};

/** Rung names, lowest first (STREAM_LADDER_KBPS). */
export const RUNG_LABEL = ['240p', '480p', '720p', '1080p'] as const;
