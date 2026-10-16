# Capability map — Network Simulator

Mapa das capacidades do produto: o que o simulador faz, qual spec define cada uma, onde mora no código e em que estado está. Atualize esta tabela quando uma spec nascer ou uma capacidade mudar de estado.

Legenda: ✅ entregue · 🚧 em andamento · ⬜ fora de escopo (decisão registrada na spec)

Specs: **[B]** [simulador-base](simulador-base.md) · **[R]** [origem-destino](origem-destino.md)

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
| Grafo de 15 cidades + 6 estações de cabo, cabos escritos à mão | B, R | `data/nodes`, `data/cables` | ✅ |
| Rota mais curta entre quaisquer duas cidades (210 pares) | B, R | `sim/route` | ✅ |
| Backbone terrestre dos EUA (`nyc → lax`) | R | `data/cables` | ✅ |
| **Escolher origem e destino** (selects na barra, ⇄ inverte, reinicia o envio) | R | `store` (`setRoute`), `components/Dock/RoutePicker`, `components/ui/Select` | ✅ |
| Distância, saltos e latência derivados da rota (5 µs/km) | R | `sim/route` (`routeKm`, `msPerTick`), `Hud`, `Dock`, `EventLog` | ✅ |
| Cidades novas ou mais cabos | R | — | ⬜ perguntar antes |

## 3. Visualização

| Capacidade | Spec | Código | Estado |
|---|---|---|---|
| Globo 3D: continentes em pontos, cabos, rota com marching dots, nós rotulados | B | `components/Globe/*` | ✅ |
| Pacotes em arco com rastro, × na perda, SACK e retransmissão âmbar | B | `Globe/Traffic` | ✅ |
| Câmera seguindo o pacote líder; abre sobre a origem escolhida | B, R | `Globe/CameraRig`, `lib/camera` | ✅ |
| Telefones A (Ana) e B (Kenji) com cidade, status e revelação progressiva | B, R | `components/Chat/*` | ✅ |
| Fila de saída (A) e buffer de entrada (B) com FLIP | B | `components/Cards/Queues`, `lib/useFlip` | ✅ |
| Inspetor de pacote (hex, checksum, TTL) e log de eventos | B | `components/Cards/*` | ✅ |
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
| `src/sim/` ≥ 90 % de cobertura | B | `npm run coverage` (hoje 98,9 % de linhas) |

## Mapa de dependências entre capacidades

```
dados (nós, cabos) → rota → latência → store (origin/destination/route) → texto, telefones, globo, barra
                            └→ engine (plan) ← seed ← perda/MTU/tipo        (o plan não depende da rota)
```
