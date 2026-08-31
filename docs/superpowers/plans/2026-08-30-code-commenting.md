# Code Commenting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Documentar em português todos os arquivos TypeScript mantidos pelo Live Monitor para que uma revisão explique o propósito de cada arquivo e de cada construção relevante sem alterar comportamento.

**Architecture:** A documentação acompanha as fronteiras existentes: contratos e domínio explicam regras puras; aplicação descreve orquestração e degradação; infraestrutura descreve adaptação de serviços externos; interfaces e runtime descrevem entrega HTTP/SSE e ciclo de vida. Os testes explicam a regra de produção que protegem.

**Tech Stack:** TypeScript 6, Zod 4, Express 5, Vitest 3, ESLint e Prettier.

## Global Constraints

- Escrever todos os comentários em português.
- Cobrir todos os arquivos `.ts` em `apps/api/src`, `apps/api/test`, `packages/contracts/src` e `packages/contracts/test`.
- Adicionar um cabeçalho de módulo a cada arquivo com responsabilidade, camada, colaboradores e resultado/falha relevante.
- Documentar cada classe, função, método, interface, type, constante e schema exportado.
- Documentar helpers privados quando eles representarem regra de negócio, conversão, validação, estado, ciclo de vida ou fronteira de erro.
- Explicar intenção e consequência; não repetir sintaxe óbvia.
- Não revelar URLs completas de provedores, credenciais, payloads pendentes completos ou outros dados sensíveis.
- Não alterar assinaturas, comportamento, contratos JSON, dependências ou testes.
- Prefixar comandos de terminal com `rtk` e executar Vitest com no máximo dois forks.
- Cada tarefa termina com Prettier, typecheck/lint ou testes relevantes, commit e push.

## Template de comentário

Usar este formato, adaptando o texto ao elemento documentado:

```ts
/**
 * Camada: domínio.
 *
 * Calcula a recomendação de taxa com valores em wei, preservando precisão
 * inteira e sem depender de RPC, banco de dados ou transporte HTTP.
 */

/**
 * Converte uma razão exata em número apenas na borda de saída.
 *
 * O arredondamento metade-para-fora-de-zero evita que o frontend receba uma
 * aproximação diferente da definida no contrato público.
 */
export function exemplo(valor: Rational): number {
  // implementação existente, sem mudança de comportamento
}
```

---

### Task 1: Documentar contratos, tipos e utilitários puros

**Files:**

- Modify: `packages/contracts/src/common.ts`
- Modify: `packages/contracts/src/errors.ts`
- Modify: `packages/contracts/src/fees.ts`
- Modify: `packages/contracts/src/blocks.ts`
- Modify: `packages/contracts/src/live.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/src/domain/shared/clock.ts`
- Modify: `apps/api/src/domain/shared/statistics.ts`
- Modify: `apps/api/src/domain/shared/units.ts`
- Modify: `apps/api/src/domain/fees/models.ts`
- Modify: `apps/api/src/domain/fees/ports.ts`
- Modify: `apps/api/src/domain/blocks/models.ts`
- Modify: `apps/api/src/domain/blocks/ports.ts`
- Modify: `apps/api/src/types/mongodb-connection-string-url.d.ts`

**Produces:** Schemas, tipos e cálculos básicos documentados como a base que não conhece Express, MongoDB, viem ou WebSocket.

- [ ] **Step 1: Inserir cabeçalhos de módulo e JSDoc nos contratos Zod**

Documentar a finalidade pública de cada schema, a regra que sua união discriminada protege e a razão de cada refinamento cruzado. Aplicar comentários, por exemplo:

```ts
/**
 * Contrato executável do snapshot entregue por REST e SSE.
 *
 * A validação centraliza compatibilidade entre backend e consumidores e exige
 * confiança indisponível quando a recomendação representa um valor last-known.
 */
export const FeeSnapshotSchema = z.object(/* estrutura existente */);
```

- [ ] **Step 2: Documentar modelos, portas e utilitários compartilhados**

Explicar que `Rational` preserva precisão, que `Clock` torna o tempo injetável e que as portas impedem que regras de domínio dependam de infraestrutura. Para cada helper estatístico ou aritmético, registrar a regra matemática e os limites de entrada.

- [ ] **Step 3: Verificar a documentação estática**

Run:

```bash
rtk npx prettier --write packages/contracts/src apps/api/src/domain/shared apps/api/src/domain/fees/models.ts apps/api/src/domain/fees/ports.ts apps/api/src/domain/blocks/models.ts apps/api/src/domain/blocks/ports.ts apps/api/src/types/mongodb-connection-string-url.d.ts
rtk npm run typecheck --workspace @alphractal/contracts
rtk npm run lint --workspace @alphractal/contracts
rtk npm run typecheck --workspace @alphractal/api
rtk npm run lint --workspace @alphractal/api
```

Expected: todos os comandos terminam com código `0`; nenhuma lógica muda.

- [ ] **Step 4: Commitar e enviar**

```bash
rtk git add packages/contracts/src apps/api/src/domain/shared apps/api/src/domain/fees/models.ts apps/api/src/domain/fees/ports.ts apps/api/src/domain/blocks/models.ts apps/api/src/domain/blocks/ports.ts apps/api/src/types/mongodb-connection-string-url.d.ts
rtk git commit -m "docs(code): explain contracts and domain foundations"
rtk git push
```

### Task 2: Documentar regras de domínio de taxas e blocos

**Files:**

- Modify: `apps/api/src/domain/fees/fee-estimator.ts`
- Modify: `apps/api/src/domain/fees/fee-confidence.ts`
- Modify: `apps/api/src/domain/fees/fee-trend.ts`
- Modify: `apps/api/src/domain/fees/transfer-cost.ts`
- Modify: `apps/api/src/domain/blocks/block-analyzer.ts`
- Modify: `apps/api/src/domain/blocks/block-fee-level.ts`
- Modify: `apps/api/src/domain/blocks/block-finality.ts`
- Modify: `apps/api/src/domain/blocks/recent-block-window.ts`

**Consumes:** Os modelos, portas, razões e estatísticas documentados na Task 1.

**Produces:** Regras de taxa, custo, confiança, tendência, análise de blocos, finality e reorg explicadas junto ao código puro.

- [ ] **Step 1: Documentar a política de taxa e seus cálculos**

Descrever em comentários a janela de mempool, percentil P60, mediana histórica, teto EIP-1559 de 12,5%, custo de 21.000 gas, tendência de janelas equivalentes e dimensões de confiança. Todo helper que descarta amostra inválida explica qual dado é protegido.

- [ ] **Step 2: Documentar análise e memória de blocos**

Explicar a gorjeta efetiva EIP-1559/legacy, a classificação por percentis da última hora, a promoção `latest → safe → finalized` e a identidade número+hash que permite trocar um bloco em reorg.

- [ ] **Step 3: Executar testes de regras puras**

Run:

```bash
rtk npm test --workspace @alphractal/api -- test/domain/statistics.test.ts test/domain/fee-estimator.test.ts test/domain/fee-snapshot-values.test.ts test/domain/block-rules.test.ts --pool=forks --poolOptions.forks.maxForks=2
rtk npm run typecheck --workspace @alphractal/api
rtk npm run lint --workspace @alphractal/api
```

Expected: os quatro arquivos de teste passam sem mudança de resultado.

- [ ] **Step 4: Commitar e enviar**

```bash
rtk git add apps/api/src/domain/fees apps/api/src/domain/blocks
rtk git commit -m "docs(code): explain fee and block domain rules"
rtk git push
```

### Task 3: Documentar orquestração da aplicação e adaptadores externos

**Files:**

- Modify: `apps/api/src/application/common/errors.ts`
- Modify: `apps/api/src/application/common/live-event-publisher.ts`
- Modify: `apps/api/src/application/fees/calculate-fee-snapshot.ts`
- Modify: `apps/api/src/application/fees/fee-monitor.ts`
- Modify: `apps/api/src/application/fees/get-current-fee-snapshot.ts`
- Modify: `apps/api/src/application/fees/get-fee-history.ts`
- Modify: `apps/api/src/application/blocks/observe-block.ts`
- Modify: `apps/api/src/application/blocks/prime-recent-blocks.ts`
- Modify: `apps/api/src/application/blocks/get-recent-blocks.ts`
- Modify: `apps/api/src/application/blocks/get-block-by-identifier.ts`
- Modify: `apps/api/src/application/blocks/update-block-finality.ts`
- Modify: `apps/api/src/infrastructure/alchemy/alchemy-errors.ts`
- Modify: `apps/api/src/infrastructure/alchemy/alchemy-fee-client.ts`
- Modify: `apps/api/src/infrastructure/alchemy/alchemy-mempool-client.ts`
- Modify: `apps/api/src/infrastructure/alchemy/alchemy-block-client.ts`
- Modify: `apps/api/src/infrastructure/alchemy/reconnecting-websocket.ts`
- Modify: `apps/api/src/infrastructure/coinbase/coinbase-price-client.ts`
- Modify: `apps/api/src/infrastructure/mongodb/mongo-client.ts`
- Modify: `apps/api/src/infrastructure/mongodb/mongo-fee-snapshot-repository.ts`
- Modify: `apps/api/src/infrastructure/mongodb/mongo-observed-block-repository.ts`

**Consumes:** Domínio documentado e portas de entrada/saída estáveis.

**Produces:** Fluxos de cálculo, cache, coalescência, backfill, reorg, adaptadores e persistência compreensíveis sem consultar a implementação inteira.

- [ ] **Step 1: Documentar casos de uso e estados degradados**

Descrever em cada caso de uso quando o snapshot vira `last-known`, quando a persistência é apenas degradada, como triggers concorrentes coalescem, por que busca pontual não altera a janela e como finality nunca é rebaixada.

- [ ] **Step 2: Documentar clientes e repositórios**

Explicar normalização de RPC, inscrição e reconexão WebSocket, deduplicação da mempool, cotação Coinbase, índices Mongo, TTL de 30 dias, cursor opaco e quais erros são convertidos em indisponibilidade tipada. Comentários nunca contêm URLs ou credenciais.

- [ ] **Step 3: Executar testes de aplicação e infraestrutura**

Run:

```bash
rtk npm test --workspace @alphractal/api -- test/application/fee-monitor.test.ts test/application/block-use-cases.test.ts test/infrastructure/alchemy-clients.test.ts test/infrastructure/coinbase-price-client.test.ts test/infrastructure/mongo-repositories.test.ts --pool=forks --poolOptions.forks.maxForks=2
rtk npm run typecheck --workspace @alphractal/api
rtk npm run lint --workspace @alphractal/api
```

Expected: cálculo, blocos, WebSocket, Coinbase e Mongo permanecem com os mesmos resultados.

- [ ] **Step 4: Commitar e enviar**

```bash
rtk git add apps/api/src/application apps/api/src/infrastructure
rtk git commit -m "docs(code): explain application and infrastructure flows"
rtk git push
```

### Task 4: Documentar interfaces, runtime e todos os testes

**Files:**

- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/runtime.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/config/env.ts`
- Modify: `apps/api/src/config/root-env.ts`
- Modify: `apps/api/src/interfaces/http/request-id-middleware.ts`
- Modify: `apps/api/src/interfaces/http/live-serializers.ts`
- Modify: `apps/api/src/interfaces/http/fee-routes.ts`
- Modify: `apps/api/src/interfaces/http/block-routes.ts`
- Modify: `apps/api/src/interfaces/http/error-middleware.ts`
- Modify: `apps/api/src/interfaces/sse/live-sse-hub.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/test/app.test.ts`
- Modify: `apps/api/test/application/block-use-cases.test.ts`
- Modify: `apps/api/test/application/fee-monitor.test.ts`
- Modify: `apps/api/test/config/env.test.ts`
- Modify: `apps/api/test/config/root-env.test.ts`
- Modify: `apps/api/test/domain/block-rules.test.ts`
- Modify: `apps/api/test/domain/fee-estimator.test.ts`
- Modify: `apps/api/test/domain/fee-snapshot-values.test.ts`
- Modify: `apps/api/test/domain/statistics.test.ts`
- Modify: `apps/api/test/helpers/fakes.ts`
- Modify: `apps/api/test/helpers/fixtures.ts`
- Modify: `apps/api/test/infrastructure/alchemy-clients.test.ts`
- Modify: `apps/api/test/infrastructure/coinbase-price-client.test.ts`
- Modify: `apps/api/test/infrastructure/mongo-repositories.test.ts`
- Modify: `apps/api/test/interfaces/live-http.test.ts`
- Modify: `apps/api/test/interfaces/live-sse.test.ts`
- Modify: `apps/api/test/runtime/resilience.test.ts`
- Modify: `apps/api/test/placeholder.ts`
- Modify: `packages/contracts/test/contracts.test.ts`

**Consumes:** Casos de uso, adaptadores e contratos já documentados.

**Produces:** Entrega REST/SSE, inicialização, desligamento, configuração e estratégia de testes explicados para revisão ponta a ponta.

- [ ] **Step 1: Documentar fronteiras HTTP, SSE e runtime**

Explicar serialização como única borda de arredondamento, envelopes e erros seguros, CORS, request IDs, limites de body, fila de backpressure SSE, heartbeat, retry, inicialização tolerante a falhas, reconexão Mongo e desligamento idempotente.

- [ ] **Step 2: Documentar cada fixture, fake, suite e cenário de teste**

Adicionar cabeçalho a cada arquivo de teste e comentário em cada `describe`, helper e `it` explicando a regra de produção protegida. Usar este formato:

```ts
/**
 * Garante que uma indisponibilidade temporária da Alchemy preserve a última
 * recomendação válida, em vez de persistir dados inválidos ou encerrar o SSE.
 */
it('publica last-known sem persistir novamente', async () => {
  // corpo do teste existente, sem alteração de asserções
});
```

- [ ] **Step 3: Executar todas as verificações**

Run:

```bash
rtk npm test --workspace @alphractal/contracts -- --pool=forks --poolOptions.forks.maxForks=2
rtk npm test --workspace @alphractal/api -- --pool=forks --poolOptions.forks.maxForks=2
rtk npm run typecheck
rtk npm run lint
rtk npm run format:check
rtk proxy git diff --check
```

Expected: 100% das suítes passam, sem alteração funcional e com formatação válida.

- [ ] **Step 4: Conferir cobertura de arquivos e comentários**

Run:

```bash
rtk rg --files apps/api/src apps/api/test packages/contracts/src packages/contracts/test | sort
rtk rg -L '^/\*\*' apps/api/src apps/api/test packages/contracts/src packages/contracts/test -g '*.ts'
```

Expected: a segunda busca não retorna arquivos TypeScript mantidos sem cabeçalho JSDoc.

- [ ] **Step 5: Commitar e enviar**

```bash
rtk git add apps/api/src apps/api/test packages/contracts/src packages/contracts/test
rtk git commit -m "docs(code): explain live monitor implementation"
rtk git push
```
