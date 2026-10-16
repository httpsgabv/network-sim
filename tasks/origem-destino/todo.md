# Feature — Origem e destino (spec e mockup v7 aprovados em 2026-10-16)

Plano: [plan.md › Plano — Feature: escolha de origem e destino](plan.md). Validação no browser só quando pedida.

- [x] **T8.1 Backbone dos EUA + matemática da rota**
  - Aceite: cabo `us-transcon` (`nyc → [41.9,-87.6] → [39.7,-105] → lax`); `routeKm(route)` e `msPerTick(km)` (5 µs/km ÷ 100 ticks de trânsito), puros, em `route.ts`; sai o `ponytail:` de `cables.ts`
  - Testes: SP → Tóquio = `sao fza mia vab nyc lax ore tyo` (≈ 22.762 km); SP → LA passa por `nyc`; os 210 pares de cidades têm rota; `msPerTick` dobra quando a distância dobra
  - Verificar: `npm test -- route`, `npm run coverage` (`sim/` ≥ 90%)
  - Arquivos: `src/data/cables.ts`, `src/sim/route.ts`, `tests/route.test.ts`
- [x] **T8.2 Store: origem, destino e rota derivada**
  - Aceite: `origin`, `destination`, `route`, `msPerTick`, `setRoute(o, d)` (zera `t`, autoplay sem reduced motion, mantém tipo/perda/MTU/`plan`); escolher a cidade que está do outro lado troca as duas; `swapRoute()`; `routeFor` memoizado por par; `CITIES` (15 ids, ordem oeste → leste) exportado de `data/nodes.ts`; `ROUTE`/`MS_PER_TICK` ficam `@deprecated` apontando para o par padrão
  - Testes: `setRoute` reinicia `t` e não muda os `seq` perdidos do `plan`; o mesmo par devolve a mesma instância de rota; origem = destino vira troca
  - Verificar: `npm test`, `npm run lint`
  - Arquivos: `src/store.ts`, `src/data/nodes.ts`, `tests/store.test.ts`
- [x] **T8.3 Texto do lado da rede: describe, Cards e Hud**
  - Aceite: `whereOnRoute(route, pos)` e `endpointNames(route)` em `describe.ts`; EventLog (nomes e `msPerTick`), Inspector (nomes, TTL por salto) e Hud leem `route` do store; o HUD ganha **ROTA: km · saltos · ≈ ms**, como no v7
  - Testes: `tests/Cards.test.tsx` com `setRoute('lon', 'fra')` mostra Londres/Frankfurt e ms menores
  - Verificar: `npm test`, `npm run lint`
  - Arquivos: `src/lib/describe.ts`, `src/components/Cards/EventLog.tsx`, `src/components/Cards/Inspector.tsx`, `src/components/Hud.tsx`, `tests/Cards.test.tsx`
- [x] **T8.4 Telefones, Dock e texto de demonstração**
  - Aceite: o `city` dos telefones vem da rota; o `t+ ms` do dock usa `msPerTick`; `demoText(city)` = "Olha o pôr do sol daqui de {origem}!", regenerado quando a rota muda
  - Testes: `tests/payload.test.ts` (`demoText`); `tests/Dock.test.tsx` (ms seguem a rota)
  - Verificar: `npm test`, `npm run lint`
  - Arquivos: `src/components/Chat/SenderPhone.tsx`, `src/components/Chat/ReceiverPhone.tsx`, `src/components/Dock/Dock.tsx`, `src/lib/payload.ts`, `tests/payload.test.ts`
- [x] **T8.5 Globo segue a rota + remoção de `ROUTE`/`MS_PER_TICK`**
  - Aceite: `Route` e `Nodes` assinam `s.route`; `Traffic` e `CameraRig` leem `getState().route` no `useFrame`, incluindo os pulsos de origem/destino; vista inicial e `aria-label` do `Globe` usam as cidades da rota; `ROUTE` e `MS_PER_TICK` removidos (`grep` vazio)
  - Verificar: `npm test`, `npm run lint`, `npm run build`
  - Arquivos: `src/components/Globe/{Route,Nodes,Traffic,CameraRig,Globe}.tsx` (+ `store.ts` para remover os exports)
- [x] **T8.6 `ui/Select` no padrão shadcn** (paralelizável desde já)
  - Aceite: `npm i @radix-ui/react-select`; `Select`, `SelectTrigger`, `SelectValue`, `SelectContent` (Portal, `position="popper"`) e `SelectItem` (✓ no selecionado) com o visual da Decisão 3 (36 px, raio 8, sem sombra, foco `2px solid var(--fg)`)
  - Testes: `tests/Select.test.tsx` abre por teclado, escolhe um item e chama `onValueChange`; stubs de jsdom comentados
  - Verificar: `npm test`, `npm run lint`, `npm run build`
  - Arquivos: `package.json`, `src/components/ui/Select.tsx`, `src/components/ui/Select.module.css`, `tests/Select.test.tsx`
- [x] **T8.7 `RoutePicker` na barra superior**
  - Aceite: chips A (sólido) e B (contornado) dentro dos triggers, ⇄ entre eles, 15 cidades de oeste a leste; substitui o texto fixo "GRU → NRT · 18.540 km" do `App`; abaixo de 1280 px a marca vira só o ícone e a barra cabe em 1100 px
  - Testes: `tests/RoutePicker.test.tsx` cobre nomes acessíveis, 15 opções com a atual marcada, a troca quando se repete a cidade do outro lado, e o ⇄ invertendo e reiniciando `t`
  - Verificar: `npm test`, `npm run lint`, `npm run build`
  - Arquivos: `src/components/Dock/RoutePicker.tsx`, `src/components/Dock/RoutePicker.module.css`, `src/App.tsx`, `src/App.module.css`, `tests/RoutePicker.test.tsx`
- [x] **T8.8 Docs e checkpoint**
  - Aceite: spec (status da feature), AGENTS.md (store com `origin`/`destination`/`route`, `components/ui/`, mockup v7 como referência), README (seletor, backbone, latência por distância); tabela com os 8 critérios da feature, dizendo o que foi e o que não foi verificado
  - Verificar: `npm test`, `npm run lint`, `npm run build`, `npm run coverage`
  - Arquivos: `specs/origem-destino.md`, `AGENTS.md`, `README.md`, `tasks/origem-destino/todo.md`

## Checkpoint (2026-10-16)

`npm test` (144 testes), `npm run lint` e `npm run build` verdes; `npm run coverage`: `src/sim/` com 98,9% de linhas e 94,4% de branches.

| # | Critério | Status |
|---|---|---|
| 1 | Selects listam 15 cidades; padrão São Paulo → Tóquio | ✅ testado (`RoutePicker.test.tsx`) |
| 2 | Trocar/inverter redesenha rota, move a câmera e reinicia em t = 0 | ✅ reinício testado; ⚠️ redesenho e câmera só por leitura de código (sem browser) |
| 3 | Nenhum "São Paulo"/"Tóquio" fixo na UI | ✅ `grep` limpo; telefones, HUD, log, inspetor, demo e `aria-label` do globo seguem a rota |
| 4 | km e saltos na barra; ms escalam com a distância | ✅ testado (Londres → Frankfurt ≪ SP → Tóquio) |
| 5 | Origem = destino impossível | ✅ vira troca (testado) |
| 6 | Mesma seed, mesmos `seq` perdidos em qualquer rota | ✅ testado |
| 7 | Teclado, nome acessível, foco, cockpit sem rolagem ≥ 1100×640 | ⚠️ nome e teclado (Radix) testados; foco e ausência de rolagem **não** verificados no browser |
| 8 | test, lint, build verdes | ✅ |

Validação visual no browser não foi feita (só quando pedida). O aviso de chunk > 500 kB do build já existia.
