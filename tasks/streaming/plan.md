# Plano — Feature: streaming sob demanda (HLS/DASH)

Fonte: [specs/streaming.md](../../specs/streaming.md) (aprovada em 2026-10-16) · Mockup: artboard **"v9 — Streaming"** em https://claude.ai/artifact/Ks6KXiYBF7JwR1Uw5fto6J (aprovado em 2026-10-16). O script da artboard já tem um modelo funcional do motor; ele serve de referência de comportamento, não de código a copiar.

## Abordagem

Três fatias, nesta ordem (Decisão 1 da spec). Cada uma termina com `npm test` e `npm run lint` verdes e já ensina algo sozinha:

- **(a) Núcleo** `src/sim/stream/`: puro e determinístico, com tamanhos **nominais**.
- **(b) Interface** do mockup v9 sobre esse núcleo. O player desenha o vídeo procedural num canvas, com desfoque por qualidade.
- **(c) Mídia real**: mediabunny + WebCodecs + MSE. Troca os tamanhos nominais pelos reais e o canvas pelo `<video>`.

```
perfil ─┐
rota (origem → borda, borda → B) ─► rttO, rttE ─┤
escada (tamanhos nominais | reais do encoder) ──┼─► sim/stream/engine.planStream(config) ─► StreamPlan
perda, MSS (MTU), seed ─────────────────────────┘        ├─ tcp.ts   (rodadas de RTT)
                                                          ├─ abr.ts   (dash.js Dynamic)
                                                          └─ qoe.ts
StreamPlan + t ─► streamSnapshot(plan, t) ─► useStreamSnapshot ─► Globe/StreamTraffic, Hud, Ladder, PlaybackBuffer, QoeChart, EventLog, StreamPlayer
lib/media: encodeLadder ─► { sizes, init + 15 fMP4 por qualidade } ─► store.streamMedia ─► re-plan ─► StreamPlayer (MSE, currentTime = playhead(t))
```

### Decisões de implementação

- **Modo no store**: `mode: 'transfer' | 'stream'`. O estado da Transferência não muda. O Streaming ganha `profile`, `streamLoss` (degraus 0 / 0,5 / 1 / 5 %), `streamPlan`, `streamMedia` e `streamSeg` (o segmento selecionado). Trocar de modo, perfil, perda, MTU ou rota zera `t`, como os outros controles de cenário.
- **Unidade de `t` por modo**: na Transferência, `t` continua em ticks; no Streaming, em **segundos simulados** (1× = tempo real). O `useClock` usa `ticksPerSecond(mode)`: `TICKS_PER_SECOND` ou 1. Um teste trava isso, porque é fácil misturar as unidades.
- **Motor = integração com passo fixo** (10 ms) dentro de `planStream`. O plano guarda: segmentos (pedido, 1º byte, fim, qualidade, regra, motivo, cwnd, perdas, miss), amostras a cada 100 ms (banda, buffer, playhead, travado, throughput, cwnd), travadas, cache da borda, perdas e eventos. O `streamSnapshot` é uma busca nesse plano: não simula nada, então é barato a 60 fps e uma função pura de (plano, t).
- **Determinismo**: as perdas usam `mulberry32(seed)` em ordem fixa de rodadas. O "4G oscilando" usa ruído com seed. Nada de `Math.random`.
- **Constantes do dash.js** num arquivo só (`sim/stream/dashjs.ts`): fator de segurança do throughput, janela de amostras, limiares e histerese Throughput ↔ BOLA, `minimumBufferS`, parâmetros do BOLA e teto do buffer. Cada uma vem do código-fonte de uma **versão fixada** do dash.js, citada no comentário (T10.0). Os valores do mockup (6 s / 4 s, BOLA por faixas) eram ilustrativos.
- **Borda da CDN**: `edgeOf(origin, destination)` em `data/network.ts` (cidade mais próxima de B, sem B nem a origem). Usa as duas rotas do `routeFor` memoizado. `rttE = 2 × km(borda → B) × 5 µs + 10 ms` (última milha) e `rttO = 2 × km(origem → borda) × 5 µs`.
- **Etapas**: Codificação (A) · Conexão + TLS · Manifesto (Rede) · Arranque · Reprodução adaptativa · Fim (B). Como no mockup, a Codificação ocupa **2 s fixos** no relógio. O encode real roda fora do relógio, com progresso próprio no telefone A. Quando termina, o plano é refeito com os tamanhos reais e `t` volta a 0, o mesmo padrão do upload na Transferência.
- **Player preso ao `t`**: na fatia (c), um `SourceBuffer` recebe, em ordem, o init segment e os segmentos de cada qualidade que o plano escolheu, uma vez por plano. O `<video>` fica sempre pausado, com `currentTime = playhead(t)`. O playhead nunca passa do que já foi baixado, então os frames anexados "antes da hora" nunca aparecem. Todas as qualidades usam o mesmo codec string H.264, para não precisar de `changeType`. No iPhone, usar `ManagedMediaSource` quando `MediaSource` não existir.
- **Globo**: `Globe/StreamTraffic` lê o snapshot com `getState()` dentro de `useFrame` e desenha as rajadas como **um `InstancedMesh`** (≤ 20 instâncias), com o núcleo branco. A rota origem → borda fica tracejada e vira magenta durante o miss; a rota borda → B fica em magenta. A borda é um quadrado (forma, não cor). O `CameraRig` ganha os alvos do mockup: origem na codificação, meio de origem → borda no miss, meio de borda → B no resto.
- **Reuso**: `Segmented`, `Phone`, `Details` (abas), `EventLog` (recebe a lista de eventos), `Dock` (6 etapas no Streaming) e `describe` (textos). Componentes novos só onde o mockup tem peça nova: `Ladder`, `PlaybackBuffer`, `QoeChart`, `SegmentCard`, `StreamPlayer`, `StreamTraffic`.

## Fatias

| # | Tarefa | Fatia | Depende de |
|---|---|---|---|
| T10.0 | Constantes do dash.js e versão do mediabunny fixadas | — | — |
| T10.1 | Perfis de rede + TCP por rodadas | a | — |
| T10.2 | ABR dash.js Dynamic | a | T10.0 |
| T10.3 | `planStream` + `streamSnapshot` + QoE | a | T10.1, T10.2 |
| T10.4 | Store: modo, perfil, plano, relógio em segundos, `edgeOf` | b | T10.3 |
| T10.5 | Barra superior: modo, perfil, perda por modo | b | T10.4 |
| T10.6 | Globo: duas rotas, borda, rajadas, câmera | b | T10.4 (paralela à T10.5) |
| T10.7 | Título da etapa, HUD e dock com 6 etapas | b | T10.4 |
| T10.8 | Escada (A) + buffer de reprodução (B) | b | T10.4 |
| T10.9 | Gráfico, Eventos e Segmento (coluna Rede) | b | T10.4 |
| T10.10 | Telefones: origem (A) e player procedural (B) com QoE | b | T10.8 |
| T10.11 | mediabunny + vídeo procedural + `encodeLadder` | c | T10.0 |
| T10.12 | Player MSE preso ao `t` | c | T10.10, T10.11 |
| T10.13 | Upload do vídeo do usuário | c | T10.12 |
| T10.14 | Detecção de suporte, `reduced-motion`, docs | c | T10.13 |

**Checkpoints**
- **Depois da T10.3**: tabela impressa dos 4 perfis × perdas para SP → Tóquio (início, travadas, qualidades, regras, misses), para você conferir com o mockup. Os Critérios 1, 2 e 8 viram testes.
- **Depois da T10.10**: a lição inteira funciona sem mídia real. `npm run build` verde; validação no browser só se você pedir.
- **Depois da T10.13**: `npm run build` verde (dependência nova). Validação no browser (Chromium e Safari) **só se você pedir**: o encode real não roda no jsdom.

## Riscos

| Risco | Mitigação |
|---|---|
| Constantes do dash.js diferem do mockup e o comportamento muda (ex.: o BOLA real escolhe baixo com buffer baixo) | T10.0 antes da T10.2; testes de cenário (T10.3) travam os critérios, não os números do mockup; se um critério cair, ajustar o perfil e registrar na spec |
| Encode de 4 × 30 s no navegador lento demais (1080p em CPU) | `hardwareAcceleration: 'prefer-hardware'`; codificar de baixo para cima (240p fica pronto primeiro); o plano nominal já roda enquanto isso; medir na T10.11 e, se passar de ~20 s, perguntar se reduzimos a 720p o degrau de cima |
| Safari/iPhone: `MediaSource` ausente no iPhone; H.264 por WebCodecs só no Safari ≥ 16.4 | `ManagedMediaSource` como alternativa; detecção por `isConfigSupported` + `isTypeSupported`; sem suporte → aviso + nominal (Critério 7) |
| Trocar a resolução no meio do `SourceBuffer` falhar | Mesmo codec string em todas as qualidades e o init segment de cada qualidade anexado antes do 1º segmento dela; se ainda falhar, um `SourceBuffer` por troca (registrar como `ponytail:`) |
| API do mediabunny mudar entre versões | Versão exata no `package.json` (sem `^`), fixada na T10.0 |
| Misturar ticks e segundos no store | `ticksPerSecond(mode)` + teste no `store.test.ts` |
| Laço infinito no motor (banda ~0, perdas seguidas) | O motor garante progresso de ≥ 1/4 MSS por rodada; teste com banda 0,05 Mbps e perda 5 % termina |
| Cockpit sem rolagem com 3 abas + gráfico | Mesma grade 248 px da linha de detalhes; o gráfico usa `viewBox` e encolhe; teste de layout é visual (só se pedido) |
