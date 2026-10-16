# Feature: streaming sob demanda (HLS/DASH)

> Status: **SPEC APROVADA (2026-10-16)**. Mockup: artboard "v9 — Streaming" (**aprovado em 2026-10-16**). Plano: [tasks/streaming/plan.md](../tasks/streaming/plan.md) · Tarefas: [tasks/streaming/todo.md](../tasks/streaming/todo.md).

## Premissas (respondidas pelo usuário na entrevista de 2026-10-16)

1. **Tipo = sob demanda** (Netflix/YouTube): HTTP adaptativo em segmentos, sobre TCP. Ao vivo (WebRTC/UDP) fica fora.
2. **Lição principal = buffer e adaptação**: o player acumula folga, mede a rede e sobe ou desce a qualidade; quando a folga acaba, trava (rebuffering).
3. **Papéis = origem + CDN**: Ana publicou o vídeo, que está no **servidor de origem na cidade de A**. Kenji assiste. O 1º pedido de cada segmento vai até a origem (cache miss) e passa pela **borda (CDN) na cidade mais próxima de B**; os seguintes saem da borda.
4. **Rede = perfis prontos de banda ao longo do tempo** (determinísticos), aplicados à última milha de Kenji. Sem slider ao vivo.
5. **ABR = algoritmo real e publicado: dash.js "Dynamic"** (throughput com buffer baixo, BOLA com buffer alto), mostrando a decisão a cada segmento.
6. **Bytes reais = re-encoding real**: o vídeo é transcodificado no navegador em 4 qualidades (WebCodecs, H.264), segmentado em fMP4/CMAF e reproduzido de verdade por MSE no telefone de Kenji. Dependência nova autorizada: **mediabunny** (demux, WebCodecs e mux fMP4).
7. **Transporte = TCP com janela de congestionamento**: uma conexão HTTP/2 + TLS 1.3 reutilizada, slow start, CUBIC simplificado, perda corta a janela e gera SACK/retransmissão.
8. **Globo = segmentos como rajadas**: cada segmento voa como uma amostra de pacotes magenta (não os ~900 pacotes reais de um segmento 1080p); a contagem real fica no HUD.
9. **Sessão = ~30 s de vídeo em segmentos de 2 s** (15 segmentos).
10. **Escada = 4 degraus**: 240p 400 kbps · 480p 1,2 Mbps · 720p 2,8 Mbps · 1080p 5 Mbps.
11. **Vídeo padrão = gerado no navegador** (animação procedural em canvas, codificada pelo mesmo pipeline). Zero bytes no bundle.
12. **Criptografia = TLS 1.3 por conexão**: o handshake custa 1 RTT no início; cada segmento viaja cifrado com o AES-256-GCM real que já temos.
13. **Navegadores = Chromium + Safari**. Sem encode H.264 (Firefox), a simulação roda com tamanhos nominais e o telefone mostra um aviso no lugar do vídeo.
14. **Perda e MTU continuam valendo**: perda alimenta o TCP (corta a cwnd, o throughput medido cai e o ABR reage); MTU define o MSS. No Streaming os degraus de perda são **0 / 0,5 / 1 / 5 %** (aprovado após o mockup v9: a partir de 5 % o TCP desaba).
15. **QoE visível**: tempo de início, rebuffering (contagem + tempo total), bitrate médio e trocas de qualidade, e um gráfico no tempo (banda disponível × throughput medido × qualidade escolhida × nível do buffer).
16. **Interface**: decidida no mockup (o usuário delegou). Proposta abaixo.

## Objetivo

Mostrar, com mecanismos reais, por que um vídeo começa rápido em baixa qualidade, melhora sozinho, piora quando a rede cai e às vezes trava. A pessoa vê a mesma infraestrutura do modo atual (cabos, rota, TCP, perda), agora a serviço de um player que **decide** a cada 2 s.

### User stories
- Como usuário, escolho o modo **Streaming** e um perfil de rede ("4G oscilando"), aperto play e vejo Kenji assistir ao vídeo de Ana, que começa em 240p e sobe para 720p conforme o buffer enche.
- Como usuário, vejo no globo o 1º segmento cruzar o oceano até a borda e os demais saírem da borda, bem mais perto, e entendo por que CDN existe.
- Como usuário, no perfil "túnel", vejo o buffer esvaziar, o vídeo travar com "carregando" e o ABR baixar a qualidade na volta.
- Como usuário, leio por que o player escolheu cada qualidade: "throughput medido 3,1 Mbps × 0,9 → 720p" ou "BOLA: buffer 9,4 s → 1080p".
- Como usuário, envio o meu próprio vídeo (≤ 5 MB, nunca sai do navegador), ele é recodificado em 4 qualidades e a diferença entre elas fica visível no telefone de Kenji.

## Escopo técnico

### Núcleo puro: `src/sim/stream/` (sem React, DOM nem WebCodecs)
Mesmo contrato do modo atual: `planStream(config)` + `streamSnapshot(plan, t)`; **o tempo é a única entrada**.

- **`config`**: `ladder` (bitrate nominal e **tamanho real em bytes de cada segmento por qualidade**, vindos do encoder ou nominais), `segmentSec = 2`, `profile` (banda por tempo), `loss`, `mss` (do MTU), `rttOrigin`/`rttEdge` (das rotas, 5 µs/km × 2), `seed`.
- **Linha do tempo em segundos simulados** (1× = tempo real; ~30 s de vídeo + arranque + travadas). Diferente dos ticks do modo atual; o `store` mapeia.
- **Arranque**: TCP handshake (1 RTT) + TLS 1.3 (1 RTT) + pedido do manifesto (1 RTT) + 1º segmento. O player só começa a tocar com `minBuffer` (valor do dash.js, ver Perguntas).
- **Transporte por rodadas de RTT** (`sim/stream/tcp`): a cada RTT entregam-se `min(cwnd × MSS, banda × RTT)` bytes; slow start dobra a cwnd até `ssthresh`; perda (PRNG com seed, por pacote) faz `cwnd × 0,7` (β do CUBIC) e um SACK + retransmissão, que custa mais 1 RTT; **reinício após ociosidade** (RFC 7661 / slow start after idle) quando o player espera com buffer cheio. Isso explica por que o throughput medido oscila mesmo com banda fixa.
- **CDN**: borda = cidade mais próxima de B entre as 15 (excluindo B e a origem). Cache miss no 1º pedido de cada (segmento, qualidade): o caminho é origem → borda → B. Com cache hit: só borda → B. As duas rotas usam o `route()` existente.
- **ABR dash.js Dynamic** (`sim/stream/abr`): `ThroughputRule` (média do throughput medido, com o fator de segurança do dash.js) enquanto o buffer está abaixo do limiar; `BolaRule` acima dele; histerese entre os dois como no dash.js. Cada decisão gera um evento com regra, entradas e saída. Constantes copiadas do código-fonte do dash.js, com a versão citada no comentário.
- **Buffer e reprodução**: o nível do buffer sobe a cada segmento baixado e desce 1 s por segundo enquanto toca; em zero, **rebuffer** até voltar a ter `minBuffer`; teto de buffer igual ao do dash.js (não baixa além disso; é aí que aparece a ociosidade).
- **Eventos**: `connect`, `tls`, `manifest`, `request`, `cache-miss`, `cache-hit`, `segment-done`, `abr-decision`, `play`, `stall`, `resume`, `lost`, `sack`, `resend`, `end`.
- **QoE** derivado do plano: tempo de início, número e duração das travadas, bitrate médio exibido, trocas.

### Perfis de rede (`src/sim/stream/profiles.ts`)
Funções de banda por segundo, sem aleatoriedade além da seed:
- **Fibra estável**: 50 Mbps.
- **4G oscilando**: 2–12 Mbps, senoide + ruído com seed.
- **Queda no meio**: 20 Mbps → 1,5 Mbps entre 10 s e 20 s → 20 Mbps.
- **Túnel**: 8 Mbps, cai a 0,1 Mbps por 12 s (de 10 s a 22 s), volta. Com 5 s o buffer de ~10 s cobria a queda e nada travava (visto no mockup v9).

### Mídia real: `src/lib/media/` (navegador, fora do `sim`)
- `encodeLadder(file | procedural)`: com **mediabunny**, lê o vídeo, recorta/repete até 30 s, transcodifica em 4 qualidades H.264 (WebCodecs) com keyframe a cada 2 s e gera, por qualidade, um init segment + 15 segmentos fMP4 (CMAF). Devolve os bytes e os tamanhos.
- O encode leva segundos: enquanto ele roda, o plano usa **tamanhos nominais** (bitrate × 2 s) e o telefone mostra o progresso. Quando termina, o plano é refeito com os tamanhos reais (mesmo padrão do upload atual, que reinicia o envio).
- **Vídeo procedural**: animação em canvas com contador de tempo, texto fino e textura de alta frequência (mostram a perda de qualidade em 240p).
- **Player**: `<video>` + `MediaSource`; anexa os segmentos na qualidade que o plano escolheu, em ordem; **o `<video>` fica pausado** e o `currentTime` vem do snapshot (`playhead(t)`). Scrubber, pause e "próxima etapa" continuam funcionando. Em rebuffer, o frame congela e aparece "carregando".
- Cada segmento passa pelo AES-256-GCM real (`sim/crypto`) entre origem e B, como registro TLS.
- Detecção de suporte: `VideoEncoder.isConfigSupported` (H.264) e `MediaSource.isTypeSupported`. Sem suporte → aviso + tamanhos nominais.

### Interface (proposta para o mockup "v9 — Streaming")
- **Barra superior**: segmented novo **Transferência | Streaming**. Em Streaming, o seletor de conteúdo vira **perfil de rede**; perda, MTU e rota continuam.
- **A · Origem** (Ana): telefone mostra o vídeo publicado e o progresso do encode; o cartão de detalhes vira **Escada**: grade 4 qualidades × 15 segmentos. A célula pedida é marcada por borda, as já na borda (CDN) por preenchimento; a qualidade se diferencia por **altura/peso**, nunca por cor.
- **Rede**: globo com as duas rotas (origem → borda tracejada, borda → B sólida) e a borda rotulada "CDN"; rajadas magenta por segmento; HUD com cwnd, throughput medido, regra ABR ativa. Abas: **Eventos | Segmento | Gráfico** (o gráfico de QoE em linhas brancas/cinzas com padrões de traço; a travada aparece como faixa hachurada).
- **B · Kenji**: telefone com o `<video>` real, rótulo de qualidade ("720p"), "carregando" na travada; cartão **Buffer**: barra de segundos à frente do playhead, com o teto marcado e os segmentos como blocos de altura = qualidade.
- **Cores**: nenhuma nova. Magenta = segmento em trânsito; vermelho = pacote perdido; âmbar = SACK/retransmissão; verde = vídeo tocou até o fim. Travada usa forma (hachura, "carregando"), não cor.
- **Etapas** (dock "próxima etapa"): 1 Codificação (A) · 2 Conexão + TLS (Rede) · 3 Manifesto (Rede) · 4 Arranque (B) · 5 Reprodução adaptativa (B/Rede) · 6 Fim (B).

### Consumidores afetados
`store` (modo, perfil, `streamPlan`, `media`), `components/Dock/NetworkControls` (modo + perfil), `Globe/Traffic` + `Globe/Route` (segunda rota, rajadas), `Chat/ReceiverPhone` (player), novos `Cards/Ladder`, `Cards/Buffer`, `Cards/QoeChart`, `lib/media/*`, `lib/describe` (textos das decisões).

## Commands

Os mesmos de [AGENTS.md](../AGENTS.md) §2. `npm run build` obrigatório (dependência nova).

## Estrutura / Estilo

- `src/sim/stream/{engine,tcp,abr,profiles,qoe}.ts`: puros, TDD, cobertos pelo limite de 90 %.
- `src/lib/media/{encode,procedural,player}.ts`: navegador; a lógica pura (recorte para 30 s, cálculo de keyframes, ordem de anexação) separada e testada.
- Estilo do código igual ao de `sim/engine.ts`: constantes nomeadas no topo, comentários dizendo o *porquê*, `ponytail:` nas simplificações.

```ts
// dash.js v5 ThroughputRule: pick the highest rendition below measured throughput × safety factor.
export function throughputPick(ladder: Rendition[], measuredKbps: number): number {
  const budget = measuredKbps * THROUGHPUT_SAFETY;
  return Math.max(0, ladder.findLastIndex((r) => r.kbps <= budget)); // nothing fits → lowest rung
}
```

## Testing Strategy

- `tests/stream/tcp.test.ts`: slow start dobra a cwnd por RTT; uma perda corta para 0,7; banda limita a entrega; reinício após ociosidade volta ao `initcwnd`; mesma seed → mesmas perdas.
- `tests/stream/abr.test.ts`: casos tirados do dash.js (mesmas entradas → mesma escolha) para ThroughputRule, BolaRule e a troca Dynamic com histerese.
- `tests/stream/engine.test.ts`: "fibra estável" chega a 1080p e não trava; "túnel" trava ≥ 1 vez e cai para 240p; buffer nunca passa do teto nem fica negativo; o 1º segmento é cache miss e o 2º (mesma qualidade) é hit; `streamSnapshot` é função pura de (plano, t); playhead nunca passa do baixado.
- `tests/stream/qoe.test.ts`: métricas batem com um plano montado à mão.
- `lib/media`: lógica pura com Vitest; o encode real (WebCodecs) não roda no jsdom → validação no navegador, só quando pedida.
- Componentes (jsdom + Testing Library): `data-quality`, `data-stalled`, `data-cache`, `data-rule` como estado testável.

## Boundaries

- **Sempre**: tempo como única entrada (o `<video>` obedece ao `t`); determinismo por seed; arquivos do usuário nunca saem do navegador; constantes do ABR citando a versão do dash.js; mockup aprovado antes da UI; `npm test` + `npm run lint` + `npm run build` verdes.
- **Perguntar antes**: qualquer dependência além de mediabunny (ex.: dash.js/hls.js como biblioteca); cor nova; mudar escada, duração ou perfis; suportar Firefox via VP9/AV1.
- **Nunca**: tocar o `<video>` em tempo real desacoplado do `t`; `Math.random` no núcleo; buscar vídeo ou manifesto na rede; um objeto 3D por pacote real.

## Success Criteria

1. No modo Streaming, "fibra estável" começa a tocar em < 1,5 s simulados (SP → Tóquio), chega a 1080p em ≤ 4 segmentos e não trava.
2. "Túnel" produz ≥ 1 travada, a qualidade cai na volta e sobe de novo; o gráfico mostra a faixa da travada.
3. Cada decisão do ABR aparece no log com regra (Throughput/BOLA), entradas e qualidade escolhida, e bate com o dash.js para as mesmas entradas (testes).
4. O 1º segmento atravessa origem → borda → B no globo; os hits saem só da borda; o HUD mostra o RTT de cada caminho.
5. O telefone de Kenji mostra o vídeo **realmente** recodificado, com a diferença visível entre 240p e 1080p; scrubber e pause posicionam o frame certo.
6. Upload próprio (≤ 5 MB) é recodificado nas 4 qualidades e o plano passa a usar os tamanhos reais.
7. Sem WebCodecs H.264: aviso no telefone, simulação completa com tamanhos nominais, nenhum erro no console.
8. Mesma seed + mesmo perfil + mesma rota → mesmo plano (mesmas decisões, perdas e travadas).
9. Modo Transferência intacto (testes atuais verdes).
10. Cockpit sem rolagem em ≥ 1100×640; contraste ≥ 4.5:1, nomes acessíveis e `reduced-motion` como no AGENTS.md §7–8.
11. `src/sim/` continua ≥ 90 % de cobertura.

## Decisões

1. **Escopo único, entrega em fatias**: é uma capacidade só (o player), mas o plano entrega em 3 fatias verificáveis: (a) núcleo `sim/stream` com tamanhos nominais; (b) UI do mockup v9 sobre esse núcleo; (c) mídia real (mediabunny + MSE). A fatia (a) + (b) já ensina a lição sem o encode.
2. **Borda da CDN numa das 15 cidades**: em SP → Tóquio, a borda cai em Hong Kong, não em Tóquio (que não tem um nó próprio de CDN). `ponytail:` é um limite consciente (CDNs reais têm borda na cidade); para evoluir, use o modo "mesma cidade de B".
3. **Gargalo só na última milha**: o perfil limita o enlace de Kenji; cabos e backbone não congestionam. `ponytail:`, sem tráfego concorrente.
4. **TLS modelado, AES real**: o handshake é contado em RTTs e não há troca de chaves real; os bytes de cada segmento são cifrados e decifrados de verdade.
5. **Pré-busca na borda (aprovada com o mockup v9)**: com um único espectador, "miss no 1º pedido de cada (segmento, qualidade)" faria todo segmento ser miss. Num miss, a borda busca o segmento pedido e **pré-busca os próximos 3 da mesma qualidade** (como fazem CDNs de mídia). Resultado: miss no arranque e a cada troca de qualidade, hit no resto.
6. **Perda de fila no gargalo (mockup v9)**: mesmo com perda 0 %, a cwnd que passa de 2 × BDP + 4 MSS transborda a fila do gargalo e perde um pacote. Sem isso, a janela cresceria sem limite. Perdas de 5 % ou mais derrubam o TCP para 240p–480p em qualquer perfil. Por isso o modo Streaming usa degraus de 0 / 0,5 / 1 / 5 % (pergunta 6).

7. **Constantes reais do dash.js v5.2.1 (T10.0, 2026-10-16)**: elas valem mais que o mockup. Ficam em `src/sim/stream/dashjs.ts`. O que mudou:
   - Troca para BOLA com buffer ≥ 12 s e volta com < 6 s.
   - Teto do buffer de **18 s** abaixo do topo e **30 s** em 1080p. Isso substitui o "teto 12 s" do mockup; a trilha do buffer (B) passa a ir até 30 s.
   - Throughput por EWMA (3 s / 8 s, a menor) × 0,9, medido sem o tempo até o 1º byte.
   - Estimativa inicial de 1.000 kbps.
   - **InsufficientBufferRule** entra no modelo, porque é ela que derruba para a menor qualidade quando o buffer esvazia. A escolha final é o mínimo entre as regras ativas, como no `ABRRulesCollection`.
   - Consequência: a lição "conexão ociosa volta ao slow start" só aparece abaixo de 1080p (teto de 18 s). Os Critérios 1 e 2 serão reconferidos na T10.3 com esses valores.

### Achados do modelo do mockup (SP → Tóquio, borda em Hong Kong, RTT borda 40 ms, origem 259 ms)
- Fibra: começa em 0,85 s e chega a 1080p no **4º** segmento (o 1º throughput medido sai baixo por causa do slow start), não no 3º. O Critério 1 passou para "≤ 4 segmentos".
- Túnel (12 s): 1 travada de 3,8 s. Na volta o ABR cai de 1080p para 720p, não para 240p (a média de 3 amostras amortece a queda). O Critério 2 exige só que a qualidade caia, sem fixar 240p.

## Perguntas respondidas (2026-10-16, propostas aceitas)

1. **Constantes do dash.js**: `minBuffer` de arranque, teto do buffer, limiar e histerese Throughput ↔ BOLA e fator de segurança são conferidos no código-fonte da versão estável atual do dash.js na fase de plano; a versão fica citada no código.
2. **`initcwnd`** = 10 MSS (RFC 6928, padrão do Linux).
3. **Ociosidade**: a cwnd reinicia após 1 RTO ocioso (`tcp_slow_start_after_idle = 1`, padrão do Linux).
4. **Áudio**: fora; a faixa de áudio é descartada no encode.
5. **Velocidade**: 1× = tempo real (≈ 32 s por sessão); 2×–4× ficam no dock.

6. **Degraus de perda no Streaming** (2026-10-16): 0 / 0,5 / 1 / 5 %. A Transferência mantém 0 / 5 / 12 / 30 %.
7. **Critérios 1 e 2** (2026-10-16): ajustados como acima.

8. **Outras regras ligadas por padrão no dash.js** (2026-10-16): **entram as duas**, para ser fiel ao dash.js.
   - **SwitchHistoryRule**: janela de 8 decisões; se uma qualidade cai demais (quedas / não-quedas > 7,5 %), limita à qualidade abaixo dela.
   - **AbandonRequestsRule**: durante o download, se a previsão passar de 1,8 × a duração do segmento, abandona e pede de novo numa qualidade que a banda aguenta. No máximo uma vez por segmento.
   - Novos eventos: `abandon` (com bytes desperdiçados) e `history-cap`. A Escada mostra o segmento abandonado como célula tracejada na qualidade original.
