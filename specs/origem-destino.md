# Feature: escolha de origem e destino

> Status: **IMPLEMENTADO (spec aprovada em 2026-10-16)**. Mockup aprovado: artboard "v7 — Rotas". Plano: [tasks/origem-destino/plan.md](../tasks/origem-destino/plan.md) · Tarefas: T8.1–T8.8 em [tasks/origem-destino/todo.md](../tasks/origem-destino/todo.md).

## Premissas (confirmadas com o usuário em 2026-10-16)

1. **Cidades**: as 15 que já estão no grafo (`kind` `endpoint` ou `cdn` em `src/data/nodes.ts`): São Paulo, Tóquio, Fortaleza, Sines, Marselha, Mumbai, Singapura, Hong Kong, Miami, Nova York, Londres, Frankfurt, Los Angeles, Sydney, Cidade do Cabo. Estações `landing` só servem para rotear e não aparecem na lista.
2. **Pessoas fixas**: Ana é sempre a remetente e Kenji sempre o destinatário; só a cidade muda (rótulo no telefone, texto de demonstração, nomes no globo e no log).
3. **Latência proporcional à rota**: a animação continua com ~13,5 s a 1×, mas os `ms` exibidos vêm do comprimento real da rota (luz na fibra ≈ 200.000 km/s, ou seja, 5 µs/km). SP → Tóquio (22.762 km com o backbone dos EUA, ver Decisão 1) dá ≈ 114 ms de ida.
4. **Seletor na barra superior**: o bloco de rota vira `Origem → Destino`, com dois **Select do shadcn/ui** (ver Decisão 3) e um botão de inverter (⇄). Assim como tipo, perda e MTU, trocar a rota **reinicia o envio** (t = 0, autoplay se não houver reduced motion).
5. **Padrão**: São Paulo → Tóquio, como hoje.

## Objetivo

Deixar o usuário comparar caminhos: ver que Londres → Frankfurt é um salto curto por terra e que São Paulo → Sydney cruza vários cabos submarinos, com a latência e o número de saltos mudando de acordo.

### User stories
- Como usuário, escolho a origem e o destino na barra superior e vejo a rota nova desenhada no globo, com a câmera abrindo sobre a origem.
- Como usuário, inverto a rota com um clique e Ana passa a enviar de onde estava Kenji.
- Como usuário, vejo a distância (km), o número de saltos e a latência (ms) da rota escolhida.

## Escopo técnico

- `src/sim/route.ts`: sem mudança de algoritmo. Ganha `routeKm(route)` (comprimento × `EARTH_KM`) e o cálculo de ms por tick derivado da distância; as duas funções são puras e testadas.
- `src/store.ts`: `origin` e `destination` (ids de nó) e `setRoute(origin, destination)`. A rota sai de uma constante de módulo e passa a ser derivada do store: `route` é recalculada só quando o par muda (memo por par; 15 cidades, 210 rotas possíveis). `MS_PER_TICK` deixa de ser constante.
- **Consumidores de `ROUTE` hoje**: `Globe/Route`, `Globe/Nodes`, `Globe/Traffic`, `Globe/CameraRig`, `lib/describe` (`whereOnRoute`, `ORIGIN_NAME`, `DESTINATION_NAME`, `HOP_COUNT`), `Chat/SenderPhone`, `Chat/ReceiverPhone`, `Cards/EventLog`, `Dock`, `App` (o texto fixo "GRU → NRT · 18.540 km"), `lib/payload` (`DEMO_TEXT` cita São Paulo). Todos passam a ler a rota do store; o globo continua lendo via `getState()` dentro de `useFrame` e só re-renderiza a geometria da rota quando o par muda.
- **Validação**: origem ≠ destino. Escolher como origem a cidade que hoje é destino (ou o contrário) troca as duas, em vez de bloquear.
- Determinismo mantido: a seed não depende da rota, então o mesmo cenário (tipo, perda, MTU) perde os mesmos `seq` em qualquer rota.

## Commands / Estrutura / Estilo

Os mesmos da v1 ([simulador-base.md](simulador-base.md) e [AGENTS.md](../AGENTS.md)). Uma dependência nova, aprovada: `@radix-ui/react-select` (Decisão 3). O componente fica em `src/components/ui/Select.tsx` + `Select.module.css`, no mesmo formato do `select.tsx` do shadcn (`Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`).

## Testing Strategy

- `tests/route.test.ts`: rota existe para os 210 pares; `routeKm` de SP → Tóquio ≈ 22.762 km; SP → Los Angeles passa por Nova York (não pela Ásia); latência proporcional (dobrar a distância dobra os ms).
- `tests/store.test.ts`: `setRoute` reinicia `t`, mantém tipo/perda/MTU, recusa origem = destino (troca as duas); inverter troca os dois ids.
- `tests/RoutePicker.test.tsx`: os dois triggers têm nome acessível (`combobox`), abrir lista as 15 cidades com a atual marcada, escolher a cidade do outro lado troca as duas, e o botão ⇄ inverte. O Radix Select usa APIs que o jsdom não tem (`hasPointerCapture`, `scrollIntoView`): stubs mínimos no setup do teste, com comentário dizendo o porquê.
- Globo: sem teste unitário (como hoje); validação visual só se você pedir.

## Boundaries

- **Sempre**: `src/sim/` puro; `npm test` + `npm run lint` verdes; mockup aprovado antes de mexer na UI.
- **Perguntar antes**: adicionar cabos ou cidades novas em `src/data/`, além do backbone `nyc → lax` já aprovado.
- **Nunca**: cor nova para origem/destino (A e B continuam distinguidos por forma); `snapshot()` direto em componente.

## Success Criteria

1. Os dois selects listam as 15 cidades; o padrão é São Paulo → Tóquio.
2. Trocar origem, destino ou inverter redesenha a rota no globo, move a câmera para a nova origem e reinicia o envio em t = 0, sem recarregar a página.
3. Telefones, globo, HUD, log de eventos e texto de demonstração mostram as cidades escolhidas; nenhum "São Paulo"/"Tóquio" fixo sobra na UI.
4. A barra mostra a distância real (km) e os saltos da rota; os `ms` do log e do dock escalam com a distância (Londres → Frankfurt ≪ SP → Tóquio).
5. Origem = destino é impossível pela UI.
6. Pacotes, perdas, SACK e retransmissão funcionam igual em qualquer par (mesma seed, mesmos `seq` perdidos).
7. Selects com nome acessível e navegáveis por teclado (setas, Enter, Esc, digitar para buscar, que o Radix já dá), alvo de 36px como os demais controles da barra superior (o mínimo absoluto do AGENTS.md é 24px), foco visível; cockpit continua sem rolagem da página a ≥ 1100×640.
8. `npm test`, `npm run lint` e `npm run build` verdes.

## Decisões

1. **Backbone dos EUA (aprovado)**: novo cabo terrestre `us-transcon` `nyc → lax` em `cables.ts` (waypoints em Chicago e Denver), que resolve o `ponytail:` do arquivo. Sem ele, SP → Los Angeles dava 36.934 km, dando a volta por Europa e Ásia. Efeito colateral aceito: a rota padrão SP → Tóquio deixa de passar por Europa/Suez (27.853 km, 8 saltos) e vai por Brasil → EUA → Japão: São Paulo → Fortaleza → Miami → Virginia Beach → Nova York → Los Angeles → Hillsboro → Tóquio (22.762 km, 7 saltos, ≈ 114 ms). Os 210 pares continuam com rota; a mais longa passa a ser SP ↔ Sydney (26.079 km).
2. **Texto de demonstração (aprovado)**: "Olha o pôr do sol daqui de {origem}!", com a cidade de origem interpolada.
3. **Seletor = Select do shadcn/ui (aprovado)**: só `@radix-ui/react-select`, que o shadcn usa por baixo, com o visual do shadcn portado para CSS Module e os nossos tokens. Sem Tailwind e sem CLI do shadcn, para não termos duas formas de estilizar no projeto. Visual: trigger de 36px, raio 8, borda `--border`, fundo `--surface-2`, chevron a 50%; lista com borda `--border`, fundo `--surface`, item ativo `#27272A` e ✓ na cidade escolhida. **Sem sombra na lista** (o shadcn usa `shadow-md`, mas o AGENTS.md reserva sombra para o dock); a borda já separa a lista do globo. O chip A (sólido) ou B (contornado) fica dentro do trigger. Combobox com busca fica de fora: não vale a pena para 15 cidades.
