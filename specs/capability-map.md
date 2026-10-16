# Capability map — Network Simulator

Mapa das capacidades do produto: o que o simulador faz, qual spec define cada uma, onde mora no código e em que estado está. Atualize esta tabela quando uma spec nascer ou uma capacidade mudar de estado.

Legenda: ✅ entregue · 🚧 em andamento · ⬜ fora de escopo (decisão registrada na spec)

Specs: **[B]** [simulador-base](simulador-base.md) · **[R]** [origem-destino](origem-destino.md) · **[C]** [cabos-submarinos](cabos-submarinos.md)

## 1. Conteúdo e protocolo (núcleo `src/sim/`, puro)

| Capacidade | Spec | Código | Estado |
|---|---|---|---|
| Enviar texto, foto ou vídeo (≤ 5 MB) como bytes reais | B | `lib/payload`, `sim/pipeline` | ✅ |
| Cifrar com AES-256-GCM (WebCrypto) e decifrar na chegada | B | `sim/crypto` | ✅ |
| Fatiar em pacotes com `seq`/checksum e remontar byte a byte | B | `sim/packetize`, `sim/checksum` | ✅ |
| Perda determinística (PRNG com seed), 0–30 % | B | `sim/prng`, `sim/engine` | ✅ |
| Ordenar, detectar lacunas, pedir faltantes (SACK) e retransmitir | B | `sim/engine`, `sim/queues` | ✅ |
| Animação como função pura do tempo (`snapshot(plan, t)`) | B | `sim/engine` | ✅ |
| Handshake TCP/TLS, DNS | B | — | ⬜ v2 |

## 2. Rede e geografia

| Capacidade | Spec | Código | Estado |
|---|---|---|---|
| ~~Grafo de 15 cidades + 6 estações de cabo, cabos escritos à mão~~ substituído pela malha real (C) | B, R | `data/nodes`, `data/cables` | ✅ |
| Rota mais curta (em km de fibra, terra × 1,3) entre quaisquer duas cidades (210 pares), Dijkstra com heap | B, R, C | `sim/route`, `data/network` | ✅ |
| Backbone terrestre dos EUA (`nyc → lax`) | R | `data/cables` | ✅ |
| **Escolher origem e destino** (selects na barra, ⇄ inverte, reinicia o envio) | R | `store` (`setRoute`), `components/Dock/RoutePicker`, `components/ui/Select` | ✅ |
| Distância, saltos e latência derivados da rota (5 µs/km) | R | `sim/route` (`routeKm`, `msPerTick`), `Hud`, `Dock`, `EventLog` | ✅ |
| Cidades novas | R | — | ⬜ perguntar antes |
| **Cabos e estações de pouso reais** (TeleGeography 2022, CC BY-NC-SA 3.0: 508 cabos, 1.368 estações) + backhaul ≤ 1.500 km | C | `data/cables.json`, `data/network`, `scripts/build-cables` | ✅ |
| Pacote segue o traçado do cabo (sem arco) | C | `sim/route` (`posAt`) | ✅ |

## 3. Visualização

| Capacidade | Spec | Código | Estado |
|---|---|---|---|
| Globo 3D: continentes em pontos, cabos, rota com marching dots, nós rotulados | B | `components/Globe/*` | ✅ |
| Pacotes sobre o cabo com rastro, × na perda, SACK e retransmissão âmbar | B, C | `Globe/Traffic` | ✅ |
| Câmera seguindo o pacote líder; abre sobre a origem escolhida | B, R | `Globe/CameraRig`, `lib/camera` | ✅ |
| Telefones A (Ana) e B (Kenji) com cidade, status e revelação progressiva | B, R | `components/Chat/*` | ✅ |
| Fila de saída (A) e buffer de entrada (B) com FLIP | B | `components/Cards/Queues`, `lib/useFlip` | ✅ |
| Inspetor de pacote (hex, checksum, TTL) e log de eventos | B | `components/Cards/*` | ✅ |
| Malha mundial de cabos (1 draw call), cabos da rota rotulados, estações de pouso, aba Rota (trechos), ficha do cabo (clique no globo ou na lista) e crédito da licença | C | `Globe/{Cables,Route,Landings}`, `Cards/RouteLegs`, `Cards/CableCard`, `DataCredit` | ✅ |
| Layout cockpit (sem rolagem ≥ 1100×640) e empilhado | B | `App.module.css` | ✅ |

## 4. Controle

| Capacidade | Spec | Código | Estado |
|---|---|---|---|
| Play/pause, próxima etapa, reiniciar, scrubber, velocidade 0,25×–4× | B | `components/Dock/Dock`, `store` | ✅ |
| Cenário: tipo de conteúdo, perda, MTU (reiniciam o envio) | B | `Dock/NetworkControls`, `Segmented` | ✅ |
| Upload de arquivo próprio (nunca sai do navegador) | B | `Chat/SenderPhone`, `lib/payload` | ✅ |

## 5. Qualidade transversal

| Capacidade | Spec | Como se garante |
|---|---|---|
| Acessibilidade (contraste ≥ 4.5:1, nomes, foco, teclado, `reduced-motion`) | B, R | AGENTS.md §8, testes com Testing Library |
| Design monocromático + 3 cores de sinal | B, R | AGENTS.md §5–6 |
| `src/sim/` ≥ 90 % de cobertura | B | `npm run coverage` (hoje 99 % de linhas) |

## Mapa de dependências entre capacidades

```
dados (nós, cabos) → rota → latência → store (origin/destination/route) → texto, telefones, globo, barra
                            └→ engine (plan) ← seed ← perda/MTU/tipo        (o plan não depende da rota)
```
