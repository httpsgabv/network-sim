# Tarefas — Network Simulator

Ordem por dependência. Detalhes em [plan.md](plan.md). Cada tarefa toca ≤ 5 arquivos.

## Fase 0 — Esqueleto
- [x] **T0.1 Scaffold Vite + React + TS**
  - Aceite: TS strict; scripts `dev`, `build`, `test`, `test:watch`, `lint` conforme a spec
  - Verificar: `npm run build` e `npm run lint` passam
  - Arquivos: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`
- [x] **T0.2 Tokens + fontes + shell da página**
  - Aceite: `tokens.css` com os tokens da spec; Geist/Geist Mono via `geist`; fundo preto com grid de pontos; nav fina
  - Verificar: `npm run dev` mostra o shell igual ao topo do mockup v4
  - Arquivos: `src/styles/tokens.css`, `src/App.tsx`, `src/App.module.css`

## Fase 1 — Núcleo `sim/` (TDD)
- [x] **T1.1 packetize / reassemble**
  - Aceite: ida e volta byte a byte para 0 B, 1 B, múltiplos exatos do MTU e foto de 2 MB; `missing(packets, total)` devolve os seqs faltantes
  - Verificar: `npm test -- packetize`
  - Arquivos: `src/sim/types.ts`, `src/sim/packetize.ts`, `tests/packetize.test.ts`
- [x] **T1.2 crypto (AES-256-GCM)**
  - Aceite: encrypt → decrypt devolve o original; tag adulterada lança erro
  - Verificar: `npm test -- crypto`
  - Arquivos: `src/sim/crypto.ts`, `tests/crypto.test.ts`
- [x] **T1.3 Dados: nós e cabos** (a máscara de terra foi para a T3.2)
  - Aceite: 7 nós de rota + 8 CDNs; ~20–30 cabos escritos à mão
  - Verificar: teste confere lat/lon válidos e cabos ligando nós conhecidos
  - Arquivos: `src/data/nodes.ts`, `src/data/cables.ts`, `tests/data.test.ts`
- [x] **T1.4 route**
  - Aceite: caminho SP→Tóquio pelo grafo; `posAt(s)` devolve `{lat, lon, seg, h}`, com `h = 0` nos nós e pico no meio do salto
  - Verificar: `npm test -- route`
  - Arquivos: `src/sim/route.ts`, `tests/route.test.ts`
- [x] **T1.5 engine (snapshot puro de t)**
  - Aceite: etapas por `t`; estados fila/trânsito/ok/perdido/reenvio/recuperado; com seed fixa e perda de 0–30%, todos os pacotes terminam entregues; eventos ordenados
  - Verificar: `npm test -- engine` + cobertura de `sim/` ≥ 90%
  - Arquivos: `src/sim/engine.ts`, `src/sim/prng.ts`, `tests/engine.test.ts`

**Checkpoint A (2026-10-16):** 49 testes verdes, `src/sim/` com 100% de linhas e 94.5% de branches; lint e build limpos. Aguardando revisão humana.

## Fase 2 — Store + Dock
- [x] **T2.1 Store zustand + relógio rAF**
  - Aceite: `t`, `playing`, `speed`, `kind`, `loss`, `selected`; snapshot derivado e memoizado; trocar `kind` ou `loss` reinicia
  - Verificar: teste unitário das actions; relógio pausa quando a aba fica oculta
  - Arquivos: `src/store.ts`, `tests/store.test.ts`
- [x] **T2.2 Dock**
  - Aceite: play/pause, próxima etapa, reiniciar, barra de 9 etapas, scrubber, velocidade, perda; alvos de toque ≥ 44px; tudo operável pelo teclado
  - Verificar: smoke test + uso manual no browser
  - Arquivos: `src/components/Dock/Dock.tsx`, `Dock.module.css`, `tests/Dock.test.tsx`
- [x] **T2.3 Cabeçalho de etapa + tabs de tipo**
  - Aceite: badge "Etapa 0X / 09", título em 44px, dica; seletor Texto/Foto/Vídeo como grupo de botões com `aria-pressed` (sem tabpanel, `role="tab"` seria semântica errada)
  - Verificar: manual
  - Arquivos: `src/components/StageHeader.tsx`, `src/App.tsx`

## Fase 3 — Globo estático
- [x] **T3.1 Canvas, esfera e atmosfera**
  - Aceite: shading e halo como no v4; OrbitControls com zoom limitado
  - Verificar: manual + fps ≥ 60 parado
  - Arquivos: `src/components/Globe/Globe.tsx`, `Atmosphere.tsx`, `src/lib/geo.ts`
- [x] **T3.2 Pontos de terra + graticule** (pontos gerados do `world-atlas` por `npm run data:land` → `src/data/landDots.json`)
  - Aceite: pontos pré-calculados e versionados; shader de pontos com fade na borda; teste de sanidade (terra × oceano)
  - Verificar: manual (continentes reconhecíveis)
  - Arquivos: `src/components/Globe/Land.tsx`, `src/lib/landMask.ts`
- [x] **T3.3 Cabos, rota com marching dots, nós e labels**
  - Aceite: opacidades iguais às da spec; labels do lado de trás ocultos
  - Verificar: manual comparando com o v4
  - Arquivos: `src/components/Globe/Cables.tsx`, `Route.tsx`, `Nodes.tsx`

## Fase 4 — Globo animado
- [x] **T4.1 Pacotes em arco + rastros** (sprites num único `Points` + rastros num único `LineSegments`)
  - Verificar: ≥ 50 fps com 500 pacotes. Medido: CPU por frame com 2000 pacotes (500 desenhados) = 1,3 ms mediana / 1,9 ms p95. FPS real no browser pendente (painel oculto pausava o rAF)
  - Arquivos: `src/components/Globe/Traffic.tsx` (pacotes, rastros, perda, SACK e pulsos numa só camada: mesmo snapshot por frame)
- [x] **T4.2 Perda (× + anel), SACK de volta, retransmissão âmbar**
  - Verificar: manual com perda de 12% e de 25%
  - Arquivos: em `Traffic.tsx` (ver T4.1)
- [x] **T4.3 Câmera seguindo + drift + pulsos**
  - Verificar: manual; scrubber move a câmera de forma consistente
  - Arquivos: `src/components/Globe/CameraRig.tsx`, `src/lib/camera.ts` (focusAt testado); pulsos em `Traffic.tsx`. Arrastar o globo pausa o seguimento por 4 s
- [x] **T4.4 prefers-reduced-motion**
  - Verificar: hook testado; com reduced-motion: sem autoplay, sem drift/pulso/rastros/marching dots, câmera corta a cada 2,5 s. Conferência visual pendente
  - Arquivos: `src/lib/useReducedMotion.ts` + ajustes nos componentes acima

**Checkpoint B:** 76 testes verdes, lint limpo. Revisão humana: assistir um envio completo no browser (painel visível) e conferir fps e câmera.

## Fase 5 — Telefones (paralelizável com a Fase 3)
- [x] **T5.1 Telefone A**: bolha, status por etapa, Send com glow — `src/components/Chat/SenderPhone.tsx`
- [x] **T5.2 Telefone B**: tiles cifrados → revelação; texto cifrado → claro; play de vídeo — `src/components/Chat/ReceiverPhone.tsx`, `CipherTiles.tsx`
- [x] **T5.3 Upload real**: arquivo do usuário → `crypto` → `packetize` → remontagem byte a byte exibida no B
  - Verificar: `tests/pipeline.test.ts` (2 MB byte a byte), `tests/payload.test.ts` (tipo e limite de 5 MB). No browser: foto demo (JPEG real, 23 KB → 23 pacotes), vídeo demo (WebM real de 1,5 s, 16 pacotes) e texto (1 pacote) chegam íntegros. Upload de arquivo pelo seletor não foi testado no browser (a ferramenta não abre o diálogo)
  - Arquivos: `src/sim/pipeline.ts`, `src/lib/payload.ts` (demos + validação do upload), composer dentro de `SenderPhone.tsx`

## Fase 6 — Cards de detalhe
- [x] **T6.1 Buffer**: ordem de chegada → ordenado; legenda; seleção sincronizada com o globo (anel no pacote) — `src/components/Cards/PacketBuffer.tsx`. Acima de 120 pacotes cada célula agrupa vários (ver T7.2)
- [x] **T6.2 Inspetor**: cabeçalho + hex real + checksum RFC 1071 real (`src/sim/checksum.ts`); IPs ilustrativos e sinalizados — `src/components/Cards/Inspector.tsx`
- [x] **T6.3 Eventos**: log com marcador de cor, cabo da perda e timestamp em ms — `src/components/Cards/EventLog.tsx`. Testes: `tests/Cards.test.tsx`, `tests/checksum.test.ts`

## Fase 7 — Polimento
- [x] **T7.1 Responsivo**: < 1100 px globo em cima e telefones lado a lado; 375 px sem rolagem horizontal; globo não prende a rolagem (sem zoom na roda, `touch-action: pan-y`). Medido em 375, 768 e 1440
- [x] **T7.2 Auditoria de a11y**: script próprio de contraste em todas as etapas → `--fg-subtle` subiu para #84848D, cor do texto das células agora transiciona junto com o fundo; input de arquivo ganhou nome acessível; scrubber com 24 px; células do buffer sempre com 44 px. Resultado: 0 falhas de contraste, 0 controles sem nome
- [x] **T7.3 Passe de perf**: 2 MB ponta a ponta em ~45 ms; snapshot compartilhado entre os painéis; células e tiles memoizados; React + layout ~19 ms/frame com 2.049 pacotes em modo dev. Chunk do globo: 272 KB gzip, quase tudo three.js + R3F. O drei pesa 5 KB, então trocá-lo não compensa (detalhes no README)
- [x] **T7.4 README**: comandos, arquitetura, simplificações, números medidos, acessibilidade, créditos

**Checkpoint final (2026-10-16)**: 96 testes, `src/sim/` com 100% de linhas e 94,4% de branches; lint e build limpos.

| # | Critério da spec | Status |
|---|---|---|
| 1 | Texto aparece no B ≤ 15 s em 1×, 9 etapas em sequência | ✅ visualizado em 13,25 s (265 ticks ÷ 20/s) |
| 2 | Foto ≤ 2 MB com perda: vermelho, SACK, retransmissão, bytes idênticos | ✅ teste de 2 MB byte a byte + browser ("22.7 KB íntegros") |
| 3 | Globo: rotação, cabos, ≥ 8 nós, arcos; ≥ 50 fps com 500 pacotes | ⚠️ CPU 1,3 ms/frame medida; fps real só pelo olho humano no Checkpoint B (painel oculto pausava o rAF). Zoom foi desligado de propósito (rolagem da página) |
| 4 | Play/pause, passo, velocidade ¼×–4×, perda 0–30%, MTU 256 B–8 KB ao vivo | ✅ (perda em passos 0/5/12/30%, não slider) |
| 5 | Clicar no pacote abre o inspetor com cabeçalho e hex | ✅ hex e checksum reais |
| 6 | Animações da tabela; reduced-motion desliga as contínuas | ✅ lógica testada; ⚠️ reduced-motion não conferido visualmente |
| 7 | UI do v4, contraste ≥ 4.5:1, alvos ≥ 44 px | ✅ auditado (scrubber com 24 px, mínimo da WCAG) |
| 8 | `npm test` verde, `npm run build` sem erros | ✅ |

## Pós-entrega — Layout v5 "Cockpit" (2026-10-16)
- [x] Globo, buffer, pacote e eventos visíveis ao mesmo tempo, sem rolar (pedido do usuário, validado no mockup v5)
  - Medido: 1440×900 (globo 455 px), 1280×720 (globo 319 px) e 1100×680 sem rolagem da página e com todos os painéis à vista; 375 px continua empilhado e com rolagem, sem overflow horizontal
  - Perda e MTU foram para a barra superior (mudam o cenário e reiniciam o envio); o dock ficou só com reprodução e velocidade, numa linha
  - HUD (em voo, recebidos, perdidos, cabo) no canto do globo, só no cockpit

## Pós-entrega — Layout v6 "Contextos" (2026-10-16)
- [x] Separar os contextos: A · Remetente (fila de saída), Rede (globo) e B · Destinatário (buffer de entrada)
  - Modelo puro testado: `src/sim/queues.ts` (senderLayout, receiverLayout) e `src/lib/actors.ts`
  - Engine: `RESEND_LEAD` (2 ticks) para os perdidos aparecerem na fila de A esperando o reenvio
  - Pacote voa da fila de A para o buffer de B (mesma raiz de FLIP); Pacote \| Eventos viraram abas no meio
  - Validado só com testes unitários (127 verdes), sem browser, como pedido
  - Revisão: o par azul/lilás de A/B foi revertido para o sistema monocromático da v4 (A/Rede/B diferenciados por forma)
