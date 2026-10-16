# Plano de Implementação — Network Simulator

Fonte: [SPEC.md](../SPEC.md) (aprovado em 2026-10-16) · Mockup: https://claude.ai/artifact/Ks6KXiYBF7JwR1Uw5fto6J (v4)

## Abordagem

O mockup v4 já prova a lógica da timeline: estados dos pacotes, perda, SACK, retransmissão, câmera e rastros. O plano **promove essa lógica a um núcleo `src/sim/` puro e testado** e depois coloca a UI por cima em fatias verticais. Cada fase termina com algo rodando no browser.

```
sim/ (puro, testado)  ──►  store.ts (zustand + relógio)  ──►  UI
  packetize                 t, playing, speed, kind,          ├─ Globe (R3F)
  crypto (WebCrypto)        loss, selected                    ├─ Phones
  route (grafo + posAt)     snapshot = engine(t)              ├─ Dock
  engine (t → snapshot)                                       └─ Cards (buffer, inspetor, eventos)
```

**Decisão central — o engine é uma função pura do tempo:** `snapshot(t, config) → { stage, packets[], events[] }`. Não guarda estado mutável por tick. Assim o scrubber, o "próxima etapa" e a pausa saem de graça, os testes são determinísticos (seed) e a UI só lê. O mockup já funciona assim.

**Bytes reais × visual:** o arquivo do usuário é cifrado e fatiado de verdade (`crypto` + `packetize`) e a remontagem final é conferida byte a byte. Já a *posição* de cada pacote na animação vem do engine (tempo de partida, jitter, ponto de perda), que é determinístico por seed. Os dois se ligam pelo `seq`.

## Fases

### Fase 0 — Esqueleto
Vite + React + TS strict, Vitest, ESLint, `geist`, `tokens.css`, página preta com o grid de pontos.
**Checkpoint:** `npm run dev` abre a página; `npm test` roda (0 testes); `npm run build` passa.

### Fase 1 — Núcleo `sim/` (sem UI, TDD)
`packetize`/`reassemble`, `crypto` (AES-GCM ida e volta), `route` (grafo de nós e cabos, `posAt(s)` com altitude do salto), `engine` (estados por `t`, lacunas, SACK, retransmissão, eventos).
**Checkpoint:** testes verdes cobrindo os critérios 2 e 8 da spec; cobertura de `sim/` ≥ 90%.

### Fase 2 — Store + Dock (primeira fatia jogável)
Store zustand com relógio em `requestAnimationFrame`. Dock com play/pause/etapa/reiniciar, barra de 9 etapas, scrubber, velocidade, perda e tabs de tipo.
**Checkpoint:** os controles movem `t`; o título da etapa e a barra reagem. O globo ainda é placeholder.

### Fase 3 — Globo estático (R3F)
Esfera com shading e atmosfera, pontos de terra pré-calculados do world-atlas (shader de pontos), graticule, cabos, rota com marching dots, nós e labels.
**Checkpoint:** o globo bate visualmente com o v4 e roda a ≥ 60 fps parado.

### Fase 4 — Globo animado
Pacotes instanced com arco de salto e rastro, × de perda com anel, SACK de volta, retransmissão âmbar, pulsos de origem/destino, câmera seguindo + drift, `prefers-reduced-motion`.
**Checkpoint:** um envio completo de foto com perda de 12% é narrável só olhando o globo; ≥ 50 fps com 500 pacotes (critério 3).

### Fase 5 — Telefones
Telefone A (bolha, status, Send com glow) e telefone B (tiles cifrados → revelação; texto cifrado → texto claro; vídeo com play). Upload de imagem do usuário entra no fluxo real `crypto` + `packetize`.
**Checkpoint:** critérios 1 e 2 de ponta a ponta com uma foto real do usuário.

### Fase 6 — Cards de detalhe
Buffer (ordem de chegada → ordenado por seq), inspetor (cabeçalho + hex real do pacote), eventos.
**Checkpoint:** critério 5; clicar no buffer destaca o pacote no globo.

### Fase 7 — Polimento e verificação
Responsividade (telefones empilham abaixo do globo em < 1100px), auditoria de a11y (contraste, foco, aria), perf, README.
**Checkpoint:** todos os critérios de sucesso da spec verificados.

## Paralelismo
- Depois da Fase 1, as Fases **3** (globo estático) e **5** (telefones) não compartilham arquivos e podem rodar em paralelo.
- A Fase 2 é pré-requisito de tudo que é interativo. A Fase 4 depende de 1, 2 e 3.

## Riscos
| Risco | Mitigação |
|---|---|
| R3F + rastros de centenas de pacotes pesam na GPU | Instancing para pontos; rastros num único `LineSegments` com buffer reescrito por frame; medir já na Fase 4 |
| Pacote world-atlas some ou muda | Os pontos ficam versionados em `src/data/landDots.json`; o script só roda para regenerar |
| Labels HTML (drei `<Html>`) caros com 15 nós | Ocultar os do lado de trás; atualizar a cada 2 frames se precisar |
| WebCrypto exige contexto seguro | `localhost` conta como seguro; anotar no README |
| Foto grande (2 MB / 1 KB = 2000 pacotes) poluindo o globo | O engine continua com todos os pacotes; o globo desenha no máximo ~500 com amostragem; o buffer agrupa visualmente |

## Dependências novas (já previstas no Tech Stack da spec)
`three`, `@react-three/fiber`, `@react-three/drei`, `zustand`, `geist`, `vitest`, `@testing-library/react`, `jsdom`, `eslint`. Fora isso: perguntar antes.
