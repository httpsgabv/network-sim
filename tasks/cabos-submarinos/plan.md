# Plano — Feature: cabos submarinos reais

Fonte: [specs/cabos-submarinos.md](../../specs/cabos-submarinos.md) (aprovada em 2026-10-16) · Mockup: artboard **"v8 — Cabos"** em https://claude.ai/artifact/Ks6KXiYBF7JwR1Uw5fto6J (aprovado em 2026-10-16)

## Abordagem

Hoje o grafo tem 21 nós e 21 cabos escritos à mão, e o pacote faz um arco acima da superfície. O plano troca a **fonte de dados** (gerada em build a partir do TeleGeography), depois o **grafo/rota** (mesmo contrato `Route`) e só então a **UI**. Cada fatia termina com tudo verde.

```
TeleGeography ─(npm run data:cables)─► scripts/lib/cables.ts ─► src/data/cables.json (commitado, CC BY-NC-SA)
                                                                     │
data/nodes.ts (15 cidades) + data/cables.ts (backbones + regra de backhaul) ─► sim/route (heap, h = 0)
                                                                     │
                     store (selectedCable, aba 'route') ─► Globe (malha, rota, estações, rótulos, picking)
                                                         └► Cards/RouteLegs + Cards/CableCard, atribuição
```

**Decisões de implementação**
- **Toda a geometria pesada fica em build.** O script baixa `cable-geo.json`, `landing-point-geo.json` e as fichas por cabo; filtra só os ativos; simplifica; encaixa cada estação de pouso no traçado do próprio cabo; e emite **trechos estação → estação**. O runtime só lê o JSON, sem processar GeoJSON.
- **Cabos com ramos**: cada cabo vira um grafo de vértices (as pontas das `LineString` dentro de ε ≈ 1 km são fundidas). Os trechos são os caminhos mínimos entre estações **vizinhas**: um caminho que passa por outra estação do mesmo cabo não conta. Assim um Y com 3 estações dá 3 trechos, e não 3 mais atalhos.
- **Estação longe do traçado** (> 50 km do vértice mais próximo): fica fora do roteamento daquele cabo e o script registra um aviso. Não inventamos traçado.
- **Formato do `cables.json`** (compacto, coordenadas com 2 casas ≈ 1 km):
  `{ landings: { [id]: { name, country, at } }, cables: [{ id, name, rfs, lengthKm, owners, landings: id[], legs: [{ a, b, points: [lat, lon][] }] }] }`
- **Grafo de runtime** = cidades (`nodes.ts`) + estações (`cables.json`) + trechos submarinos + backbones terrestres (`cables.ts`) + backhaul (cidade ↔ estação ≤ 1.500 km, comprimento × 1,3). Trechos terrestres também levam × 1,3. O Dijkstra ganha heap binária (~1.000+ nós) e a rota continua memoizada por par.
- **`posAt` sem arco**: `h = 0` e a altitude do desenho sai de uma constante de raio (1,002), como os cabos hoje. O `Traffic` desenha os pacotes sobre o cabo.
- **Malha numa draw call**: `THREE.LineSegments` com um `BufferGeometry` mesclado, mais um `Uint32Array` de segmento → índice do cabo, para o picking (`raycaster.params.Line.threshold` folgado). A rota (poucos trechos) continua com `<Line>` do drei.
- **Ficha dentro da aba Rota**: `selectedCable` no store; a aba mostra a lista ou a ficha. Os rótulos de cabo no globo são `<button>`s (nome acessível, foco), então não dependemos só do raycast para teclado.

## Fatias

| # | Fatia | Depende de |
|---|---|---|
| T9.1 | Funções puras do script (simplificar, encaixar, cortar em trechos, filtrar ativos) | — |
| T9.2 | `npm run data:cables` gera `cables.json` | T9.1 |
| T9.3 | Grafo real + heap + `posAt` sem arco + faixas de latência | T9.2 |
| T9.4 | Globo: malha mesclada, cabos da rota, estações, rótulos, pacote no cabo | T9.3 |
| T9.5 | Aba **Rota** (lista de trechos) + `selectedCable` | T9.3 (paralela à T9.4) |
| T9.6 | Ficha do cabo + clique no globo e nos rótulos | T9.4, T9.5 |
| T9.7 | Atribuição, README, AGENTS §7, spec base, capability map | T9.6 |

**Checkpoints**
- Depois da T9.3: `npm test`, `npm run lint` e `npm run coverage` verdes, e as rotas novas impressas para você conferir (SP → Tóquio, Londres → Frankfurt, SP → Miami, SP → Sydney).
- Depois da T9.6: `npm run build` verde; validação no browser só se você pedir (fps com a malha completa).

## Riscos

| Risco | Mitigação |
|---|---|
| Formato/URL do repositório do TeleGeography mudar | O script falha alto, com mensagem; o `cables.json` commitado continua valendo |
| Estações mal encaixadas geram trechos absurdos | Teste: nenhum trecho com comprimento > 1,5 × a soma geodésica dos seus vértices; aviso no script |
| Grafo desconexo para algum par de cidades | Teste dos 210 pares; se falhar, ajuste do backbone (perguntar antes) |
| fps com ~500 cabos | Uma draw call, sem `<Line>` por cabo; rótulos só da rota |
| Bundle cresce com o JSON | Orçamento ≤ 1,5 MB (teste de tamanho); import dinâmico se passar disso |
