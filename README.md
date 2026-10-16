# Network Simulator

Mostra, passo a passo, o que acontece quando você envia uma mensagem, foto ou vídeo pela internet: do botão **Send** na cidade de origem até a pessoa na cidade de destino ver o conteúdo. Origem e destino são escolhidos na barra superior (15 cidades; padrão São Paulo → Tóquio).

- O arquivo é **cifrado de verdade** (AES-256-GCM via WebCrypto), **fatiado em pacotes de 1 KB**, remontado e decifrado. O receptor recebe exatamente os mesmos bytes, conferidos byte a byte.
- Os pacotes cruzam um **globo 3D** pela **malha real de cabos submarinos** (508 sistemas e 1.368 estações de pouso, dados do TeleGeography de 2022). Eles seguem o traçado do cabo de estação em estação, e a aba **Rota** mostra cada trecho, o cabo, a distância e a latência. Clicar num cabo abre a ficha dele.
- Alguns pacotes se **perdem**; o receptor **ordena** pelo número de sequência, encontra as lacunas, manda um **SACK** de volta e recebe só os faltantes.
- Você pode enviar a sua própria foto ou vídeo (até 5 MB). Nada sai do navegador.

Specs: [specs/](specs/) (mapa de capacidades em [capability-map.md](specs/capability-map.md)) · Planos e tarefas: [tasks/](tasks/)

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
| `npm run data:cables` | regenera `src/data/cables.json` a partir do snapshot arquivado do TeleGeography (baixa ~1,7 MB e confere o SHA-256) |

## Como funciona

```
src/sim/        núcleo puro, sem React, 100% testado
  crypto        AES-256-GCM: seal/open
  packetize     bytes ⇄ pacotes, lacunas
  pipeline      transmit(): cifra → fatia → embaralha → remonta → decifra (bytes reais)
  route         grafo de cabos + Dijkstra (heap); posAt(s) sobre o traçado do cabo
  engine        plan(config) + snapshot(plan, t): estado de cada pacote em função do tempo
  checksum      checksum de Internet (RFC 1071)
src/store.ts    zustand: tempo, play/pause, velocidade, perda, transfer real
src/components/
  Globe/        R3F: esfera, pontos de terra, cabos, rota, tráfego (pacotes, rastros, perda, SACK), câmera
  Chat/         telefones do remetente e do destinatário, tiles cifrados
  Cards/        buffer do receptor, inspetor de pacote, eventos
  Dock/         controles, linha do tempo e seletor de rota
  ui/           Select (formato shadcn sobre Radix)
```

**O tempo é a única entrada da animação.** `snapshot(plan, t)` é uma função pura: dado o instante, devolve onde está cada pacote. Por isso o scrubber, o "próxima etapa" e o pause funcionam sem estado escondido, e os testes são determinísticos (perdas e jitter vêm de um PRNG com seed).

**Bytes reais × animação.** `transmit()` roda o caminho de dados inteiro uma vez, no envio. A animação mostra esses mesmos pacotes: o inspetor exibe o hex e o checksum do pacote cifrado real, e o telefone B exibe o que foi de fato decifrado.

### O que é simplificado (de propósito)

- **Rota = menor caminho de fibra** entre as duas cidades escolhidas (15 cidades, 210 rotas, todas conectadas). Os trechos submarinos são os cabos reais. Por terra, cada cidade se liga às estações de pouso a até 1.500 km (backhaul) e há alguns backbones desenhados à mão. Em terra, a distância conta × 1,3, porque a fibra segue estradas e não o círculo máximo. São Paulo → Tóquio dá ≈ 23.900 km e ≈ 119 ms de ida. A latência exibida vem da distância (luz na fibra, 5 µs/km), enquanto a animação dura sempre ~13,5 s a 1×.
- **Malha de 2022**: os cabos que ainda estavam "planejados" em 2022 com entrada em operação até 2026 (2Africa, SJC2, Grace Hopper…) são tratados como ativos, e a ficha avisa "Planejado em 2022". Cabos mais novos que isso não aparecem.
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
- Cabos submarinos e estações de pouso: [TeleGeography Submarine Cable Map](https://www.submarinecablemap.com), da última versão aberta do repositório `telegeography/www.submarinecablemap.com`: commit `54055b5`, arquivos de 2022-08-05, recuperados do Internet Archive. A licença é **[CC BY-NC-SA 3.0 Unported](https://creativecommons.org/licenses/by-nc-sa/3.0/)**. O `src/data/cables.json` é uma obra derivada (traçados simplificados e cortados em trechos entre estações) e é distribuído **sob a mesma licença**: atribuição obrigatória (o crédito fica sempre visível sob o dock), **uso não comercial** e compartilhamento pela mesma licença. Por isso, este projeto não pode ter uso comercial enquanto incluir esses dados. A API atual do site do TeleGeography não tem licença aberta e não é usada.
- Backbones terrestres e backhaul: aproximações nossas (`src/data/cables.ts`).
- Fontes: Geist e Geist Mono (Vercel, SIL OFL).
