# AGENTS.md — Network Simulator

Regras para qualquer agente (ou pessoa) que mexer neste projeto. Em caso de dúvida, este arquivo vence o gosto pessoal; se uma regra precisar mudar, mude-a aqui primeiro e diga por quê.

Fontes de verdade: [specs/](specs/) (o quê e por quê; mapa em [capability-map.md](specs/capability-map.md)), `tasks/<spec>/plan.md` e `tasks/<spec>/todo.md` (andamento), [README.md](README.md) (como rodar).
Mockup aprovado: https://claude.ai/artifact/Ks6KXiYBF7JwR1Uw5fto6J, artboards **"v6 — Contextos"** (layout) e **"v7 — Rotas"** (seletor de origem/destino); já no sistema monocromático descrito abaixo). As artboards v4 e v5 ficam só como histórico.

---

## 1. O que é

Simulador educativo, em React, do caminho de uma mensagem, foto ou vídeo de **Ana (A)** até **Kenji (B)**, em duas cidades à escolha (padrão: São Paulo → Tóquio): cifrar → fatiar em pacotes → cruzar cabos submarinos num globo 3D → perder alguns → ordenar → pedir os faltantes (SACK) → retransmitir → decifrar → exibir.

Os bytes são reais (AES-256-GCM via WebCrypto, pacotes reais, remontagem conferida byte a byte). A animação é uma função pura do tempo.

## 2. Comandos

```bash
npm run dev        # http://localhost:5173
npm test           # Vitest (rápido, sem browser)
npm run coverage   # src/sim/ precisa de ≥ 90% de linhas
npm run lint       # tsc --noEmit + ESLint (inclui as regras do React Compiler)
npm run build
npm run data:land  # regenera src/data/landDots.json a partir do world-atlas
npm run data:cables # regenera src/data/cables.json (TeleGeography 2022, CC BY-NC-SA 3.0; SHA-256 fixo)
```

Antes de dizer "pronto": `npm test` e `npm run lint` verdes. `npm run build` quando mexer em dependências, CSS global ou imports.

## 3. Arquitetura (não quebre estas fronteiras)

```
src/sim/      núcleo PURO, sem React/three/DOM. Tudo testado.
  engine      plan(config) + snapshot(plan, t): estado de tudo é função do tempo t
  queues      senderLayout (fila de A) / receiverLayout (buffer de B)
  pipeline    transmit(): cifra → fatia → remonta → decifra, com os bytes reais
  route, geo, packetize, crypto, checksum, prng
src/data/     cidades (nodes), backbones + backhaul (cables), cables.json gerado (cableData), grafo roteável (network)
scripts/      geradores de dados; scripts/lib/ é puro e testado (o Node 26 roda .ts direto)
src/lib/      cola entre sim e UI (hooks, actors, fragments, useFlip, payload, describe, globe)
src/store.ts  zustand: t, playing, speed, kind, loss, mtu, origin, destination, route, msPerTick, selected, panel, selectedCable, transfer
src/components/
  Globe/      R3F. Lê o store com getState() dentro de useFrame, nunca re-renderiza por tick
  Chat/       telefones A e B
  Cards/      Queues (fila A, buffer B), Details (linha de detalhes + FLIP), Inspector, EventLog, RouteLegs, CableCard
  Dock/       reprodução (Dock) e cenário na barra superior (NetworkControls, RoutePicker)
  ui/         primitivos no formato do shadcn sobre Radix (Select), estilizados com os tokens
```

- **O tempo é a única entrada da animação.** Nada de estado escondido avançando por conta própria: scrubber, "próxima etapa" e pause dependem disso.
- **Um snapshot por (plan, t)**, compartilhado via `snapshotOf` / `useSnapshot`. Não chame `snapshot()` direto em componentes.
- **Determinismo:** perdas e jitter vêm de PRNG com seed. Testes não podem depender de `Math.random`.
- Componentes que mudam a cada tick e têm muitos filhos (células, tiles) são `memo` por item.

## 4. Layout (v6 "Contextos", aprovado)

Três contextos, sempre na mesma posição, em duas linhas alinhadas:

| Coluna | Linha do palco | Linha de detalhes |
|---|---|---|
| **A · Remetente** | Telefone A | **Fila de saída** (imagem → cortes → pacotes que vão saindo) |
| **Rede** | Globo + título da etapa + HUD + dock de reprodução | **Eventos \| Pacote** (abas) |
| **B · Destinatário** | Telefone B | **Buffer de entrada** (chegadas fora de ordem → ordenação → lacunas → cor volta) |

Barra superior: marca · tipo de conteúdo + perda + MTU (as configurações de cenário, que reiniciam o envio) · rota (origem → destino, ⇄ inverte; também reinicia o envio).

| Etapa | Contexto |
|---|---|
| 1 Send, 2 Criptografia, 3 Fatiamento | A |
| 4 Trânsito | Rede |
| 5 Ordenação, 8 Descriptografia, 9 Renderização | B |
| 6 Pedido de faltantes (B→A), 7 Retransmissão (A→B) | Rede |

Regras:
- **Cockpit** (viewport ≥ 1100×640): tudo cabe em 100vh, **a página não rola**; cada painel rola por dentro. A mesma media query `(min-width: 1100px) and (min-height: 640px)` aparece em cada CSS module que muda no cockpit; mantenha as duas sincronizadas.
- **Empilhado** (telas menores): a página rola, o globo vem primeiro, sem rolagem horizontal.
- O **canvas do globo ocupa todo o espaço** da coluna Rede (de borda a borda no cockpit); a esfera continua redonda e dimensionada pela **altura** (fov vertical). Não volte a forçar o contêiner a ser quadrado: com zoom, a esfera era cortada no quadrado (2026-10-16). Mantenha `min-width: 0; overflow: hidden` no contêiner, senão o canvas trava a largura. Os botões +/− ficam na lateral direita, **embaixo** (acima do dock): o HUD ocupa a metade de cima desse lado.
- O globo nunca pode prender a rolagem da página: `touch-action: pan-y` sempre, e **zoom pela roda só no cockpit** (lá a página não rola). Em qualquer layout há botões **+/−** no globo (decisão de 2026-10-16).
- **Um pacote nunca está em A e em B ao mesmo tempo.** Ele sai da fila de A (deixa um lugar vazio) e voa para o buffer de B. Os dois cartões compartilham a mesma raiz de FLIP para isso.
- Fila de A e buffer de B **não reembaralham**. A fila tem lugares fixos por seq. O buffer só **acrescenta** chegadas no fim até a ordenação. Reordenar em cascata causa flicker (já aconteceu).

## 5. Design system (minimal tech, monocromático)

Inspiração: Vercel / shadcn / Tesla. O globo é o protagonista; o resto fica quieto.

### Tokens (`src/styles/tokens.css`, use sempre as variáveis)

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#000000` | página (grid de pontos `#FFFFFF12` a cada 28px) |
| `--surface` | `#0A0A0B` | cards, telefones, dock |
| `--surface-2` | `#111113` | trilho de segmented/tabs |
| `--border` / `--border-soft` | `#27272A` / `#1F1F23` | bordas 1px |
| `--fg` | `#FAFAFA` | texto principal |
| `--fg-muted` | `#A1A1AA` | texto secundário |
| `--fg-subtle` | `#84848D` | labels mono (≥ 4.5:1 também sobre `--surface-2`) |
| `--land` | `#71717A` | pontos dos continentes |
| `--lost` | `#EF4444` | **somente** pacote perdido |
| `--resend` | `#F5A524` | **somente** SACK e retransmissão |
| `--done` | `#22C55E` | **somente** "visualizado" / íntegro |
| `--transit` | `#FF4FA3` | **somente** pacote em trânsito (e seu rastro) e a rota que ele segue no globo (aprovado em 2026-10-16) |
| raios | 12 / 8 / 32 px | card / controle / telefone |

**A paleta é fechada:** branco, preto, cinzas e as 4 cores de sinal. Cada cor de sinal tem um significado e só aparece nele.

### Tipografia
- **Geist** (corpo 13–15px, títulos peso 500 com letter-spacing negativo, etapa atual 30–44px) e **Geist Mono** (10–12px, labels uppercase com tracking, números, hex, timestamps). Self-hosted via pacote `geist`, sem Google Fonts em runtime.

### Contextos A · Rede · B: por FORMA, nunca por cor
- **A** = chip sólido (fundo branco, texto preto).
- **B** = chip contornado (borda branca, fundo transparente).
- **Rede** = chip tracejado com `⇄` (texto `--fg-muted`).
- O lado que está agindo ganha borda branca a ~25% (`#fafafa40`). Sem glow colorido.

### Componentes
- Cards: borda 1px `--border`, raio 12, fundo `--surface`, sem sombra (o dock é a única peça com sombra).
- Segmented/tabs estilo shadcn: trilho `--surface-2`, item ativo `#27272A` com borda `#3F3F46`, `aria-pressed`.
- Botão primário: branco sólido, texto preto. Os demais são ghost.

## 6. Evitar "vibecoding" (cara de UI gerada por IA)

Já erramos duas vezes (v2 neon; v6 com azul/lilás). **Não faça:**
- ❌ Cores de destaque novas, sobretudo o par **azul-claro + violeta/lilás**, ciano neon, roxo, gradientes "aurora".
- ❌ Gradientes decorativos em fundos, cards ou textos (o sombreamento da esfera do globo é a única exceção funcional).
- ❌ Glow colorido, `box-shadow` neon, bordas coloridas em cards "ativos".
- ❌ Cards com borda lateral colorida, cards dentro de cards, KPIs em cards coloridos.
- ❌ Emojis na interface; ícones fora do estilo traço fino (1.3–1.8px).
- ❌ Inter/Roboto/Arial; títulos gigantes em gradiente; tudo com o mesmo peso visual.
- ❌ Arco-íris para diferenciar categorias. Diferencie por **forma, posição, peso, borda ou padrão**.

**Faça:**
- ✅ Monocromático + sinal. Uma cor só aparece se significa algo, e sempre a mesma coisa.
- ✅ Hierarquia pelo tamanho, peso e posição; o movimento fica no globo e nas filas.
- ✅ Antes de introduzir qualquer cor, sombra ou ornamento novo: pare e pergunte.

## 7. Animação

- Tudo deriva de `t`. Velocidade 1× ≈ 13,5 s por envio.
- Globo: pacotes **sobre o traçado real do cabo** (sem arco; `posAt().h` é sempre 0), malha mundial de cabos numa draw call só (nada de um `<Line>` por cabo), cabos da rota realçados, **rastros**, × vermelho com anel na perda, SACK âmbar voltando, retransmissão âmbar, pulsos brancos em A (envio) e B (entrega), câmera seguindo a mediana dos pacotes, drift lento.
- Filas: FLIP via `useFlip`, com posições de **layout** (`offsetLeft/Top`), nunca `getBoundingClientRect`, que inclui o transform da animação e causa saltos.
- Imagem nas filas: com baixa opacidade; cinza enquanto cifrada (em A sempre, em B até decifrar); racha em pedaços durante a criptografia.
- `prefers-reduced-motion`: sem autoplay, sem drift, pulsos, rastros ou marching dots; a câmera corta (não faz pan); o FLIP não anima.

## 8. Acessibilidade (não negociável)

- Contraste ≥ 4.5:1 em todo texto visível, **inclusive no meio das transições** (anime cor de texto junto com o fundo).
- Alvos ≥ 44px (o mínimo absoluto é 24px, como o scrubber).
- Todo controle tem nome acessível; o input de arquivo leva o `aria-label` nele mesmo, não no `<label>`.
- Foco visível (`outline: 2px solid var(--fg)`). Segmented usa `aria-pressed`, não `role="tab"` sem tabpanel.

## 9. Fluxo de trabalho com o usuário

- **Spec-driven:** mudança grande começa em `specs/<nome>.md` e `tasks/<nome>/plan.md`; decisões que mudam ficam registradas na spec e em `tasks/<nome>/todo.md`.
- **Mudança de UI: mockup primeiro.** Atualize o artifact (nova artboard ao lado da anterior), espere aprovação e só então implemente.
- **Testes unitários sempre** (TDD no `src/sim/` e em lógica nova). Componentes com jsdom + Testing Library; CSS modules não são processados no Vitest, então exponha estado testável via `data-*` (ex.: `data-ciphered`, `data-active`, `data-flip`).
- **Validação no browser só quando pedida.** O usuário prefere economizar tokens; quando não houver validação visual, diga isso explicitamente no fim.
- Interface e textos em **pt-BR**. Código, nomes e comentários em inglês, comentando o *porquê*.
- Dependências novas: **perguntar antes.** Nada de requisição de rede com conteúdo do usuário; arquivos do usuário nunca saem do navegador.
- **Licença dos cabos (CC BY-NC-SA 3.0):** o crédito `DataCredit` fica sempre visível; o projeto é **não comercial** enquanto incluir `cables.json`; nada de buscar a API atual do TeleGeography (não tem licença aberta). Trocar a fonte de dados: perguntar antes.
- Simplificações conscientes levam um comentário `ponytail:` dizendo o limite e como evoluir.
