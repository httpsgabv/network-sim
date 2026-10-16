# Spec: Network Simulator — "Da tecla Send à tela do outro"

> Status: **APROVADO (2026-10-16)**. Direção visual: mockup v4 "minimal tech" — https://claude.ai/artifact/Ks6KXiYBF7JwR1Uw5fto6J
> Plano: [tasks/simulador-base/plan.md](../tasks/simulador-base/plan.md) · Tarefas: [tasks/simulador-base/todo.md](../tasks/simulador-base/todo.md)

## Premissas (corrija agora ou sigo com elas)

1. **App web 100% client-side** (React + Vite + TypeScript). Sem backend — a "rede" é uma simulação determinística no navegador.
2. **Simulação educativa, não emulação real.** Pacotes, latências e perdas são modelados com números plausíveis, mas a animação é desacelerada para ser visível (ex.: 1 ms real ≈ 50–200 ms de tela, ajustável).
3. **Rota fixa por cenário**: remetente em São Paulo → CDN/IXP São Paulo → cabo submarino (ex.: EllaLink/SAm-1) → CDN Lisboa/Miami → … → destinatário (ex.: Tóquio). O usuário escolhe origem/destino entre ~10 cidades pré-definidas; o caminho é calculado num grafo estático de nós + cabos.
4. ~~**Cabos submarinos**: dataset estático **escrito à mão**~~ **Revogada em 2026-10-16** por [cabos-submarinos.md](cabos-submarinos.md): passamos a usar a malha real do TeleGeography (snapshot aberto de 2022, CC BY-NC-SA 3.0, gerada por `npm run data:cables`). Texto original: (~20–30 cabos reais como EllaLink, SEA-ME-WE 5/6, SJC2, MAREA, com waypoints aproximados) em `src/data/cables.ts`. Não copiamos o GeoJSON do TeleGeography (licença CC BY-NC-SA). Sem fetch em runtime.
5. **Criptografia real e didática**: usamos WebCrypto **AES-GCM** de verdade para cifrar o payload antes de fatiar e decifrar após remontagem. A troca de chaves (TLS/E2E) é mostrada apenas como etapa animada, não implementada.
6. **Pacotes "reais" na medida do útil**: o arquivo (texto/imagem/vídeo curto) vira bytes → cifra → fatiado em chunks de tamanho configurável (default 1 KB "MTU didático", senão uma foto viraria milhares de pacotes). Cada pacote tem `seq`, `checksum`, `ttl`, `size`.
7. **Perda de pacotes**: taxa configurável (0–30%) + botão "derrubar pacote" manual. Recuperação via **ACK seletivo (SACK)**: receptor ordena, detecta lacunas e pede retransmissão só dos faltantes.
8. **Vídeo**: suportado como arquivo curto (≤ 5 MB) tratado igual a imagem (bytes → pacotes). Sem streaming real.
9. **Idioma da UI**: português (pt-BR).
10. **Navegadores modernos com WebGL2**; desktop primeiro (≥ 1280 px). Mobile apenas "não quebra".

## Objetivo

Ferramenta visual/educativa que mostra **todo o caminho** de uma mensagem/foto/vídeo enviada pela internet:

1. Usuário A digita/anexa e aperta **Send** num chat simulado.
2. Payload é serializado → **cifrado** → **fatiado em pacotes** (visível como grade de blocos coloridos).
3. Pacotes viajam num **globo 3D** por uma cadeia de **CDNs/roteadores** conectados por **cabos submarinos** desenhados no globo.
4. Alguns pacotes **se perdem** (somem com efeito visual) ou chegam **fora de ordem**.
5. Receptor **ordena** pelos `seq`, detecta lacunas, **pede os faltantes** (NACK/SACK animado voltando pela rota), recebe retransmissão.
6. Remontagem completa → **decifra** → mensagem/imagem aparece no chat do usuário B, com status ✓✓ "visualizado".

Público: estudantes/devs curiosos. Sucesso = alguém leigo consegue narrar as etapas depois de assistir um envio.

### User stories
- Como usuário, envio uma **mensagem de texto** e vejo-a virar 1–3 pacotes cruzando o globo.
- Como usuário, envio uma **foto** e vejo-a virar N pacotes, alguns perdidos, retransmitidos, e a foto aparecer progressivamente ao ser decifrada.
- Como usuário, **pauso / avanço passo-a-passo / mudo a velocidade** da simulação.
- Como usuário, clico num **pacote** e vejo seu cabeçalho (seq, origem, destino, ttl, hop atual, bytes cifrados em hex).
- Como usuário, ajusto **taxa de perda** e **tamanho de pacote** e vejo o impacto (nº de pacotes, retransmissões, tempo total).

## Tech Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Build | Vite 6 + TypeScript 5 | padrão, rápido |
| UI | React 19 | pedido |
| 3D | three.js + @react-three/fiber + @react-three/drei | globo, arcos, instancing de pacotes |
| Estado | zustand | estado da simulação compartilhado entre globo e painéis sem prop drilling |
| Cripto | WebCrypto (nativo) | sem dependência |
| Estilo | CSS Modules + CSS variables (tokens abaixo) | sem framework extra |
| Fontes | `geist` (npm, Vercel) — Geist + Geist Mono | self-hosted, sem Google Fonts em runtime |
| Testes | Vitest + Testing Library | integrado ao Vite |

Sem lib de geo além de matemática lat/lon → vetor 3D (≈10 linhas). Continentes: **pontos pré-calculados** em `src/data/landDots.json` (~4.2k pontos, 47 KB), gerados por `npm run data:land` a partir do `world-atlas` (Natural Earth 50m, domínio público; `world-atlas` e `topojson-client` só como devDependencies). Sem textura fotográfica.

## Direção Visual (aprovada — mockup v4)

**Minimal tech** inspirado em Vercel / shadcn / Tesla. O globo é o protagonista; o resto fica quieto.

### Tokens
```css
:root {
  --bg: #000000;          /* página, com grid de pontos #FFFFFF12 a cada 28px */
  --surface: #0A0A0B;     /* cards, telefones, dock */
  --surface-2: #111113;   /* trilho de tabs/segmented */
  --border: #27272A;      /* zinc-800 */
  --border-soft: #1F1F23;
  --fg: #FAFAFA;          /* texto principal, pacote em trânsito */
  --fg-muted: #A1A1AA;    /* zinc-400 — texto secundário (≥ 7:1 no preto) */
  --fg-subtle: #84848D;   /* labels mono: ≥ 4.5:1 também sobre --surface-2 (o zinc-500 original dava 4.1:1) */
  --land: #71717A;        /* pontos dos continentes, opacidade .75 */
  --lost: #EF4444;        /* perdido */
  --resend: #F5A524;      /* SACK + retransmissão */
  --done: #22C55E;        /* só "visualizado" */
  --radius-card: 12px; --radius-control: 8px; --radius-phone: 32px;
}
```
- **Monocromático** + 3 cores de sinal (perdido, reenvio, visualizado). Nenhuma outra cor de destaque: na v6 um par azul/lilás para A/B deixou a tela com cara de gerada por IA e foi revertido.
- **Contextos A · Rede · B são distinguidos por forma, não por cor**: A = chip sólido, B = chip contornado, Rede = chip tracejado com ⇄. Lado ativo = borda branca a 25%.
- **Tipografia**: Geist 500 para títulos (letter-spacing −0.035em, etapa atual em 44px), Geist 400 corpo 13–15px, Geist Mono 10–12px uppercase para labels, números e dados.
- **Componentes estilo shadcn**: cards com borda 1px `--border`, tabs/segmented com trilho `--surface-2` e item ativo `#27272A`, badges pill, botão primário branco sólido.
- **Layout (v6, "contextos")**: em telas ≥ 1100×640 tudo cabe num 100vh. Três contextos lado a lado, em duas linhas alinhadas: **A · Remetente** (telefone A + fila de saída), **Rede** (globo com dock; Pacote | Eventos em abas embaixo) e **B · Destinatário** (telefone B + buffer de entrada). Etapas 1–3 = A, 4 = Rede, 5/8/9 = B, 6–7 = ida e volta pela rede. Um pacote nunca está em A e B ao mesmo tempo: sai da fila de A e voa para o buffer de B. Telas menores: empilhado com rolagem. Mockup: artboard "v6 — Contextos".

### Globo (R3F)
- Esfera escura com shading suave (centro `#1C1C21` → borda `#050506`) + halo de atmosfera branco a ~10% de opacidade.
- Continentes como **pontos** (instanced), graticule a 4–5% de opacidade, cabos como linhas brancas a ~12%.
- Rota ativa: linha branca a 22% + **"marching dots"** animados por cima (dash offset).
- Nós da rota: anel branco; CDNs fora da rota: ponto cinza. Labels em Geist Mono uppercase (HTML overlay via drei `<Html>`).

### Animações (requisito, não enfeite)
| Elemento | Comportamento |
|---|---|
| Câmera | segue o pacote líder ao longo da rota; volta junto com o SACK; drift lento quando ociosa |
| Pacote em trânsito | ponto branco com glow + **rastro** (cauda ~5% da rota) |
| Salto entre nós | ~~pacote viaja em **arco acima da superfície** (altitude ∝ sin(πf)), não colado no cabo~~ desde [cabos-submarinos.md](cabos-submarinos.md): o pacote anda **colado no traçado real do cabo** |
| Perda | pacote para, vira × vermelho com anel que expande e some |
| SACK | anel âmbar viajando **de volta** pela rota com rastro |
| Retransmissão | pontos âmbar com rastro mais longo |
| Origem/destino | dois anéis concêntricos pulsando em Send e na entrega |
| Foto no receptor | tiles cifrados (hex) → revelação progressiva por seq ao decifrar |
| Botão Send | anel + glow branco ao pressionar |
- Respeitar `prefers-reduced-motion`: sem drift, sem pulso; rastros viram pontos estáticos; câmera faz cortes em vez de pan.

## Commands

```
Install: npm install
Dev:     npm run dev
Build:   npm run build
Test:    npm test            # vitest run
Watch:   npm run test:watch
Lint:    npm run lint        # tsc --noEmit + eslint
```

## Project Structure

```
src/
  sim/                 → núcleo puro (sem React): testável isolado
    packetize.ts       → bytes → Packet[] / Packet[] → bytes
    crypto.ts          → encrypt/decrypt AES-GCM (WebCrypto)
    route.ts           → grafo de nós/cabos + caminho origem→destino
    engine.ts          → máquina de estados/tick: envio, perda, reorder, SACK, retransmissão
    types.ts
  data/
    nodes.ts           → cidades, CDNs, IXPs (lat/lon)
    cables.json        → cabos submarinos reais (gerado; ver cabos-submarinos.md)
  store.ts             → zustand: estado da simulação + controles
  components/
    Globe/             → Globe, Cables, Nodes, PacketSwarm (instanced), AckFlights
    Chat/              → SenderPhone, ReceiverPhone
    Pipeline/          → stepper das etapas (Send → Encrypt → Packetize → Transit → Reorder → Recover → Decrypt → Render)
    PacketGrid/        → grade de pacotes com status (enviado/em trânsito/perdido/recebido/retransmitido)
    Inspector/         → cabeçalho do pacote selecionado
    Dock/              → play/pause/step/velocidade/perda + barra de etapas + scrubber
  styles/tokens.css    → tokens da Direção Visual
  App.tsx
tests/                 → *.test.ts espelhando src/sim
public/textures/       → textura do globo
```

## Code Style

TS estrito, funções puras no `sim/`, componentes finos que só leem do store.

```ts
// src/sim/packetize.ts
export function packetize(bytes: Uint8Array, mtu: number): Packet[] {
  const total = Math.ceil(bytes.length / mtu);
  return Array.from({ length: total }, (_, seq) => ({
    seq,
    total,
    payload: bytes.subarray(seq * mtu, (seq + 1) * mtu),
    status: 'queued',
  }));
}

export function reassemble(packets: Packet[]): Uint8Array | null {
  const sorted = [...packets].sort((a, b) => a.seq - b.seq);
  if (sorted.length !== sorted[0]?.total) return null; // lacunas → pedir SACK
  return concat(sorted.map((p) => p.payload));
}
```

- `camelCase` funções/variáveis, `PascalCase` componentes/tipos, arquivos de componente `PascalCase.tsx`.
- Sem classes no `sim/`; estado imutável por tick.
- Sem comentários óbvios; comentar só o *porquê* (ex.: por que o MTU é didático).

## Testing Strategy

- **Unit (Vitest)** em tudo de `src/sim/`: packetize/reassemble ida-e-volta, detecção de lacunas, SACK pede exatamente os `seq` faltantes, encrypt→decrypt ida-e-volta, rota existe entre todos os pares de cidades, engine converge (todos os pacotes entregues) com perda de 0–30% em seed fixa.
- **Componentes**: 1 smoke test por painel (renderiza com store mockado). Globo 3D **não** é testado em unidade — verificação manual/visual no browser.
- **Determinismo**: engine usa PRNG com seed → mesma seed, mesma perda → testes estáveis e replay possível.
- Meta: `src/sim/` ≥ 90% de cobertura; UI sem meta.

## Boundaries

- **Sempre**: manter `sim/` livre de React/three; rodar `npm test` e `npm run lint` antes de considerar uma tarefa pronta; atualizar esta spec quando uma decisão mudar.
- **Perguntar antes**: adicionar dependência fora da tabela de Tech Stack; trocar dataset de cabos; mudar o modelo de recuperação (SACK) por outro; qualquer backend/rede real.
- **Nunca**: fazer requisição de rede real com o conteúdo do usuário; enviar arquivos do usuário para fora do navegador; commitar assets com licença incompatível.

## Success Criteria

1. Enviar texto: mensagem aparece no telefone B ≤ 15 s em velocidade 1×, com todas as 8 etapas do pipeline destacadas em sequência.
2. Enviar foto (≤ 2 MB) com perda 10%: pacotes perdidos ficam visíveis (vermelho) na grade e somem no globo; SACK volta pela rota; retransmitidos ficam destacados; imagem final é **byte-a-byte igual** à original (teste unitário cobre).
3. Globo 3D: rotacionável/zoom, cabos visíveis, ≥ 8 nós CDN/IXP rotulados, pacotes animados seguindo os arcos dos cabos; ≥ 50 fps com 500 pacotes em voo num notebook comum (instancing).
4. Controles: play/pause, passo-a-passo, velocidade 0.25×–4×, perda 0–30%, MTU 256 B–8 KB funcionam ao vivo.
5. Clicar num pacote abre inspector com cabeçalho e trecho hex do payload cifrado.
6. Todas as animações da tabela "Animações" visíveis; com `prefers-reduced-motion` ativo, nenhuma animação contínua roda.
7. UI bate com o mockup v4 (tokens, Geist, layout). Contraste de texto ≥ 4.5:1 e alvos de toque ≥ 44px.
8. `npm test` verde; `npm run build` sem erros.

## Decisões (antes "Open Questions")

1. **Origem/destino**: v1 usa rota fixa SP → Tóquio. Escolher cidades: ver "Feature: escolha de origem e destino" abaixo (em especificação).
2. **Realismo de protocolo**: v1 mostra pacotes + SACK. Handshake TCP/TLS e DNS ficam para v2.
3. **Vídeo**: tratado como arquivo (≤ 5 MB), sem streaming.
4. **Visual**: minimal tech (mockup v4). ✅
5. **Deploy**: só local na v1. Perguntar antes de publicar.
