# Live Monitor Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o backend read-only do Live Monitor da Alphractal para Ethereum Mainnet, com recomendação de taxas, custo máximo de uma transferência nativa, tendência de 24 horas, confiança explicável, observação e pesquisa de blocos, persistência por 30 dias, REST e um único stream SSE.

**Architecture:** Evoluir o bootstrap Express existente para um monólito modular com dependências apontando de interfaces e infraestrutura para aplicação e domínio. O domínio trabalha com `bigint` em wei e tipos normalizados, sem conhecer Express, `viem`, MongoDB, WebSocket, variáveis de ambiente ou os DTOs JSON. Adaptadores convertem dados externos para portas da aplicação; serializers compartilhados convertem os modelos internos nos schemas de `packages/contracts`.

**Tech Stack:** Node.js 24, TypeScript 6, Express 5, Zod 4, viem 2, ws 8, MongoDB 6, Pino, Vitest 3 e Supertest.

## Global Constraints

- Implementar sobre a base de `origin/codex/backend-bootstrap` e preservar os documentos aprovados desta branch.
- Tratar `docs/api/fees-contract.md` como fonte normativa dos payloads e `docs/superpowers/specs/2026-08-30-live-monitor-backend-design.md` como fonte normativa do comportamento.
- Manter Ethereum Mainnet fixa e rejeitar análise anterior ao bloco `12965000`.
- Manter `domain` livre de Express, Zod, viem, MongoDB, WebSocket e `process.env`.
- Representar wei, número de bloco, `gasUsed` e `gasLimit` como `bigint` internamente; converter somente nas bordas.
- Arredondar apenas na serialização: Gwei 9 casas, ETH 18, USD 6 e percentuais 2, metade para longe de zero.
- Injetar `Clock`, fontes, repositórios e publicadores para que todos os testes sejam determinísticos e não usem rede externa.
- Usar somente testes com no máximo dois forks. Não executar servidor, build amplo e suíte ampla em paralelo.
- Nunca registrar URLs completas da Alchemy, credenciais, transações pendentes completas ou erros brutos de provedores.
- Prefixar todo comando de terminal com `rtk`, conforme a política global do repositório.
- Cada tarefa termina com testes focados, typecheck/lint relevantes, commit e `git push`. Não acumular várias tarefas sem checkpoint.
- Não criar uma segunda rota SSE de fees. `GET /api/v1/live/stream` é a única conexão EventSource.

## File Structure

```text
packages/contracts/
  package.json
  vitest.config.ts
  src/
    common.ts
    errors.ts
    fees.ts
    blocks.ts
    live.ts
    index.ts
  test/
    contracts.test.ts

apps/api/src/
  domain/
    shared/
      clock.ts
      statistics.ts
      units.ts
    fees/
      models.ts
      ports.ts
      fee-estimator.ts
      fee-confidence.ts
      fee-trend.ts
      transfer-cost.ts
    blocks/
      models.ts
      ports.ts
      block-analyzer.ts
      block-fee-level.ts
      block-finality.ts
      recent-block-window.ts
  application/
    common/
      errors.ts
      live-event-publisher.ts
    fees/
      calculate-fee-snapshot.ts
      fee-monitor.ts
      get-current-fee-snapshot.ts
      get-fee-history.ts
    blocks/
      observe-block.ts
      prime-recent-blocks.ts
      get-recent-blocks.ts
      get-block-by-identifier.ts
      update-block-finality.ts
  infrastructure/
    alchemy/
      alchemy-fee-client.ts
      alchemy-mempool-client.ts
      alchemy-block-client.ts
      reconnecting-websocket.ts
    coinbase/
      coinbase-price-client.ts
    mongodb/
      mongo-client.ts
      mongo-fee-snapshot-repository.ts
      mongo-observed-block-repository.ts
  interfaces/
    http/
      request-id-middleware.ts
      live-serializers.ts
      fee-routes.ts
      block-routes.ts
      error-middleware.ts
    sse/
      live-sse-hub.ts
  config/
    env.ts
    root-env.ts
  app.ts
  runtime.ts
  server.ts

apps/api/test/
  helpers/
    fakes.ts
    fixtures.ts
  domain/
    statistics.test.ts
    fee-estimator.test.ts
    fee-snapshot-values.test.ts
    block-rules.test.ts
  application/
    fee-monitor.test.ts
    block-use-cases.test.ts
  infrastructure/
    alchemy-clients.test.ts
    coinbase-price-client.test.ts
    mongo-repositories.test.ts
  interfaces/
    live-http.test.ts
    live-sse.test.ts
  runtime/
    resilience.test.ts
```

## Required Interfaces

Estes contratos internos devem ser estabelecidos antes dos adaptadores. Nomes podem ser refinados durante a implementação, mas responsabilidade, direção de dependência e semântica não podem mudar sem atualizar a spec.

```ts
export interface Clock {
  now(): Date;
}

export interface Rational {
  numerator: bigint;
  denominator: bigint;
}

export interface FeeEvidence {
  latestBaseFeeWei: bigint;
  projectedNextBaseFeeWei: bigint;
  historicalRewardP60Wei: bigint[];
  ethereumUpdatedAt: Date;
}

export interface PendingBid {
  hash: `0x${string}`;
  observedAt: Date;
  kind: "eip1559" | "legacy";
  maxFeePerGasWei?: bigint;
  maxPriorityFeePerGasWei?: bigint;
  gasPriceWei?: bigint;
}

export interface PriceQuote {
  ethUsd: Rational;
  updatedAt: Date;
}

export interface FeeSnapshotRepository {
  insert(snapshot: FeeSnapshot): Promise<void>;
  findLatest(): Promise<FeeSnapshot | null>;
  findWindow(from: Date, to: Date): Promise<FeeSnapshot[]>;
  findPage(query: FeeHistoryQuery): Promise<FeeHistoryPage>;
  isAvailable(): boolean;
}

export interface EthereumBlockSource {
  getBlock(identifier: bigint | `0x${string}`): Promise<NormalizedBlock | null>;
  getLatestBlockNumber(): Promise<bigint>;
  getFinalityHeads(): Promise<FinalityHeads>;
}

export interface ObservedBlockRepository {
  saveCanonical(block: BlockSummary): Promise<void>;
  markNoncanonical(
    network: "ethereum-mainnet",
    number: bigint,
    exceptHash: `0x${string}`,
  ): Promise<void>;
  findRecent(limit: number): Promise<BlockSummary[]>;
  findCanonicalBefore(timestamp: Date, from: Date): Promise<BlockSummary[]>;
  updateFinality(changes: FinalityChange[]): Promise<void>;
  isAvailable(): boolean;
}

export type LiveEvent =
  | { type: "fee-snapshot"; snapshot: FeeSnapshot }
  | { type: "block-added"; block: BlockSummary }
  | { type: "block-status-changed"; change: FinalityChange };

export interface LiveEventPublisher {
  publish(event: LiveEvent): void;
}
```

---

### Task 0: Integrar a base de backend na branch do Live Monitor

**Files:**

- Merge: `origin/codex/backend-bootstrap`
- Verify: `package.json`
- Verify: `apps/api/src/app.ts`
- Verify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Confirmar que a worktree está limpa e atualizar referências remotas**

Run:

```bash
rtk git status --short --branch
rtk git fetch origin
rtk git merge-base --is-ancestor origin/codex/backend-bootstrap HEAD
```

Expected: a branch é `codex/live-monitor-contract`, não existem alterações locais e o último comando pode retornar `1` enquanto o bootstrap ainda não estiver integrado.

- [ ] **Step 2: Integrar o bootstrap exatamente uma vez**

Se o teste de ancestralidade do passo anterior retornou `1`:

```bash
rtk git merge --no-ff origin/codex/backend-bootstrap -m "chore: integrate backend bootstrap"
```

Se ele retornou `0`, não criar merge vazio.

- [ ] **Step 3: Instalar dependências e provar o baseline**

Run:

```bash
rtk npm install
rtk npm test --workspace @alphractal/api -- --pool=forks --poolOptions.forks.maxForks=2
rtk npm run typecheck
rtk npm run lint
```

Expected: testes do `/health` e configuração passam; typecheck e lint encerram com código 0.

- [ ] **Step 4: Enviar o checkpoint**

Run:

```bash
rtk git push
```

Expected: `origin/codex/live-monitor-contract` contém tanto os documentos aprovados quanto o bootstrap.

---

### Task 1: Tornar o contrato da API executável

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `packages/contracts/package.json`
- Modify: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/vitest.config.ts`
- Create: `packages/contracts/src/common.ts`
- Create: `packages/contracts/src/errors.ts`
- Create: `packages/contracts/src/fees.ts`
- Create: `packages/contracts/src/blocks.ts`
- Create: `packages/contracts/src/live.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/contracts/test/contracts.test.ts`

- [ ] **Step 1: Escrever testes de contrato que falham**

Os testes devem importar somente de `../src/index.js` e cobrir:

- `FeeSnapshotSchema` em estados `current` e `last-known`;
- as três variantes de `estimatedTransferCost`;
- as três variantes de `trend24h`;
- todos os níveis e reasons de confiança;
- `BlockSummarySchema` e os três tipos de evento SSE;
- envelopes unitário, de lista, paginação e erro;
- rejeição de `NaN`, `Infinity`, negativos, datas sem `Z`, hashes incorretos, números de bloco não decimais e uniões inconsistentes;
- refinamento `last-known -> confidence.unavailable`;
- refinamento `hasMore === (nextCursor !== null)`.

Use uma fixture válida completa, clonada e alterada por caso:

```ts
const feeSnapshot = {
  timestamp: "2026-08-30T18:42:15.123Z",
  metadata: { network: "ethereum-mainnet" },
  recommendationState: "current",
  recommendedMaxFeeGwei: 32.4,
  recommendedPriorityFeeGwei: 1.8,
  baseFeeGwei: 28.7,
  effectiveGasPriceGwei: 30.5,
  estimatedTransferCost: {
    status: "fresh",
    transactionType: "native-eth-transfer",
    gasUnits: 21000,
    maxCostEth: 0.0006804,
    ethUsd: 3420.25,
    maxCostUsd: 2.327,
    priceUpdatedAt: "2026-08-30T18:42:15.002Z",
  },
  trend24h: {
    status: "available",
    windowMinutes: 5,
    percentChange: 8.4,
    currentMedianMaxFeeGwei: 32.1,
    previousMedianMaxFeeGwei: 29.61,
  },
  confidence: {
    level: "high",
    reasons: ["fresh-data", "stable-fees", "strong-sample"],
  },
  sampleSize: 2847,
  dataAgeMs: 320,
  sources: { mempool: "alchemy", ethereum: "alchemy", price: "coinbase" },
  sourceUpdatedAt: {
    mempool: "2026-08-30T18:42:14.810Z",
    ethereum: "2026-08-30T18:42:13.900Z",
    price: "2026-08-30T18:42:15.002Z",
  },
  status: {
    mempool: "fresh",
    ethereum: "fresh",
    price: "fresh",
    persistence: "available",
  },
} as const;
```

- [ ] **Step 2: Rodar o teste e confirmar a falha esperada**

Run:

```bash
rtk npm test --workspace @alphractal/contracts -- contracts.test.ts
```

Expected: FAIL porque os schemas e/ou o script de teste ainda não existem.

- [ ] **Step 3: Implementar os schemas e tipos inferidos**

Instalar `zod` e `vitest` no workspace de contratos. Usar os seguintes primitivos em `common.ts`:

```ts
import { z } from "zod";

export const utcDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid UTC timestamp");

export const nonNegativeFiniteSchema = z.number().finite().nonnegative();
export const percentageSchema = z.number().finite().min(0).max(100);
export const signedPercentageSchema = z.number().finite();
export const decimalIntegerStringSchema = z.string().regex(/^(0|[1-9]\d*)$/);
export const blockHashSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
export const networkSchema = z.literal("ethereum-mainnet");
```

Construir uniões discriminadas com `z.discriminatedUnion`. Exportar schemas e tipos inferidos:

```ts
export type FeeSnapshotDto = z.infer<typeof FeeSnapshotSchema>;
export type BlockSummaryDto = z.infer<typeof BlockSummarySchema>;
export type LiveEventDto = z.infer<typeof LiveEventSchema>;
export type ApiErrorDto = z.infer<typeof ApiErrorSchema>;
```

Em `FeeSnapshotSchema`, adicionar `superRefine` para exigir confiança `unavailable` quando `recommendationState` for `last-known`. Em `FeeHistoryResponseSchema`, refinar a coerência entre `hasMore` e `nextCursor`.

- [ ] **Step 4: Rodar testes e verificação estática**

Run:

```bash
rtk npm test --workspace @alphractal/contracts -- contracts.test.ts
rtk npm run typecheck --workspace @alphractal/contracts
rtk npm run lint --workspace @alphractal/contracts
```

Expected: PASS e nenhum erro TypeScript/ESLint.

- [ ] **Step 5: Commitar e enviar**

```bash
rtk git add package.json package-lock.json packages/contracts
rtk git commit -m "feat(contracts): define live monitor schemas"
rtk git push
```

---

### Task 2: Implementar unidades, estatística e estimador de taxas

**Files:**

- Create: `apps/api/src/domain/shared/clock.ts`
- Create: `apps/api/src/domain/shared/statistics.ts`
- Create: `apps/api/src/domain/shared/units.ts`
- Create: `apps/api/src/domain/fees/models.ts`
- Create: `apps/api/src/domain/fees/ports.ts`
- Create: `apps/api/src/domain/fees/fee-estimator.ts`
- Create: `apps/api/test/domain/statistics.test.ts`
- Create: `apps/api/test/domain/fee-estimator.test.ts`

- [ ] **Step 1: Escrever testes de estatística e normalização**

Cobrir:

- mediana vazia retorna `null`;
- mediana ímpar retorna o valor central;
- mediana par usa a média aritmética exata de dois `bigint`, conservando o numerador e divisor quando necessário;
- nearest-rank P25, P60, P75 e P90 usa índice `ceil(p × n) - 1`;
- EIP-1559 usa `max(0, min(priority, maxFee - baseFee))`;
- legado usa `max(0, gasPrice - baseFee)`;
- amostras negativas, incompletas ou inviáveis são descartadas.

A política é um único objeto tipado:

```ts
export const DEFAULT_FEE_POLICY = {
  mempoolWindowMs: 30_000,
  feeHistoryBlockCount: 10,
  rewardPercentile: 0.6,
  pendingPercentile: 0.6,
  baseFeeHeadroomBasisPoints: 1_125,
} as const;
```

- [ ] **Step 2: Confirmar RED**

Run:

```bash
rtk npm test --workspace @alphractal/api -- test/domain/statistics.test.ts test/domain/fee-estimator.test.ts
```

Expected: FAIL por módulos ausentes.

- [ ] **Step 3: Implementar funções puras**

O estimador recebe somente evidência normalizada:

```ts
export interface EstimateFeesInput {
  evidence: FeeEvidence;
  pendingBids: PendingBid[];
  now: Date;
  policy?: FeePolicy;
}

export interface FeeEstimate {
  latestBaseFeeWei: bigint;
  projectedNextBaseFeeWei: bigint;
  recommendedPriorityFeeWei: bigint;
  recommendedMaxFeeWei: bigint;
  effectiveGasPriceWei: bigint;
  pendingEffectiveTipsWei: bigint[];
}

export function estimateFees(input: EstimateFeesInput): FeeEstimate | null;
```

Implementar:

```text
historicalPriority = median(valid historical P60 rewards)
pendingPriority = nearestRank(valid pending tips, 0.60)
recommendedPriority = max(pendingPriority, historicalPriority)
baseFeeReference = max(latestBaseFee, projectedNextBaseFee)
recommendedMax = ceil(baseFeeReference × 1125 / 1000) + recommendedPriority
effectiveGasPrice = latestBaseFee + recommendedPriority
```

Exigir pelo menos uma Base Fee atual e uma amostra pendente válida. `ceil` no headroom impede truncar o teto para baixo.

- [ ] **Step 4: Provar todos os limites**

Adicionar tabelas de casos para zero, um item, percentis exatos, transação cujo `maxFee` está abaixo da Base Fee, candidato histórico ausente e projeção maior/menor que a Base Fee atual.

Run:

```bash
rtk npm test --workspace @alphractal/api -- test/domain/statistics.test.ts test/domain/fee-estimator.test.ts
rtk npm run typecheck --workspace @alphractal/api
rtk npm run lint --workspace @alphractal/api
```

Expected: PASS.

- [ ] **Step 5: Commitar e enviar**

```bash
rtk git add apps/api/src/domain apps/api/test/domain
rtk git commit -m "feat(api): implement fee estimator domain"
rtk git push
```

---

### Task 3: Implementar custo, tendência e confiança

**Files:**

- Create: `apps/api/src/domain/fees/transfer-cost.ts`
- Create: `apps/api/src/domain/fees/fee-trend.ts`
- Create: `apps/api/src/domain/fees/fee-confidence.ts`
- Modify: `apps/api/src/domain/fees/models.ts`
- Create: `apps/api/test/domain/fee-snapshot-values.test.ts`

- [ ] **Step 1: Escrever testes que falham para as três regras**

Cobrir:

- custo máximo ETH para 21.000 gas sem preço;
- custo USD com preço fresh e stale;
- preço nunca recebido produz `unavailable` e mantém custo ETH;
- medianas das janelas `[now-5m, now]` e `[now-24h-5m, now-24h]`;
- variação positiva, negativa, anterior zero, janela vazia e repositório indisponível;
- todos os limites de idade `10_000`, `20_000` e `30_000` ms;
- sample size `0`, `99`, `100`, `499` e `500`;
- relative IQR `0.5`, `1.0` e mediana zero;
- pior dimensão determina o nível;
- Coinbase e MongoDB não alteram confiança.

- [ ] **Step 2: Confirmar RED**

Run:

```bash
rtk npm test --workspace @alphractal/api -- test/domain/fee-snapshot-values.test.ts
```

Expected: FAIL por funções ausentes.

- [ ] **Step 3: Implementar as APIs puras**

```ts
export const NATIVE_TRANSFER_GAS_UNITS = 21_000n;

export function calculateTransferCost(input: {
  recommendedMaxFeeWei: bigint;
  quote: PriceQuote | null;
  now: Date;
}): EstimatedTransferCost;

export async function calculateTrend24h(input: {
  now: Date;
  repository: Pick<FeeSnapshotRepository, "findWindow">;
}): Promise<FeeTrend>;

export function evaluateFeeConfidence(input: {
  now: Date;
  mempoolUpdatedAt: Date | null;
  ethereumUpdatedAt: Date | null;
  effectiveTipsWei: bigint[];
  policy?: ConfidencePolicy;
}): FeeConfidence;
```

Usar uma representação racional para `maxCostEth` e `maxCostUsd` até o serializer. `calculateTrend24h` captura apenas erro de disponibilidade conhecido e retorna `unavailable/history-unavailable`; erro de programação continua propagando.

Reasons devem sempre incluir exatamente uma razão de atualidade, uma de estabilidade e uma de amostra, em ordem estável.

- [ ] **Step 4: Rodar testes e estática**

```bash
rtk npm test --workspace @alphractal/api -- test/domain/fee-snapshot-values.test.ts
rtk npm run typecheck --workspace @alphractal/api
rtk npm run lint --workspace @alphractal/api
```

Expected: PASS.

- [ ] **Step 5: Commitar e enviar**

```bash
rtk git add apps/api/src/domain/fees apps/api/test/domain/fee-snapshot-values.test.ts
rtk git commit -m "feat(api): add fee confidence trend and transfer cost"
rtk git push
```

---

### Task 4: Implementar as regras puras de blocos

**Files:**

- Create: `apps/api/src/domain/blocks/models.ts`
- Create: `apps/api/src/domain/blocks/ports.ts`
- Create: `apps/api/src/domain/blocks/block-analyzer.ts`
- Create: `apps/api/src/domain/blocks/block-fee-level.ts`
- Create: `apps/api/src/domain/blocks/block-finality.ts`
- Create: `apps/api/src/domain/blocks/recent-block-window.ts`
- Create: `apps/api/test/domain/block-rules.test.ts`

- [ ] **Step 1: Escrever testes de domínio**

Cobrir:

- tips EIP-1559 e legadas;
- mediana ímpar, par e bloco sem tips válidas;
- `effectiveGasPrice = baseFee + medianTip`;
- `gasUsed / gasLimit × 100` e rejeição de `gasLimit = 0`;
- `feeLevel unavailable` com 19 comparações;
- limites exatos P25/P75/P90 com 20 ou mais comparações;
- finality `latest`, `safe` e `finalized` por número e hash canônico;
- janela recente limitada a 20, ordenada por número decrescente;
- mesmo número e hash novo substitui o canônico anterior;
- hash repetido é idempotente.

- [ ] **Step 2: Confirmar RED**

Run:

```bash
rtk npm test --workspace @alphractal/api -- test/domain/block-rules.test.ts
```

Expected: FAIL por módulos ausentes.

- [ ] **Step 3: Implementar modelos e regras**

```ts
export interface NormalizedBlock {
  number: bigint;
  hash: `0x${string}`;
  timestamp: Date;
  baseFeePerGasWei: bigint | null;
  gasUsed: bigint;
  gasLimit: bigint;
  transactions: NormalizedBlockTransaction[];
}

export interface BlockSummary {
  network: "ethereum-mainnet";
  number: bigint;
  hash: `0x${string}`;
  timestamp: Date;
  finality: "latest" | "safe" | "finalized";
  feeLevel: "low" | "normal" | "elevated" | "high" | "unavailable";
  baseFeeWei: bigint;
  medianPriorityFeeWei: Rational;
  effectiveGasPriceWei: Rational;
  gasUsed: bigint;
  gasLimit: bigint;
  utilization: Rational;
  transactionCount: number;
  provider: "alchemy";
}
```

`BlockFinalityResolver` deve exigir que um número só avance quando a referência canônica disponível for compatível; nunca promover por número usando um hash sabidamente divergente.

`RecentBlockWindow.upsert` retorna `{ current, replaced }` para permitir persistência e emissão do reorg sem lógica duplicada.

- [ ] **Step 4: Rodar testes e estática**

```bash
rtk npm test --workspace @alphractal/api -- test/domain/block-rules.test.ts
rtk npm run typecheck --workspace @alphractal/api
rtk npm run lint --workspace @alphractal/api
```

Expected: PASS.

- [ ] **Step 5: Commitar e enviar**

```bash
rtk git add apps/api/src/domain/blocks apps/api/test/domain/block-rules.test.ts
rtk git commit -m "feat(api): implement block analysis domain"
rtk git push
```

---

### Task 5: Implementar MongoDB e degradação de persistência

**Files:**

- Create: `apps/api/src/infrastructure/mongodb/mongo-client.ts`
- Create: `apps/api/src/infrastructure/mongodb/mongo-fee-snapshot-repository.ts`
- Create: `apps/api/src/infrastructure/mongodb/mongo-observed-block-repository.ts`
- Create: `apps/api/test/infrastructure/mongo-repositories.test.ts`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Escrever testes de repositório**

Usar um MongoDB de teste descartável disponibilizado por `docker-compose.yml`, com nome de banco exclusivo por execução. Não mockar o driver nos testes que verificam índices.

Cobrir:

- criação idempotente da time-series `fee_snapshots` com `timestamp`, `metadata` e retenção de 30 dias;
- inserção apenas de snapshots `current`;
- consulta das duas janelas de tendência;
- paginação crescente com cursor opaco e limite;
- cursor incompatível com `from/to/limit` retorna erro de query;
- criação de `observed_blocks` com índices por hash, timestamp e parcial único para canônico por número;
- reorg marca o documento anterior `canonical: false` antes do novo upsert;
- consultas ignoram não canônicos;
- falha do Mongo muda `isAvailable()` para `false` e gera erro de disponibilidade estável.

- [ ] **Step 2: Confirmar RED**

Run:

```bash
rtk docker compose up -d mongodb
rtk npm test --workspace @alphractal/api -- test/infrastructure/mongo-repositories.test.ts
```

Expected: FAIL por adaptadores ausentes.

- [ ] **Step 3: Implementar conexão, coleções e índices**

`MongoClientManager` deve expor `connect`, `close`, `database` e estado de saúde, usando timeout limitado. O cursor deve conter versão e identidade da consulta:

```ts
interface FeeHistoryCursorV1 {
  v: 1;
  from: string;
  to: string;
  limit: number;
  afterTimestamp: string;
  afterId: string;
}
```

Codificar o cursor com Base64URL e validar todo o conteúdo antes de criar filtros MongoDB. Nunca aceitar operadores do cliente.

Criar os índices:

```ts
await observedBlocks.createIndexes([
  { key: { network: 1, hash: 1 }, unique: true, name: "network_hash_unique" },
  {
    key: { network: 1, number: -1 },
    unique: true,
    partialFilterExpression: { canonical: true },
    name: "canonical_network_number_unique",
  },
  { key: { network: 1, timestamp: -1 }, name: "canonical_window" },
  { key: { timestamp: 1 }, expireAfterSeconds: 2_592_000, name: "ttl_30_days" },
]);
```

- [ ] **Step 4: Rodar testes e estática**

```bash
rtk npm test --workspace @alphractal/api -- test/infrastructure/mongo-repositories.test.ts
rtk npm run typecheck --workspace @alphractal/api
rtk npm run lint --workspace @alphractal/api
```

Expected: PASS. Ao final, manter o container somente se a próxima tarefa precisar dele; caso contrário:

```bash
rtk docker compose stop mongodb
```

- [ ] **Step 5: Commitar e enviar**

```bash
rtk git add docker-compose.yml apps/api/src/infrastructure/mongodb apps/api/test/infrastructure/mongo-repositories.test.ts
rtk git commit -m "feat(api): persist live monitor data in mongodb"
rtk git push
```

---

### Task 6: Implementar adaptadores Alchemy e Coinbase

**Files:**

- Create: `apps/api/src/infrastructure/alchemy/reconnecting-websocket.ts`
- Create: `apps/api/src/infrastructure/alchemy/alchemy-mempool-client.ts`
- Create: `apps/api/src/infrastructure/alchemy/alchemy-fee-client.ts`
- Create: `apps/api/src/infrastructure/alchemy/alchemy-block-client.ts`
- Create: `apps/api/src/infrastructure/coinbase/coinbase-price-client.ts`
- Create: `apps/api/test/infrastructure/alchemy-clients.test.ts`
- Create: `apps/api/test/infrastructure/coinbase-price-client.test.ts`

- [ ] **Step 1: Escrever testes com servidores HTTP/WebSocket locais**

Cobrir sem rede externa:

- subscrição `alchemy_pendingTransactions` com `hashesOnly: false`;
- janela de 30 segundos remove entradas antigas e deduplica por hash;
- parsing EIP-1559/legacy descarta payload inválido;
- `eth_feeHistory` solicita 10 blocos e percentil 60;
- penúltima Base Fee é a atual e última é a projeção seguinte;
- busca de bloco aceita número/hash normalizado e pede transações completas;
- leitura de heads `safe`/`finalized`;
- Coinbase assina `ticker` de `ETH-USD` e rejeita preço inválido;
- heartbeat, fechamento, backoff exponencial com jitter injetável e resubscrição;
- timestamp da fonte muda somente após mensagem válida.

- [ ] **Step 2: Confirmar RED**

```bash
rtk npm test --workspace @alphractal/api -- test/infrastructure/alchemy-clients.test.ts test/infrastructure/coinbase-price-client.test.ts
```

Expected: FAIL por clientes ausentes.

- [ ] **Step 3: Implementar os adaptadores**

`AlchemyFeeClient` usa `viem`/JSON-RPC com request equivalente a:

```json
{
  "method": "eth_feeHistory",
  "params": ["0xa", "latest", [60]]
}
```

`AlchemyMempoolClient` mantém somente `PendingBid` normalizado; nunca conserva nem registra o payload completo. `AlchemyBlockClient` converte timestamps em segundos para `Date` e rejeita um bloco sem número/hash/gas válido como dado malformado do provedor.

`ReconnectingWebSocket` deve ter estados `connecting/open/backoff/stopped`, ping/timeout e backoff limitado com jitter. `stop()` cancela timers e impede reconexão posterior.

- [ ] **Step 4: Rodar testes e estática**

```bash
rtk npm test --workspace @alphractal/api -- test/infrastructure/alchemy-clients.test.ts test/infrastructure/coinbase-price-client.test.ts
rtk npm run typecheck --workspace @alphractal/api
rtk npm run lint --workspace @alphractal/api
```

Expected: PASS sem acessar Alchemy ou Coinbase reais.

- [ ] **Step 5: Commitar e enviar**

```bash
rtk git add apps/api/src/infrastructure/alchemy apps/api/src/infrastructure/coinbase apps/api/test/infrastructure
rtk git commit -m "feat(api): connect alchemy and coinbase sources"
rtk git push
```

---

### Task 7: Orquestrar snapshots e o monitor de cinco segundos

**Files:**

- Create: `apps/api/src/application/common/errors.ts`
- Create: `apps/api/src/application/common/live-event-publisher.ts`
- Create: `apps/api/src/application/fees/calculate-fee-snapshot.ts`
- Create: `apps/api/src/application/fees/fee-monitor.ts`
- Create: `apps/api/src/application/fees/get-current-fee-snapshot.ts`
- Create: `apps/api/src/application/fees/get-fee-history.ts`
- Create: `apps/api/test/helpers/fakes.ts`
- Create: `apps/api/test/helpers/fixtures.ts`
- Create: `apps/api/test/application/fee-monitor.test.ts`

- [ ] **Step 1: Escrever testes dos casos de uso**

Cobrir:

- cálculo válido produz `current`, persiste uma vez, atualiza cache e publica;
- tick de 5 segundos e chegada de bloco durante cálculo coalescem em apenas uma execução adicional;
- cinco gatilhos simultâneos nunca executam o cálculo em paralelo;
- falta de evidência mantém último snapshot como `last-known`, aumenta `dataAgeMs`, torna confiança indisponível e não persiste;
- sem snapshot anterior, falta de evidência deixa `/current` indisponível;
- falha de preço mantém fees/confidence e muda somente custo/status de preço;
- falha de tendência produz `unavailable/history-unavailable`;
- falha de insert muda persistência para `degraded`, mas ainda publica;
- histórico indisponível lança `HISTORY_UNAVAILABLE`.

- [ ] **Step 2: Confirmar RED**

```bash
rtk npm test --workspace @alphractal/api -- test/application/fee-monitor.test.ts
```

Expected: FAIL por casos de uso ausentes.

- [ ] **Step 3: Implementar estado em memória e coalescência**

`FeeMonitor` deve seguir esta máquina de execução:

```ts
async trigger(): Promise<void> {
  if (this.running) {
    this.pending = true;
    return;
  }

  this.running = true;
  try {
    do {
      this.pending = false;
      await this.calculate.execute();
    } while (this.pending);
  } finally {
    this.running = false;
  }
}
```

`CalculateFeeSnapshot` nunca transforma erro inesperado em last-known silencioso. Apenas indisponibilidade tipada das fontes segue o caminho degradado.

`GetCurrentFeeSnapshot` lê primeiro o cache do processo e usa o último persistido apenas no bootstrap. `GetFeeHistory` sempre depende do repositório.

- [ ] **Step 4: Rodar testes e estática**

```bash
rtk npm test --workspace @alphractal/api -- test/application/fee-monitor.test.ts
rtk npm run typecheck --workspace @alphractal/api
rtk npm run lint --workspace @alphractal/api
```

Expected: PASS.

- [ ] **Step 5: Commitar e enviar**

```bash
rtk git add apps/api/src/application/common apps/api/src/application/fees apps/api/test/helpers apps/api/test/application/fee-monitor.test.ts
rtk git commit -m "feat(api): orchestrate fee snapshots"
rtk git push
```

---

### Task 8: Orquestrar observação, bootstrap, pesquisa e finality de blocos

**Files:**

- Create: `apps/api/src/application/blocks/observe-block.ts`
- Create: `apps/api/src/application/blocks/prime-recent-blocks.ts`
- Create: `apps/api/src/application/blocks/get-recent-blocks.ts`
- Create: `apps/api/src/application/blocks/get-block-by-identifier.ts`
- Create: `apps/api/src/application/blocks/update-block-finality.ts`
- Create: `apps/api/test/application/block-use-cases.test.ts`

- [ ] **Step 1: Escrever testes dos casos de uso**

Cobrir:

- startup restaura canônicos persistidos e completa até 20 pela Alchemy;
- backfill entra do bloco mais antigo para o mais novo;
- observação consulta a janela anterior de uma hora, analisa, atualiza memória, persiste e publica;
- reorg marca o hash antigo como não canônico e publica `block-added` com o novo hash;
- chegada de bloco dispara exatamente um `FeeMonitor.trigger()`;
- atualização de finality publica somente transições reais;
- busca por número decimal ou hash não altera memória nem persiste;
- número anterior a `12965000` falha antes de chamar o provedor;
- bloco por hash sem Base Fee retorna `PRE_EIP1559_BLOCK_UNSUPPORTED`;
- bloco inexistente, provedor indisponível e cache recente vazio mapeiam para erros distintos.

- [ ] **Step 2: Confirmar RED**

```bash
rtk npm test --workspace @alphractal/api -- test/application/block-use-cases.test.ts
```

Expected: FAIL por casos de uso ausentes.

- [ ] **Step 3: Implementar o fluxo de blocos**

O parser do identificador deve ser uma função pura:

```ts
export type BlockIdentifier = bigint | `0x${string}`;

export function parseBlockIdentifier(value: string): BlockIdentifier {
  if (/^(0|[1-9]\d*)$/.test(value)) {
    const number = BigInt(value);
    if (number < 12_965_000n) throw new PreEip1559BlockUnsupportedError();
    return number;
  }

  if (/^0x[a-fA-F0-9]{64}$/.test(value)) return value as `0x${string}`;
  throw new InvalidBlockIdentifierError();
}
```

`PrimeRecentBlocks` tenta repositório primeiro. Se houver menos de 20 itens, busca os números faltantes a partir do head atual, sem duplicar hashes. Falha de Mongo não impede backfill; falha da Alchemy preserva o que já existir.

`UpdateBlockFinality` não rebaixa `finalized -> safe/latest` nem `safe -> latest`. Em erro ao obter heads, conserva estados anteriores e deixa a próxima observação tentar novamente.

- [ ] **Step 4: Rodar testes e estática**

```bash
rtk npm test --workspace @alphractal/api -- test/application/block-use-cases.test.ts
rtk npm run typecheck --workspace @alphractal/api
rtk npm run lint --workspace @alphractal/api
```

Expected: PASS.

- [ ] **Step 5: Commitar e enviar**

```bash
rtk git add apps/api/src/application/blocks apps/api/test/application/block-use-cases.test.ts
rtk git commit -m "feat(api): orchestrate live block observation"
rtk git push
```

---

### Task 9: Expor REST com serializers e erros estáveis

**Files:**

- Modify: `apps/api/package.json`
- Modify: `package-lock.json`
- Create: `apps/api/src/interfaces/http/request-id-middleware.ts`
- Create: `apps/api/src/interfaces/http/live-serializers.ts`
- Create: `apps/api/src/interfaces/http/fee-routes.ts`
- Create: `apps/api/src/interfaces/http/block-routes.ts`
- Create: `apps/api/src/interfaces/http/error-middleware.ts`
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/test/interfaces/live-http.test.ts`

- [ ] **Step 1: Escrever testes de integração HTTP**

Criar `createApp(dependencies)` com fakes, sem rede e sem Mongo. Cobrir:

- `GET /api/v1/fees/current` com 200 e `SNAPSHOT_UNAVAILABLE`/503;
- `GET /api/v1/fees/history` com query válida, padrão `limit=1000`, vazio, cursor, `INVALID_QUERY`, `INVALID_TIME_RANGE` e `HISTORY_UNAVAILABLE`/503;
- `GET /api/v1/blocks/recent` com até 20, ordem decrescente e `BLOCKS_UNAVAILABLE`/503;
- `GET /api/v1/blocks/:numberOrHash` com número, hash, `INVALID_BLOCK_IDENTIFIER`, `BLOCK_NOT_FOUND`, `PRE_EIP1559_BLOCK_UNSUPPORTED` e `ETHEREUM_PROVIDER_UNAVAILABLE`;
- `GET /health` preservado;
- rota inexistente retorna `ROUTE_NOT_FOUND` e falha inesperada retorna `INTERNAL_ERROR`;
- todas as respostas REST incluem `X-Request-Id`, `Cache-Control: no-store` e content type correto;
- respostas de sucesso parseiam com `packages/contracts`;
- erro nunca contém stack, credencial ou mensagem bruta do fake provider;
- CORS aceita somente origem permitida;
- body JSON acima do limite retorna erro controlado.

- [ ] **Step 2: Confirmar RED**

```bash
rtk npm test --workspace @alphractal/api -- test/interfaces/live-http.test.ts
```

Expected: FAIL por rotas e serializers ausentes.

- [ ] **Step 3: Implementar serializers únicos para REST e SSE**

`live-serializers.ts` deve ser o único lugar que:

- converte wei/racionais para números Gwei/ETH/USD;
- converte `bigint` de blocos/gas em string;
- arredonda metade para longe de zero;
- constrói `https://etherscan.io/block/<decimal-number>`;
- valida a saída com os schemas de `@alphractal/contracts` em teste.

As dependências do app:

```ts
export interface ApiDependencies {
  corsOrigins: ReadonlySet<string>;
  getCurrentFeeSnapshot: GetCurrentFeeSnapshot;
  getFeeHistory: GetFeeHistory;
  getRecentBlocks: GetRecentBlocks;
  getBlockByIdentifier: GetBlockByIdentifier;
  liveSseHub: LiveSseHub;
}

export function createApp(dependencies: ApiDependencies): Express;
```

Montar `/api/v1/blocks/recent` antes de `/api/v1/blocks/:numberOrHash`. Validar query/params antes de chamar casos de uso.

- [ ] **Step 4: Rodar testes e estática**

```bash
rtk npm test --workspace @alphractal/api -- test/app.test.ts test/interfaces/live-http.test.ts
rtk npm run typecheck
rtk npm run lint
```

Expected: PASS.

- [ ] **Step 5: Commitar e enviar**

```bash
rtk git add apps/api/package.json package-lock.json apps/api/src/app.ts apps/api/src/interfaces/http apps/api/test/interfaces/live-http.test.ts
rtk git commit -m "feat(api): expose live monitor rest api"
rtk git push
```

---

### Task 10: Implementar o único stream SSE

**Files:**

- Create: `apps/api/src/interfaces/sse/live-sse-hub.ts`
- Modify: `apps/api/src/interfaces/http/live-serializers.ts`
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/test/interfaces/live-sse.test.ts`

- [ ] **Step 1: Escrever testes SSE**

Usar timers falsos e resposta controlada para cobrir:

- headers `text/event-stream`, `no-cache, no-transform` e `keep-alive`;
- primeiro frame `retry: 3000`;
- conexão recebe último snapshot e bloco mais recente quando presentes;
- IDs e nomes exatos de `fee-snapshot`, `block-added` e `block-status-changed`;
- payload completo usa os mesmos serializers REST;
- heartbeat como comentário a cada 15 segundos;
- `Last-Event-ID` não causa replay;
- fechamento remove o cliente e limpa estado;
- `write() === false` enfileira até o limite;
- cliente é desconectado ao exceder 100 eventos ou 256 KiB, o que ocorrer primeiro;
- evento lento em um cliente não bloqueia os demais;
- falhas recuperáveis de fonte não fecham o stream.

- [ ] **Step 2: Confirmar RED**

```bash
rtk npm test --workspace @alphractal/api -- test/interfaces/live-sse.test.ts
```

Expected: FAIL por hub ausente.

- [ ] **Step 3: Implementar hub e rota**

Formato:

```ts
interface SseClient {
  response: Response;
  queue: string[];
  queuedBytes: number;
  blocked: boolean;
}

const MAX_QUEUED_EVENTS = 100;
const MAX_QUEUED_BYTES = 256 * 1024;
const HEARTBEAT_MS = 15_000;
const RETRY_MS = 3_000;
```

Ao receber `drain`, esvaziar em ordem até `write` voltar a bloquear. Ao estourar qualquer limite, terminar somente essa resposta. Um timer único do hub envia heartbeat a todos; não criar um timer por evento.

IDs:

```text
fee:<timestamp>
block:<number>:<hash>
block-status:<number>:<finality>
```

- [ ] **Step 4: Rodar testes e estática**

```bash
rtk npm test --workspace @alphractal/api -- test/interfaces/live-sse.test.ts test/interfaces/live-http.test.ts
rtk npm run typecheck --workspace @alphractal/api
rtk npm run lint --workspace @alphractal/api
```

Expected: PASS e nenhuma rota `/api/v1/fees/stream`.

- [ ] **Step 5: Commitar e enviar**

```bash
rtk git add apps/api/src/interfaces/sse apps/api/src/interfaces/http/live-serializers.ts apps/api/src/app.ts apps/api/test/interfaces/live-sse.test.ts
rtk git commit -m "feat(api): publish unified live sse stream"
rtk git push
```

---

### Task 11: Montar o runtime, configuração e ciclo de vida

**Files:**

- Modify: `.env.example`
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/src/server.ts`
- Create: `apps/api/src/runtime.ts`
- Modify: `apps/api/test/config/env.test.ts`
- Create: `apps/api/test/runtime/resilience.test.ts`

- [ ] **Step 1: Escrever testes de configuração e runtime**

Cobrir:

- URLs HTTP/WS da Alchemy obrigatórias e HTTPS/WSS;
- URL Coinbase padrão e substituível;
- `CORS_ORIGINS` obrigatória, separada por vírgula, sem wildcard;
- Mongo opcional permite modo degradado;
- timeouts e cadências possuem defaults aprovados;
- URLs com credenciais são redigidas no logger;
- startup inicia fontes, tenta Mongo, restaura snapshot/blocos, abre observação e agenda fees;
- Mongo indisponível não impede current, blocos em memória ou SSE;
- Mongo que volta a responder é reconectado, restaura `available` e retoma novas persistências sem reiniciar o processo;
- Coinbase indisponível mantém fees e marca custo/preço;
- Alchemy indisponível preserva last-known e faz reconnect;
- `SIGINT`/`SIGTERM` para intervalos, websockets, SSE, HTTP e Mongo uma única vez.

Configuração esperada:

```ts
interface AppConfig {
  PORT: number;
  ALCHEMY_HTTP_URL: string;
  ALCHEMY_WS_URL: string;
  COINBASE_WS_URL: string;
  MONGODB_URI?: string;
  CORS_ORIGINS: string[];
  FEE_INTERVAL_MS: 5000;
  SSE_HEARTBEAT_MS: 15000;
  PROVIDER_REQUEST_TIMEOUT_MS: number;
}
```

- [ ] **Step 2: Confirmar RED**

```bash
rtk npm test --workspace @alphractal/api -- test/config/env.test.ts test/runtime/resilience.test.ts
```

Expected: FAIL porque o container/runtime ainda não existe.

- [ ] **Step 3: Implementar composition root**

`createRuntime(config)` instancia adaptadores concretos e retorna:

```ts
export interface Runtime {
  app: Express;
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

Ordem de startup:

1. tentar conectar Mongo e inicializar índices, mantendo reconexão com backoff quando necessário;
2. restaurar último snapshot e blocos canônicos quando disponível;
3. iniciar Alchemy fee/mempool/block e Coinbase;
4. completar a janela recente;
5. executar um trigger inicial de fees;
6. iniciar intervalo de 5 segundos;
7. começar a aceitar HTTP.

Se Mongo falhar, registrar erro redigido e continuar. Se Alchemy ainda não estiver pronta, HTTP inicia para `/health` e expõe indisponibilidade tipada nas rotas de domínio; os WebSockets continuam reconectando.

`server.ts` deve conter somente carregamento de env, criação do runtime, `start`, `listen` e shutdown idempotente.

- [ ] **Step 4: Rodar suíte focada e verificação estática**

```bash
rtk npm test --workspace @alphractal/api -- test/config/env.test.ts test/runtime/resilience.test.ts
rtk npm run typecheck
rtk npm run lint
rtk npm run format:check
```

Expected: PASS.

- [ ] **Step 5: Commitar e enviar**

```bash
rtk git add .env.example apps/api/src/config apps/api/src/runtime.ts apps/api/src/server.ts apps/api/test/config apps/api/test/runtime
rtk git commit -m "feat(api): compose resilient live monitor runtime"
rtk git push
```

---

### Task 12: Verificação integrada e aceite

**Files:**

- Modify only if a defect is found: files introduced in Tasks 1–11
- Update if behavior changed: `docs/api/fees-contract.md`
- Update if behavior changed: `docs/superpowers/specs/2026-08-30-live-monitor-backend-design.md`

- [ ] **Step 1: Executar todos os testes com limite de memória**

Primeiro verificar memória:

```bash
rtk free -h
```

Depois, sem executar outra suíte pesada em paralelo:

```bash
rtk npm test --workspace @alphractal/contracts -- --pool=forks --poolOptions.forks.maxForks=2
rtk npm test --workspace @alphractal/api -- --pool=forks --poolOptions.forks.maxForks=2
```

Expected: todas as suítes PASS, sem rede externa.

- [ ] **Step 2: Executar gates estáticos**

```bash
rtk npm run typecheck
rtk npm run lint
rtk npm run format:check
```

Expected: todos encerram com código 0.

- [ ] **Step 3: Fazer smoke test local controlado**

Com credenciais locais válidas e Mongo iniciado:

```bash
rtk docker compose up -d mongodb
rtk npm run dev:api
```

Em outro terminal:

```bash
rtk curl --fail --silent http://localhost:3001/health
rtk curl --silent --show-error http://localhost:3001/api/v1/fees/current
rtk curl --silent --show-error http://localhost:3001/api/v1/blocks/recent
rtk curl --no-buffer --max-time 20 http://localhost:3001/api/v1/live/stream
```

Expected:

- health retorna `{"status":"ok"}`;
- fees e blocos retornam envelopes do contrato ou indisponibilidade tipada durante aquecimento;
- SSE anuncia `retry: 3000`, entrega estado disponível e pelo menos um heartbeat;
- nenhuma credencial aparece nos logs.

Parar processos de desenvolvimento e:

```bash
rtk docker compose stop mongodb
```

- [ ] **Step 4: Validar critérios de produto**

Confirmar manualmente:

- snapshot muda automaticamente sem botão de refresh;
- custo usa explicitamente 21.000 gas;
- tendência não inventa `0%` sem histórico;
- confiança não é afetada por Coinbase/Mongo;
- lista tem no máximo 20 blocos;
- pesquisa por número/hash não altera a lista;
- bloco pesquisado tem URL Etherscan;
- reorg substitui por identidade número+hash;
- reconexão SSE depende de novo bootstrap REST, não de replay.

- [ ] **Step 5: Aplicar correções com novos testes, se necessário**

Para cada defeito, primeiro adicionar um teste que reproduz a falha, executar o teste em RED, corrigir minimamente e repetir os gates. Não alterar contrato silenciosamente.

- [ ] **Step 6: Commit final e push**

Se houve correção:

```bash
rtk git add apps/api packages/contracts docs .env.example docker-compose.yml package.json package-lock.json
rtk git commit -m "fix(api): satisfy live monitor acceptance criteria"
```

Sempre:

```bash
rtk git status --short
rtk git push
rtk git log --oneline --decorate -12
```

Expected: worktree limpa e `origin/codex/live-monitor-contract` no mesmo commit local.

## Plan Self-Review

- [ ] Todos os endpoints, payloads, erros e eventos de `docs/api/fees-contract.md` possuem tarefa e teste correspondente.
- [ ] Todos os cálculos da spec possuem entradas, saídas, política e boundary tests explícitos.
- [ ] `FeeSnapshot`, `BlockSummary` e eventos possuem uma única conversão para DTO.
- [ ] Não há tipo JSON `number` para inteiros on-chain potencialmente acima do limite seguro.
- [ ] Nenhum adaptador aparece dentro do domínio.
- [ ] Falhas de Alchemy, Coinbase e Mongo têm comportamentos diferentes e testados.
- [ ] O plano não cria replay SSE, segundo provedor, análise interna, autenticação, múltiplas redes ou envio de transação.
- [ ] Não existem placeholders, `TODO` ou decisões de negócio deixadas para o implementador.
- [ ] Todos os comandos de teste respeitam o máximo de dois workers/forks.
- [ ] Cada tarefa possui checkpoint de commit e push.

## Execution Handoff

Plano completo e salvo em `docs/superpowers/plans/2026-08-30-live-monitor-backend.md`.

Escolha de execução:

1. **Subagent-Driven (recomendado):** executar uma tarefa por agente, com revisão entre tarefas, nesta sessão.
2. **Inline Execution:** executar sequencialmente nesta sessão, seguindo os mesmos checkpoints.
