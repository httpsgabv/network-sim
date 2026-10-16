# Feature — Streaming sob demanda (spec, mockup v9 e plano aprovados em 2026-10-16)

Plano: [plan.md](plan.md). TDD em `src/sim/stream/`. Validação no browser só quando pedida.

## Fatia (a) — núcleo puro, tamanhos nominais

- [x] **T10.0 Constantes do dash.js e versão do mediabunny** (2026-10-16)
  - Feito:
    - `src/sim/stream/dashjs.ts` com as constantes do **dash.js v5.2.1** (tag de 2026-08-17, última estável), cada uma citando o arquivo de origem, mais `bolaParams()`.
    - `tests/stream/dashjs.test.ts` confere a propriedade documentada do BOLA: 240p em 10 s, 1080p em 18 s.
  - **mediabunny `1.61.0`** (2026-09-29, MPL-2.0). A 1.61.5 (`latest`) saiu em 2026-10-15, e a regra é usar versões com ≥ 2 semanas. Vai para o `package.json` sem `^`
  - O que muda em relação ao mockup v9 (registrado na spec, Decisão 7):
    - BOLA entra com buffer ≥ **12 s** e sai com < **6 s** (o mockup usava 6 s / 4 s).
    - O teto do buffer é **18 s** abaixo do topo e **30 s** em 1080p. Num vídeo de 30 s, isso significa que em 1080p o player baixa tudo e não fica ocioso (o mockup usava 12 s).
    - O throughput é uma **EWMA** (meias-vidas de 3 s e 8 s, peso = 1,5 × segundos de download, vence a menor) × 0,9, e é medido **sem o tempo até o 1º byte**. O mockup usava a média de 3 amostras, com latência.
    - Sem medição, o player assume **1.000 kbps** e escolhe 240p.
    - **InsufficientBufferRule** (ligada por padrão): com o buffer vazio, cai para a menor qualidade; fora isso, limita a qualidade a 0,7 × throughput × buffer / 2 s. A escolha final é o **mínimo** entre as regras.
  - Decidido (2026-10-16, pergunta 8): **SwitchHistoryRule e AbandonRequestsRule entram**. As constantes e a mecânica estão no `dashjs.ts`; a implementação fica na T10.2 (regras) e na T10.3 (abandono no meio do download, evento `abandon`)
  - Aceite: `src/sim/stream/dashjs.ts` com as constantes da `ThroughputRule`, da `BolaRule` e da estratégia Dynamic (fator de segurança, janela de amostras, limiares e histerese da troca, `minimumBufferS`, `bufferTarget`, utilidades), cada uma com a versão do dash.js e o arquivo de onde saiu. A versão exata do mediabunny e a licença (MPL-2.0) ficam anotadas aqui no todo
  - Fonte: código-fonte oficial no GitHub (`Dash-Industry-Forum/dash.js`), numa tag estável; nada de blog
  - Verificar: revisão sua da tabela de constantes antes da T10.2
  - Arquivos: `src/sim/stream/dashjs.ts`, `tasks/streaming/todo.md`
- [x] **T10.1 Perfis de rede + TCP por rodadas** (2026-10-16)
  - Feito:
    - `profiles.ts`: ids `fiber | lte | drop | tunnel`, `bwMbps(x, seed)` puro. O ruído do 4G é um hash por (meio segundo, seed), para poder amostrar qualquer `x` em qualquer ordem.
    - `tcp.ts`: `round()`, `afterIdle()`, `rtoOf()`, `newConnection()`. O `rand` é chamado uma vez por rodada, para a sequência da seed não desalinhar.
    - 22 testes; `src/sim/stream/` com 100 % de linhas e ramos.
  - Decisões tomadas no caminho:
    - **Ociosidade = `tcp_cwnd_restart` do Linux**, não "volta direto a 10": a janela cai pela metade a cada RTO ocioso, com piso em min(10, cwnd), e o `ssthresh` guarda ¾ da janela antiga. RTO = RTT + 200 ms (`TCP_RTO_MIN`).
    - **Perda na fila não tira bytes da rodada**: o gargalo continua entregando 1 BDP. A perda aleatória tira 1 segmento. As duas custam +1 RTT (SACK + reenvio rápido).
    - **Sem crescer a janela quando a aplicação é que limita** (`tcp_is_cwnd_limited`); acontece na última rodada de cada segmento.
    - Crescimento Reno (+1/RTT) no lugar do cúbico, com o mesmo β = 0,7 (`ponytail:`).
  - Aceite:
    - `profiles.ts`: Fibra (50 Mbps), 4G (2–12 Mbps, ruído com seed), Queda (20 → 1,5 → 20 entre 4 s e 14 s, mudança da T10.3) e Túnel (8 Mbps, 0,1 Mbps de 10 s a 22 s), como funções puras `bw(x, seed)`.
    - `tcp.ts`: `round(state, { bwBps, rtt, mss, loss, rand })`. A entrega por rodada é `min(cwnd × MSS, banda × RTT, restante)`. Tem slow start, `ssthresh`, CUBIC simplificado com β = 0,7 (comentário `ponytail:` com o limite) e perda por PRNG ou por estouro da fila (> 2 × BDP + 4 MSS), com +1 RTT de SACK/reenvio. `afterIdle(state, idle, rto)` volta a `initcwnd = 10` (RFC 6928 / RFC 7661). Toda rodada entrega pelo menos 1/4 de MSS.
  - Testes: a cwnd dobra por RTT no slow start; uma perda corta para 0,7; a banda limita a entrega; a ociosidade > RTO reinicia a cwnd; mesma seed → mesmas perdas; banda de 0,05 Mbps com 5 % de perda termina
  - Verificar: `npm test -- stream/tcp stream/profiles`
  - Arquivos: `src/sim/stream/{profiles,tcp}.ts`, `tests/stream/{profiles,tcp}.test.ts`
- [x] **T10.2 ABR dash.js Dynamic** (2026-10-16)
  - Feito:
    - `ewma.ts`: `addSample` e `estimate` da EWMA do dash.js.
    - `abr.ts`: `decide()`, `updateDynamic()`, `onSegmentLoaded()`, `onBufferEmpty()`, `shouldAbandon()`, `onAbandon()`, `optimalFor()` e `minBufferLevelFor()`. São funções puras sobre um `AbrState` imutável, e o motor (T10.3) chama os `on*` na ordem dos eventos do dash.js.
    - 34 testes novos; `abr.ts` com 100 % de linhas e 91 % de ramos.
  - Mudança: **a decisão devolve um `Reason` estruturado** (regra, throughput seguro, teto, buffer, placeholder, fase do BOLA), não texto pt-BR. O texto fica no `lib/describe` (T10.7), como no resto do núcleo.
  - Detalhes do código-fonte que o mockup não tinha:
    - O BOLA nasce na 1ª consulta, em "startup" (escolhe pelo throughput e ajusta o placeholder). Passa a "steady" na decisão seguinte a um segmento carregado com buffer ≥ a duração dele.
    - No steady, o BOLA soma ao placeholder o tempo parado desde o último download, aplica o BOLA-O e pode pedir **espera** ao agendador (`delayS`), gastando o placeholder antes.
    - A cada segmento, o placeholder decai × 0,99 e é cortado ao máximo da qualidade atual. O buffer vazio zera o placeholder.
    - Sem medição e com o buffer vazio, nenhuma regra pede troca: fica na qualidade inicial (1.000 kbps → 240p).
    - Depois de um abandono: o histórico de trocas é zerado e, por 10 s (`abandonLoadTimeout`), só valem descidas e a ThroughputRule fica quieta.
  - Pendente para a T10.3: os `traces` de progresso do abandono contam rodadas de RTT, não eventos de XHR (`ponytail:` no `dashjs.ts`).
  - Aceite: `abr.ts` exporta `throughputRule`, `bolaRule` (estados startup/steady, placeholder, BOLA-O), `insufficientBufferRule`, `switchHistoryRule` (janela de 8) e `decide(state, inputs) → { rendition, rule, why }`, que aplica a troca Dynamic e pega o **mínimo** entre as regras ativas (como o `getMinSwitchRequest`). Também exporta `shouldAbandon(download, inputs)` (AbandonRequestsRule). O throughput vem de uma EWMA (`ewma.ts`, meias-vidas de 3 s e 8 s). O `why` é o texto pt-BR do log ("Throughput: média 3,1 Mbps × 0,9 = 2,8 Mbps → 720p" / "BOLA: buffer 9,4 s → 1080p"); o 1º segmento, sem medição, sai na menor qualidade
  - Testes: casos com as mesmas entradas e saídas do dash.js (tirados do código ou dos testes dele) para cada regra; a troca Dynamic respeita a histerese nos dois sentidos; o mínimo entre as regras; o abandono acontece no máximo uma vez por segmento e nunca na menor qualidade
  - Verificar: `npm test -- stream/abr`
  - Arquivos: `src/sim/stream/{abr,ewma}.ts`, `tests/stream/{abr,ewma}.test.ts`
- [x] **T10.3 `planStream` + `streamSnapshot` + QoE** (2026-10-16)
  - Feito:
    - `types.ts`: `StreamConfig`, `Attempt` (uma por pedido HTTP; o abandono gera outra), `StreamEvent` tipado (sem texto), `Sample`, `StreamPlan`, `StreamSnapshot`.
    - `engine.ts`: `planStream`, `streamSnapshot`, `nominalSizes` (±18 % VBR com seed). O passo é de 10 ms e as amostras, de 100 ms.
    - O agendador do dash.js pede quando `buffer + 2 s < alvo` e reconfere a cada 500 ms (`scheduling.defaultTimeout`). O BOLA pode pedir espera (`bola-wait`).
    - O throughput é medido do 1º ao último byte (Resource Timing).
    - O abandono é checado a cada rodada de RTT.
    - `qoe.ts`: `qoeAt(plan, t)`.
    - 19 testes; `src/sim/stream/` com 100 % de linhas.
  - Critérios 1, 2 e 8 viraram testes e passam:
    - Fibra começa em 0,84 s e chega a 1080p no 3º segmento.
    - O Túnel trava 7,8 s, abandona o 1080p, cai para 240p e volta para 480p.
  - Checkpoint (SP → Tóquio, borda HK; RTT borda 40 ms, origem 259 ms; ᵇ BOLA, ⁱ InsufficientBuffer, ᵃ abandono, ✗ abandonado):

    | Perfil | Perda | Início | Travadas | Média | Sequência |
    |---|---|---|---|---|---|
    | Fibra | 0 % | 0,84 s | 0 | 4,55 Mbps | 240 720 1080 … 1080ᵇ |
    | Fibra | 1 % | 1,20 s | 0 | 1,41 Mbps | 240 240 480 … 480ᵇ 720ᵇ 720ᵇ 720ᵇ |
    | 4G | 0 % | 0,88 s | 0 | 2,27 Mbps | 240 720 1080 ×4 (1080✗) 480ᵃ 480ⁱ … |
    | Queda (10–20 s) | 0 % | 0,84 s | 0 | 4,55 Mbps | igual à Fibra: **o vídeo inteiro já está no buffer aos 10 s** |
    | Túnel | 0 % | 0,84 s | 1 (7,8 s) | 2,25 Mbps | 240 720 1080 ×5 (1080✗) 480ᵃ 240 ×5 480 480 |
    | qualquer | 5 % | 1,44 s | 0 | 0,40 Mbps | 240 do começo ao fim |

  - Achados:
    - **Queda aos 10 s não aparece.** O teto de 30 s em 1080p (dash.js) com só 30 s de vídeo faz o player baixar tudo antes. **Resolvido (2026-10-16): a Queda passou para 4 s a 14 s** (20 → 1,5 Mbps), com o resultado 240 720 1080 1080 1080 (1080✗) 480ᵃ 480ⁱ … 720 720 e sem travar.
    - A "conexão ociosa volta ao slow start" quase não acontece (0–1 vez por sessão). Em 1080p o teto de 30 s cobre o vídeo; ela só aparece abaixo do topo, com teto de 18 s.
    - Depois de um abandono, os 10 s de "só descer" seguram a qualidade baixa por vários segmentos: a InsufficientBufferRule é a única regra ativa.
  - Aceite:
    - `engine.ts` simula com passo de 10 ms: conexão (1 RTT), TLS (1 RTT), manifesto (miss: + RTT da origem), segmentos com miss + pré-busca de 3 na borda (Decisão 5), buffer com teto, espera ociosa, travada e retomada.
    - `planStream(config)` devolve segmentos, amostras de 100 ms, travadas, cache, perdas, eventos e os limites das 6 etapas.
    - `streamSnapshot(plan, t)` é uma busca pura no plano.
    - `qoe.ts` dá início, travadas (número e tempo), bitrate médio e trocas até `t`.
    - Valida a config (`RangeError`, como o `plan()`).
  - Testes (SP → Tóquio, RTTs fixos):
    - Critério 1: Fibra começa em < 1,5 s, chega a 1080p em ≤ 4 segmentos e não trava.
    - Critério 2: o Túnel trava ≥ 1 vez, cai de qualidade na volta e sobe de novo.
    - Critério 8: o plano é determinístico.
    - O buffer fica em [0, teto]; o playhead nunca passa do baixado; o 1º segmento é miss e o 2º, na mesma qualidade, é hit.
    - Snapshot puro.
  - Checkpoint: imprimir a tabela 4 perfis × perdas para você conferir com o mockup
  - Verificar: `npm test -- stream` e `npm run coverage` (`src/sim/` ≥ 90 %)
  - Arquivos: `src/sim/stream/{engine,qoe,types}.ts`, `tests/stream/{engine,qoe}.test.ts`

## Fatia (b) — interface do mockup v9 sobre o núcleo

- [ ] **T10.4 Store: modo, perfil, plano e relógio em segundos**
  - Aceite:
    - `store` ganha `mode`, `profile`, `streamLoss`, `streamPlan`, `streamSeg` e `setMode`/`setProfile`/`setStreamLoss`; trocar qualquer um deles, a rota ou o MTU refaz o plano e zera `t`.
    - `useClock` avança `t` com `ticksPerSecond(mode)`.
    - `edgeOf(origin, destination)` em `data/network.ts`.
    - `useStreamSnapshot()` memoiza por (plano, t), como `useSnapshot`.
  - Testes: no Streaming, 1 s de relógio = 1 s de `t`; na Transferência nada muda; a borda de SP → Tóquio é Hong Kong; nunca é a origem nem o destino (todos os 210 pares)
  - Verificar: `npm test -- store` e os testes atuais verdes (Critério 9)
  - Arquivos: `src/store.ts`, `src/lib/useSim.ts`, `src/data/network.ts`, `tests/store.test.ts`
- [ ] **T10.5 Barra superior: modo, perfil e perda por modo**
  - Aceite: segmented **Transferência | Streaming** depois da marca. No Streaming, o tipo de conteúdo dá lugar a **Rede: Fibra · 4G · Queda · Túnel** (com `title` descrevendo cada perfil) e a perda vira 0 / 0,5 / 1 / 5 %; MTU e rota iguais. Tudo com `aria-pressed` e alvos ≥ 32 px na barra (como hoje)
  - Testes: alternar o modo troca os grupos; escolher um perfil chama `setProfile` e zera `t`
  - Verificar: `npm test -- Dock`
  - Arquivos: `src/components/Dock/StreamControls.tsx`, `src/App.tsx`, `tests/Dock.test.tsx`
- [ ] **T10.6 Globo: duas rotas, borda, rajadas e câmera**
  - Aceite:
    - Rota origem → borda branca tracejada, que fica magenta durante o miss e o manifesto; rota borda → B em magenta, com marching dots enquanto baixa.
    - Borda como quadrado rotulado "<cidade> · CDN".
    - `StreamTraffic` com um `InstancedMesh` (≤ 20) e núcleo branco; densidade pelo throughput.
    - × vermelho nas perdas e ponto âmbar no reenvio.
    - Pulsos em A (codificação) e em B (segmento entregue).
    - Câmera nos alvos do plano, cortando sem pan em `reduced-motion`.
  - Testes: as funções puras de alvo da câmera e de posição das rajadas (em `lib/`) a partir do snapshot
  - Verificar: `npm test -- camera stream`; visual só se pedido
  - Arquivos: `src/components/Globe/{StreamTraffic,Route,Globe}.tsx`, `src/lib/camera.ts`, `tests/camera.test.ts`
- [ ] **T10.7 Título da etapa, HUD e dock com 6 etapas**
  - Aceite:
    - Chip do ator (A · Origem / Rede / B · Kenji) e "Etapa NN / 06".
    - Dica da etapa vinda do `describe`: a decisão ABR do segmento atual, "buffer no teto", "travou".
    - HUD: qualidade, throughput medido + banda, cwnd, regra ABR, RTT borda/origem, pacotes do segmento.
    - Dock: 6 etapas em 3 grupos; o scrubber e "próxima etapa" usam os limites do plano; o rodapé mostra `t+12,40 s`.
  - Testes: `describe` produz os textos do mockup para os casos-chave; "próxima etapa" pula para o próximo limite
  - Verificar: `npm test -- Dock describe`
  - Arquivos: `src/lib/describe.ts`, `src/components/Dock/Dock.tsx`, `src/components/Hud.tsx`, `tests/Dock.test.tsx`
- [ ] **T10.8 Escada (A) e buffer de reprodução (B)**
  - Aceite:
    - `Ladder`: 4 linhas × 15 colunas, com a altura da linha marcando a qualidade. Estados: só na origem, em cache na borda, em trânsito (borda magenta) e baixado (branco). Legenda e "4 × 15 seg · N na borda".
    - `PlaybackBuffer`: blocos à frente do playhead (altura = qualidade); o segmento chegando tracejado em magenta; marca do teto de 12 s; hachura quando trava; nota contextual.
    - `memo` por célula ou bloco.
  - Testes: `data-state` nas células (`origin` | `edge` | `transit` | `got`) e `data-stalled` no buffer batem com um snapshot montado à mão
  - Verificar: `npm test -- Ladder PlaybackBuffer`
  - Arquivos: `src/components/Cards/{Ladder,PlaybackBuffer}.tsx`, `src/components/Cards/Stream.module.css`, `tests/StreamCards.test.tsx`
- [ ] **T10.9 Gráfico, Eventos e Segmento (coluna Rede)**
  - Aceite:
    - No Streaming, as abas viram **Gráfico | Eventos | Segmento**.
    - `QoeChart` em SVG: escala log de Mbps com os 4 degraus, banda tracejada, throughput como pontos, qualidade pedida em degrau, buffer embaixo com o teto, faixas hachuradas nas travadas e playhead. Revela até `t`; tem `aria-label` com o resumo.
    - O `EventLog` reusa os chips de ator.
    - `SegmentCard`: ‹ ›, chip de estado, motivo da decisão e os 12 campos do mockup.
  - Testes: o caminho do gráfico só cobre amostras ≤ t; o segmento mostra "ainda não pedido" antes do pedido; os eventos vêm em ordem decrescente
  - Verificar: `npm test -- QoeChart SegmentCard`
  - Arquivos: `src/components/Cards/{QoeChart,SegmentCard,Details}.tsx`, `tests/StreamDetails.test.tsx`
- [ ] **T10.10 Telefones: origem (A) e player procedural (B)**
  - Aceite:
    - A: 1º frame, nome do arquivo, progresso da codificação por qualidade e botão "Enviar outro vídeo" (o `aria-label` fica no input; nesta fatia ainda é inerte).
    - B: frame procedural num `<canvas>` no `playhead(t)`, com desfoque por qualidade (provisório até a T10.12), selo da qualidade, "Carregando…" na travada, barra tocado/em buffer, status e QoE (início, travadas, bitrate médio, trocas).
  - Testes: `data-quality`, `data-stalled` e o status em pt-BR para cada etapa; a QoE bate com `qoe.ts`
  - Checkpoint: `npm run build` verde
  - Verificar: `npm test`, `npm run lint`, `npm run build`
  - Arquivos: `src/components/Chat/{OriginPhone,StreamPlayer}.tsx`, `src/lib/media/procedural.ts`, `tests/StreamPhones.test.tsx`

## Fatia (c) — mídia real

- [ ] **T10.11 mediabunny + vídeo procedural + `encodeLadder`**
  - Aceite:
    - `npm i mediabunny@<versão exata da T10.0>`, já autorizado na spec.
    - `encodeLadder(source, onProgress)` gera 4 qualidades H.264 com keyframe a cada 2 s e devolve init + 15 segmentos fMP4 por qualidade e os tamanhos reais.
    - A fonte procedural vem do canvas da T10.10.
    - Codifica de baixo para cima.
    - O store refaz o plano com os tamanhos reais e zera `t`.
  - Testes (puros): recorte e repetição até 30 s, agenda de keyframes, troca nominal → real no store; o encode real não roda no jsdom
  - Verificar: `npm test`, `npm run build`; medir o tempo de encode só se você pedir validação no browser
  - Arquivos: `package.json`, `src/lib/media/{encode,ladder}.ts`, `src/store.ts`, `tests/media.test.ts`
- [ ] **T10.12 Player MSE preso ao `t`**
  - Aceite:
    - O `StreamPlayer` troca o canvas por `<video muted playsinline>` + `MediaSource` (ou `ManagedMediaSource`).
    - Anexa os segmentos do plano em ordem, uma vez por plano.
    - O vídeo fica sempre pausado, com `currentTime = playhead(t)`.
    - Refaz o `MediaSource` quando o plano muda.
    - O arquivo leva um comentário `ponytail:` explicando que tudo é anexado de antemão.
  - Testes: a ordem de anexação (init antes do 1º segmento de cada qualidade) como função pura; `playhead` → `currentTime`
  - Verificar: `npm test`; o Critério 5 (diferença visível, scrubber) só no browser, se pedido
  - Arquivos: `src/components/Chat/StreamPlayer.tsx`, `src/lib/media/player.ts`, `tests/mediaPlayer.test.ts`
- [ ] **T10.13 Upload do vídeo do usuário**
  - Aceite:
    - O botão de A aceita vídeo ≤ 5 MB (`MAX_BYTES`); o arquivo nunca sai do navegador.
    - Recodifica nas 4 qualidades, mostra o progresso e, ao terminar, refaz o plano.
    - O erro em pt-BR diz o que fazer.
    - O áudio é descartado.
  - Testes: arquivo > 5 MB é recusado com a mensagem; o nome aparece no telefone A
  - Checkpoint: `npm run build` verde
  - Verificar: `npm test`, `npm run lint`, `npm run build`
  - Arquivos: `src/components/Chat/OriginPhone.tsx`, `src/lib/media/encode.ts`, `tests/StreamPhones.test.tsx`
- [ ] **T10.14 Suporte, `reduced-motion` e documentação**
  - Aceite:
    - Sem H.264 no WebCodecs ou sem MSE: aviso no telefone B, plano nominal e nenhum erro no console (Critério 7).
    - `reduced-motion`: sem autoplay, sem marching dots, pulsos nem rastros, câmera que corta.
    - Cockpit sem rolagem.
    - README (como usar o modo), AGENTS.md (§1 o que é; §4 a tabela de etapas do Streaming; §7 animação; §2 se houver comando novo) e capability map (S → ✅).
  - Testes: detecção de suporte com `VideoEncoder` / `MediaSource` falsos; `reducedMotion.test.tsx` cobre o modo Streaming
  - Verificar: `npm test`, `npm run lint`, `npm run build`, `npm run coverage`
  - Arquivos: `src/lib/media/support.ts`, `src/components/Chat/StreamPlayer.tsx`, `README.md`, `AGENTS.md`, `specs/capability-map.md`
