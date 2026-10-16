# Feature: cabos submarinos reais

> Status: **IMPLEMENTADA (2026-10-16)**, sem validação no browser. Mockup: artboard "v8 — Cabos" (aprovado em 2026-10-16). Plano: [tasks/cabos-submarinos/plan.md](../tasks/cabos-submarinos/plan.md) · Tarefas: [tasks/cabos-submarinos/todo.md](../tasks/cabos-submarinos/todo.md).

## Premissas (respondidas pelo usuário em 2026-10-16)

1. **Dados = TeleGeography** (`cable-geo.json` + `landing-point-geo.json` + ficha por cabo, do repositório público `telegeography/www.submarinecablemap.com`). Isso **revoga** a premissa 4 de [simulador-base.md](simulador-base.md) ("não copiamos o GeoJSON do TeleGeography"). Ver Decisão 1 (licença).
2. **Visualização**: (a) os cabos da rota ficam destacados e rotulados no globo; (b) a malha mundial aparece esmaecida ao fundo; (c) a ficha de um cabo abre no clique (nome, ano, comprimento, proprietários, estações de pouso); (d) uma lista de trechos mostra cada salto (estação → estação, cabo, km, ms).
3. **O pacote segue o cabo**: anda colado no traçado real, sobre o oceano. Isso substitui o arco acima da superfície (spec base, "Salto entre nós"; AGENTS.md §7).
4. **Nós = estações de pouso reais + backhaul terrestre**: as 15 cidades selecionáveis continuam as mesmas; cada uma se liga às estações de pouso da região por backbone terrestre. A rota escolhe o melhor caminho entre os cabos reais (ex.: São Paulo → Praia Grande → cabo → Fortaleza ou Virginia Beach → …).

## Objetivo

Fazer a infraestrutura simulada ser a real: o usuário vê por quais cabos de verdade a mensagem passa, onde eles chegam à terra, quanto medem e quanto tempo a luz leva neles. Ele também vê o resto da malha mundial, para entender que a rota é só uma entre muitas.

### User stories
- Como usuário, vejo no globo todos os cabos submarinos do mundo, discretos, e os da minha rota em destaque com o nome.
- Como usuário, vejo o pacote correndo pelo traçado do cabo, contornando costas e ilhas, em vez de um arco no ar.
- Como usuário, abro a aba **Rota** e leio cada trecho: `Praia Grande → Fortaleza · Seabras-1 · 2.890 km · 14 ms`.
- Como usuário, clico num cabo (no globo ou na lista) e leio a ficha: ano de operação, comprimento, proprietários e estações de pouso.

## Escopo técnico

### Dados (gerados em build, nunca buscados em runtime)
- `npm run data:cables` → `scripts/build-cables.ts` (mesmo modelo do `data:land`). O script baixa os JSONs do TeleGeography, gera `src/data/cables.json` e esse arquivo vai para o git. Em runtime nada é buscado.
- O script:
  - **descarta** cabos ainda não ativos (RFS no futuro ou sem traçado);
  - **simplifica** o traçado (Douglas–Peucker, poucas linhas, sem dependência nova; meta: `cables.json` ≤ 1,5 MB);
  - **encaixa** cada estação de pouso no vértice mais próximo do traçado do próprio cabo e corta o cabo em **trechos entre estações vizinhas** (os ramos dos cabos com *branching unit* entram como grafo por cabo, não como uma única linha);
  - grava, por cabo: `id`, `name`, `rfs`, `lengthKm` (o oficial), `owners`, `landings` e os trechos (`a`, `b`, `points`).
- `src/data/cables.ts` (escrito à mão hoje) fica só com os **backbones terrestres** e a ligação **cidade ↔ estação de pouso** (backhaul). Regra do backhaul: cada cidade se liga às estações de pouso a até **1.500 km** (aprovado, Decisão 3), com comprimento = distância geodésica × **1,3** (fibra terrestre não vai em linha reta). Os backbones atuais entre cidades continuam.
- `src/data/nodes.ts`: as 15 cidades ficam; as 6 estações escritas à mão (`vab`, `bil`, `ore`, `lis`, `lad`, `mba`) são trocadas pelas estações reais do dataset.

### Rota (`src/sim/route.ts`, puro)
- Mesmo contrato `Route { hops, legs, length, posAt }`. O grafo passa de ~20 para ~1.000+ nós, então o Dijkstra O(n²) ganha uma heap binária (resolve o `ponytail:` existente). A rota continua memoizada por par.
- `posAt(s)` passa a devolver `h = 0` (colado na superfície, um pouco acima do cabo para não haver z-fighting). Os trechos terrestres também ficam colados. A constante `HOP_ALTITUDE` sai.
- Latência continua 5 µs/km, agora sobre o comprimento real do traçado. Ver Success Criteria 4.

### Globo (`components/Globe/`)
- **Malha**: todos os cabos numa **única geometria** (`LineSegments` mesclado, uma draw call), brancos a ~8%. Não pode haver um `<Line>` por cabo: com ~500 cabos isso derruba o fps.
- **Cabos da rota**: o cabo inteiro de cada trecho a ~35%, o trecho percorrido a ~70%, com marching dots (como `Route` hoje). Rótulo do nome do cabo no meio de cada trecho, em Geist Mono, como os rótulos de nó.
- **Estações de pouso**: pontos pequenos `--land`. As da rota ficam brancas e rotuladas.
- **Clique** num cabo da malha ou da rota → seleciona o cabo (`selectedCable` no store) e abre a ficha. O picking usa raycast na geometria mesclada com `threshold` folgado, e um mapa de segmento → cabo.
- Paleta inalterada: branco/cinza. Perda, SACK e retransmissão mantêm as cores de sinal. Sem cor nova para cabos.

### Painéis (mockup primeiro)
- Coluna **Rede**, linha de detalhes: as abas `Eventos | Pacote` ganham **`Rota`**: lista de trechos (estação A → estação B, cabo, km, ms), com o trecho atual do pacote líder marcado por peso/borda (não por cor). Clicar no nome do cabo abre a ficha.
- **Ficha do cabo**: dentro da aba Rota, substitui a lista com um "← Trechos" para voltar. Mostra nome, ano (RFS), comprimento oficial, proprietários, estações de pouso, e mostra se o cabo está na rota atual. Não usamos popover sobre o globo: assim não brigamos com a câmera nem com o cockpit sem rolagem.
- **Atribuição**: crédito permanente e discreto ("Dados de cabos: TeleGeography · CC BY-NC-SA"), com link para a fonte, no rodapé do card do globo. O README também cita a fonte.

### Consumidores afetados
`sim/route`, `data/nodes`, `data/cables`, `lib/describe` (`whereOnRoute` passa a usar os nomes do JSON), `Globe/Cables`, `Globe/Route`, `Globe/Nodes`, `Globe/Traffic` (sem arco), `Globe/CameraRig` (a mediana continua, agora na superfície), `Cards/Inspector` (campo Cabo), `Cards/EventLog`, `store` (`selectedCable`, aba `route`), novo `Cards/RouteLegs` + `Cards/CableCard`.

## Commands

Os mesmos de [AGENTS.md](../AGENTS.md) §2, mais:

```bash
npm run data:cables   # baixa o TeleGeography e regenera src/data/cables.json
```

## Estrutura / Estilo

Os mesmos da v1. A lógica pura do script (simplificar, encaixar estação no traçado, cortar em trechos) fica em `scripts/lib/cables.ts` (TS que o Node 26 roda direto), exportada para que o Vitest consiga testar. Nenhuma dependência nova.

## Testing Strategy

- `tests/build-cables.test.ts` (fixture pequena escrita à mão, sem rede): Douglas–Peucker preserva as pontas e respeita a tolerância; a estação encaixa no vértice certo; um cabo com 3 estações vira 2 trechos; um cabo com ramo (`MultiLineString` em Y) vira 3 trechos; um cabo com RFS no futuro é descartado.
- `tests/route.test.ts` (sobre o `cables.json` real):
  - os 210 pares têm rota;
  - toda rota começa e termina em cidade;
  - toda perna submarina pertence a um cabo do dataset;
  - `posAt(s).h === 0`;
  - a heap dá o mesmo resultado que a busca antiga num grafo pequeno;
  - faixas de latência plausíveis (Success Criteria 4).
- `tests/RouteLegs.test.tsx` / `CableCard.test.tsx`:
  - a lista mostra um item por trecho, com `data-active` no trecho atual;
  - clicar no cabo abre a ficha, "← Trechos" volta;
  - a atribuição está presente.
- Desempenho e visual do globo: sem teste unitário. Validação no browser só se você pedir.
- Cobertura de `src/sim/` continua ≥ 90%.

## Boundaries

- **Sempre**: dados gerados por script e commitados; atribuição visível; `src/sim/` puro; `npm test` + `npm run lint` + `npm run build` verdes; mockup "v8 — Cabos" aprovado antes da UI.
- **Perguntar antes**: dependência nova (ex.: lib de simplificação ou de BVH para picking); mudar a regra de backhaul; incluir cabos planejados; aumentar o orçamento de 1,5 MB.
- **Nunca**: fetch do TeleGeography em runtime; uso comercial do projeto enquanto esses dados estiverem nele; cor nova para cabos; um `<Line>` por cabo.

## Success Criteria

1. `npm run data:cables` é reprodutível e gera `src/data/cables.json` ≤ 1,5 MB, só com cabos ativos e trechos entre estações reais.
2. O globo mostra a malha mundial esmaecida, e os cabos da rota ficam destacados e rotulados pelo nome real.
3. A rota padrão São Paulo → Tóquio passa por estações e cabos reais, e o pacote anda colado no traçado (nenhum arco acima da superfície).
4. Latência de ida plausível, comparada com medições reais: SP → Tóquio entre **110 e 160 ms**; Londres → Frankfurt < **10 ms**; SP → Miami entre **35 e 60 ms**. Os testes travam essas faixas.
5. Aba **Rota** lista os trechos com estação, cabo, km e ms; o trecho do pacote líder fica marcado.
6. Clicar num cabo (globo ou lista) abre a ficha com nome, ano, comprimento, proprietários e estações de pouso.
7. A atribuição ao TeleGeography fica visível na UI e no README.
8. Desempenho: ≥ 50 fps no notebook de referência com a malha completa e 500 pacotes em voo; a malha usa uma draw call.
9. Perdas, SACK e retransmissão continuam determinísticos (mesma seed, mesmos `seq`), em qualquer par.
10. Cockpit sem rolagem a ≥ 1100×640; contraste, nomes e foco da aba e da ficha conforme AGENTS.md §8.
11. AGENTS.md §7 e a spec base atualizados: o pacote segue o cabo, não faz arco.

## Decisões

1. **Licença (confirmada em 2026-10-16)**: os dados do TeleGeography são CC BY-NC-SA. Consequências: atribuição obrigatória (Critério 7), **uso não comercial** e o `cables.json` derivado sob a mesma licença (o README diz isso). O `package.json` já é `private`. Isso revoga, com registro, a regra da spec base e o "commitar assets com licença incompatível" daquela spec. Vale só para o arquivo de dados.
2. **Sem capacidade (Tbps) na ficha**: o dataset não traz esse dado de forma consistente. A ficha mostra só o que existe.
3. **Backhaul sintético**: o TeleGeography não tem redes terrestres. A ligação cidade ↔ estação é aproximada (raio + fator 1,3) e leva um comentário `ponytail:` dizendo o limite: ignora a topologia real dos backbones; para evoluir, troque por dados de backbone abertos.

4. **Fonte efetiva = snapshot de 2022 (2026-10-16)**: o repositório `telegeography/www.submarinecablemap.com` foi apagado. Os dados de hoje só saem pela API do site e não têm licença aberta: a CC BY-SA 4.0 atual do TeleGeography cobre mapas e capturas de tela, e os dados geocodificados são vendidos. Por isso usamos o **zip arquivado no Internet Archive** (commit `54055b5`, arquivos de 2022-08-05, arquivado em 2022-08-16). O `LICENSE` dentro do zip é **CC BY-NC-SA 3.0 Unported** (conferido). O script fixa a URL e o SHA-256 do zip. Limite: a malha é a de 2022; cabos que em 2022 estavam "planejados" (2Africa, SJC2, Grace Hopper, Equiano…) ficam fora (ver pergunta 5).

## Perguntas respondidas (2026-10-16)

1. **Licença**: projeto não comercial; `cables.json` publicado sob CC BY-NC-SA, com atribuição na UI.
2. **Raio do backhaul**: 1.500 km.
3. **Download**: autorizado rodar `npm run data:cables` na tarefa de dados.
4. **Ficha**: dentro da aba Rota.
5. **Cabos planejados em 2022 com RFS ≤ 2026** (63, incluindo 2Africa, SJC2, Grace Hopper, Equiano e Firmina): **em aberto**. O padrão da spec é deixar de fora.
