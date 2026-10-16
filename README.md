# Network Simulator

Mostra, passo a passo, o que acontece quando você envia uma mensagem, foto ou vídeo pela internet: do botão **Send** em São Paulo até a pessoa em Tóquio ver o conteúdo.

- O arquivo é **cifrado de verdade** (AES-256-GCM via WebCrypto), **fatiado em pacotes de 1 KB**, remontado e decifrado. O receptor recebe exatamente os mesmos bytes, conferidos byte a byte.
- Os pacotes cruzam um **globo 3D** por cabos submarinos reais (EllaLink, SEA-ME-WE 6, SJC2…), saltando entre CDNs.
- Alguns pacotes se **perdem**; o receptor **ordena** pelo número de sequência, encontra as lacunas, manda um **SACK** de volta e recebe só os faltantes.
- Você pode enviar a sua própria foto ou vídeo (até 5 MB). Nada sai do navegador.

Spec: [SPEC.md](SPEC.md) · Plano: [tasks/plan.md](tasks/plan.md) · Tarefas: [tasks/todo.md](tasks/todo.md)

## Rodando

Requer Node 20+.

```bash
npm install
npm run dev
```

Abra http://localhost:5173. O WebCrypto exige contexto seguro: `localhost` serve; em outro host, use HTTPS.

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento (Vite) |
| `npm test` | testes (Vitest) |
| `npm run coverage` | testes + cobertura de `src/sim/` (mínimo de 90% de linhas) |
| `npm run lint` | `tsc --noEmit` + ESLint |
| `npm run build` | build de produção em `dist/` |
| `npm run data:land` | regenera `src/data/landDots.json` a partir do world-atlas |

## Como funciona

```
src/sim/        núcleo puro, sem React, 100% testado
  crypto        AES-256-GCM: seal/open
  packetize     bytes ⇄ pacotes, lacunas
  pipeline      transmit(): cifra → fatia → embaralha → remonta → decifra (bytes reais)
  route         grafo de cabos + Dijkstra; posAt(s) com altitude do salto
  engine        plan(config) + snapshot(plan, t): estado de cada pacote em função do tempo
  checksum      checksum de Internet (RFC 1071)
src/store.ts    zustand: tempo, play/pause, velocidade, perda, transfer real
src/components/
  Globe/        R3F: esfera, pontos de terra, cabos, rota, tráfego (pacotes, rastros, perda, SACK), câmera
  Chat/         telefones do remetente e do destinatário, tiles cifrados
  Cards/        buffer do receptor, inspetor de pacote, eventos
  Dock/         controles e linha do tempo
```

**O tempo é a única entrada da animação.** `snapshot(plan, t)` é uma função pura: dado o instante, devolve onde está cada pacote. Por isso o scrubber, o "próxima etapa" e o pause funcionam sem estado escondido, e os testes são determinísticos (perdas e jitter vêm de um PRNG com seed).

**Bytes reais × animação.** `transmit()` roda o caminho de dados inteiro uma vez, no envio. A animação mostra esses mesmos pacotes: o inspetor exibe o hex e o checksum do pacote cifrado real, e o telefone B exibe o que foi de fato decifrado.

### O que é simplificado (de propósito)

- **Rota fixa** São Paulo → Tóquio, escolhida pelo menor caminho no grafo. Sem um backbone transcontinental nos EUA, ela passa pela Europa e por Suez, o que conta melhor a história. Na vida real, Brasil→Japão costuma passar pelos EUA (veja o comentário em `src/data/cables.ts`).
- **MTU didático**: 1 KB por padrão, ajustável ao vivo de 256 B a 8 KB (re-cifra e re-fatia o mesmo arquivo). O real é ~1500 B, com cabeçalhos.
- **Tempo desacelerado**: 1 ms de rede ≈ 37 ms de tela em 1×.
- **Retransmissões nunca se perdem** (uma única rodada de SACK).
- **IPs e portas no inspetor são ilustrativos**; bytes, tamanhos e checksum são reais.
- A **troca de chaves TLS** só aparece como etapa animada; a chave AES é gerada localmente.

## Desempenho (medido)

| O quê | Resultado |
|---|---|
| Cifrar + fatiar + remontar + decifrar 2 MB (2.049 pacotes), no navegador | ~45 ms (mediana) |
| CPU por frame da camada de tráfego, 2.000 pacotes (500 desenhados) | 1,3 ms mediana / 1,9 ms p95 |
| Render React + layout por frame com 2.049 pacotes, **modo dev** | ~16 ms + 3 ms |
| Bundle | shell 82 KB gzip; globo (lazy) 272 KB gzip |

O chunk do globo é quase todo three.js (~2 MB de fonte) e o React Three Fiber (~700 KB). O R3F importa o namespace inteiro do three, então não dá para fazer tree-shaking. O drei pesa só 5 KB. Diminuir esse chunk exigiria trocar o R3F por three.js puro. O chunk carrega sob demanda, depois que a página já apareceu.

Acima de 500 pacotes, o globo desenha um a cada *k*; acima de 120, o buffer agrupa pacotes por célula (assim as células continuam com 44 px).

## Acessibilidade

- Contraste ≥ 4.5:1 em todo texto visível, auditado em todas as etapas (inclusive no meio das transições).
- Alvos de toque ≥ 44 px (o scrubber tem 24 px de altura, o mínimo da WCAG 2.5.8); foco visível; todos os controles têm nome acessível.
- `prefers-reduced-motion`: sem autoplay, sem drift, pulsos, rastros ou marching dots; a câmera troca de posição por cortes a cada 2,5 s, sem panorâmica.
- No celular, o globo não prende a rolagem: deslizar na vertical rola a página, arrastar na horizontal gira o globo.

## Dados e créditos

- Continentes: [world-atlas](https://github.com/topojson/world-atlas) / Natural Earth (domínio público), pré-processados em `src/data/landDots.json`.
- Cabos: aproximações escritas à mão de sistemas reais. **Não** são dados da TeleGeography (licença CC BY-NC-SA).
- Fontes: Geist e Geist Mono (Vercel, SIL OFL).
