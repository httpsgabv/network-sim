# Plano — Feature: escolha de origem e destino

Fonte: [specs/origem-destino.md](../../specs/origem-destino.md) (aprovada em 2026-10-16) · Mockup: artboard **"v7 — Rotas"** em https://claude.ai/artifact/Ks6KXiYBF7JwR1Uw5fto6J (aprovado em 2026-10-16)

## Abordagem

Hoje a rota é uma constante de módulo (`ROUTE` em `store.ts`), lida em 15 lugares, e a latência é fixa (`MS_PER_TICK = 1.35`). O plano transforma a rota em **estado do store derivado do par (origem, destino)**, migra os consumidores em fatias que mantêm tudo verde e só no fim coloca o seletor na barra.

```
data (cabo nyc→lax) ─► sim/route (routeKm, msPerTick) ─► store (origin, destination, route, msPerTick, setRoute)
                                                              ├─ texto: describe, Cards, Hud, Dock, telefones, demo
                                                              ├─ globo: Route, Nodes, Traffic, CameraRig, Globe
                                                              └─ barra: RoutePicker (ui/Select do shadcn, via Radix)
```

**Decisões de implementação**
- **A rota é dado, não tempo.** `setRoute` troca `route` e `msPerTick` e zera `t` (como `setKind`/`setLoss`). O `plan` do engine **não muda**, porque a seed não depende da rota; é isso que garante o critério 6 (mesmos `seq` perdidos em qualquer par).
- **Memo por par**: `routeFor(o, d)` guarda as rotas num `Map` (no máximo 210), para trocar de rota sem rodar o Dijkstra a cada render.
- **`describe.ts` passa a receber a rota** (`whereOnRoute(route, pos)`, `endpointNames(route)`) em vez de ler um global. Os componentes de texto leem `useSim((s) => s.route)`: re-renderizam só quando a rota muda, nunca por tick.
- **Globo**: `Traffic` e `CameraRig` leem `getState().route` dentro do `useFrame` (regra do AGENTS.md). `Route` e `Nodes` assinam `s.route` e refazem a geometria só quando o par muda. Origem e destino em `Traffic` deixam de ser constantes de módulo.
- **Transição sem quebrar**: `ROUTE` e `MS_PER_TICK` continuam exportados (marcados `@deprecated`) até o último consumidor migrar e saem na T8.5.
- **Select**: `src/components/ui/Select.tsx` espelha a API do `select.tsx` do shadcn (`Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`) sobre `@radix-ui/react-select`, com o visual num CSS Module. O `RoutePicker` usa dois deles e o botão ⇄.

## Fatias

| # | Fatia | Depende de | Checkpoint |
|---|---|---|---|
| T8.1 | Dados + matemática da rota (`sim/`) | — | testes de rota verdes com o backbone novo |
| T8.2 | Store: origem, destino, rota e latência derivadas | T8.1 | `setRoute` testado; app igual ao de hoje |
| T8.3 | Texto da rede: describe, Cards, Hud (com a linha ROTA) | T8.2 | log, inspetor e HUD seguem `route` |
| T8.4 | Telefones, Dock e texto de demonstração | T8.2 | cidades e ms seguem `route` |
| T8.5 | Globo + remoção de `ROUTE`/`MS_PER_TICK` | T8.3, T8.4 | `useSim.getState().setRoute('lon', 'fra')` no console redesenha tudo |
| T8.6 | `ui/Select` (shadcn sobre Radix) | — | componente testado isolado |
| T8.7 | `RoutePicker` na barra superior | T8.2, T8.6 | critérios 1, 2, 5 e 7 da feature |
| T8.8 | Docs e checkpoint final | todas | tabela de critérios preenchida |

**Paralelismo**: a T8.6 não toca nenhum arquivo das outras e pode começar já. T8.3 e T8.4 não compartilham arquivos e podem rodar juntas depois da T8.2. A T8.5 espera as duas, porque remove os exports antigos.

## Riscos

| Risco | Mitigação |
|---|---|
| Radix Select no jsdom (faltam `hasPointerCapture`, `scrollIntoView`, `ResizeObserver`) | Stubs mínimos no topo do teste, com comentário; abrir por teclado (Enter/ArrowDown), que é o caminho mais estável |
| Lista do Select cortada pelo cockpit (`overflow: hidden`) | `SelectContent` usa o Portal do Radix (renderiza no `body`) |
| Barra superior não cabe em 1100 px (marca + cenário + 2 selects ≈ 1240 px) | Abaixo de 1280 px a marca vira só o ícone; medir em 1100×680 na T8.7 |
| Trocar a rota no meio do envio deixa geometria ou rastros velhos no globo | `setRoute` zera `t`; `Route`/`Nodes` dependem de `route`; `Traffic` lê a rota a cada frame |
| Câmera atravessa o globo ao trocar de rota | Com reduced motion ela corta (regra atual); sem reduced motion, o pan existente leva até a nova origem |
| O teste de rota atual fixa SP → Tóquio via Suez | Atualizado na T8.1 para a rota pelos EUA (Decisão 1 da spec) |

## Dependência nova
`@radix-ui/react-select` (Decisão 3 da spec). Nada além disso.
