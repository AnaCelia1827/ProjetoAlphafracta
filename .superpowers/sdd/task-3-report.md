# Task 3 — Endpoint REST de histórico de blocos

## Status

Concluída. O endpoint `GET /api/v1/blocks/history` expõe páginas do catálogo
canônico, usa o contrato compartilhado para a query e é composto pelo runtime.

## Implementação

- `block-routes.ts` declara `BlockHistoryQueryUseCase`, valida `limit` e
  `cursor` com `BlockHistoryQuerySchema`, converte erros de schema em
  `InvalidQueryError` e registra `/history` antes de `/:numberOrHash`.
- A resposta serializa cada `BlockSummary` com `serializeBlockSummary` e produz
  `{ data, page: { nextCursor, hasMore } }` coerente com
  `BlockHistoryResponseSchema`.
- `ApiDependencies` recebe `getBlockHistory`; o runtime injeta
  `new GetBlockHistory(adapters.blockRepository)`.
- As fixtures de HTTP, runtime e integração web agora fornecem a dependência.

## Evidência TDD

### RED

Comando:

```bash
rtk npm test --workspace @alphractal/api -- --pool=forks --poolOptions.forks.maxForks=2 test/interfaces/live-http.test.ts
```

Resultado: 1 teste falhou de 16. A asserção recebeu `400` em vez de `200` para
`/api/v1/blocks/history?limit=10`, pois `history` ainda era consumido pela rota
dinâmica de identificador. Isso confirmou a ausência da rota estática.

### GREEN

Comando:

```bash
rtk npm test --workspace @alphractal/api -- --pool=forks --poolOptions.forks.maxForks=2 test/interfaces/live-http.test.ts test/runtime/resilience.test.ts
```

Resultado: 2 arquivos e 21 testes passaram. O teste HTTP cobre serialização,
`hasMore`, o argumento normalizado `{ limit: 10 }` e `limit=51` como
`INVALID_QUERY`; o teste de runtime confirma a composição da rota com uma
página do repositório.

## Verificações

```bash
rtk npm run typecheck --workspace @alphractal/api
rtk npm run typecheck --workspace web
rtk npm test --workspace web -- --pool=forks --poolOptions.forks.maxForks=2 test/backend-integration.test.ts
rtk git diff --check
```

Todos concluíram com exit code 0; o teste web passou com 1 arquivo e 1 teste.

## Arquivos

- `apps/api/src/interfaces/http/block-routes.ts`
- `apps/api/src/app.ts`
- `apps/api/src/runtime.ts`
- `apps/api/test/interfaces/live-http.test.ts`
- `apps/api/test/runtime/resilience.test.ts`
- `apps/web/test/backend-integration.test.ts`

## Autorrevisão

Conferidos os requisitos do brief e o diff: rota estática antes da dinâmica,
schema compartilhado, envelope/serialização, composição em app/runtime e
fixtures tipadas. Revisão independente somente-leitura não encontrou achados
críticos, importantes ou menores.

## Preocupações

Nenhuma conhecida. A primeira tentativa de typecheck web usou o nome de
workspace incorreto (`@alphractal/web`) e falhou antes de qualquer verificação;
foi refeita com o nome efetivo `web` e passou.
