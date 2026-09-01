# Relatório — Tarefa 1: contrato compartilhado do histórico de blocos

## Implementação

- Adicionado `BlockHistoryQuerySchema`, com `limit` coercível, inteiro entre 1 e 50, padrão 10, e `cursor` opcional não vazio.
- Adicionado `BlockHistoryResponseSchema`, com até 50 `BlockSummarySchema` em `data`, metadados de paginação e validação de coerência entre `hasMore` e `nextCursor`.
- Exportados `BlockHistoryQueryDto` e `BlockHistoryResponseDto` inferidos pelos schemas.
- Adicionado teste de contrato para defaults, coerção, limites, cursor vazio e coerência da página.

## Comandos e resultados

### RED

Comando:

```bash
rtk npm test --workspace @alphractal/contracts -- --pool=forks --poolOptions.forks.maxForks=2 test/contracts.test.ts
```

Resultado: falhou como esperado (`1 failed`, `32 passed`, `33 total`). A falha ocorreu em `schema('BlockHistoryQuerySchema')`, com a mensagem `expected ... to have property "BlockHistoryQuerySchema"`, pois as exportações ainda não existiam.

### GREEN

O mesmo comando, após a implementação, passou: `1 passed`, `33 passed`.

### Typecheck

```bash
rtk npm run typecheck --workspace @alphractal/contracts
```

Resultado: `tsc -p tsconfig.json` terminou com código 0.

### Autoverificação do diff

```bash
rtk git diff --check
```

Resultado: nenhuma inconsistência de whitespace.

## Arquivos alterados

- `packages/contracts/src/blocks.ts`
- `packages/contracts/test/contracts.test.ts`
- `.superpowers/sdd/task-1-report.md`

## Autorrevisão

A implementação segue literalmente os schemas e a mensagem de erro definidos no brief, reutiliza `BlockSummarySchema`, limita a página a 50 itens e mantém a validação de coerência exigida. O teste primeiro falhou pela ausência da exportação e passou após o código mínimo ser adicionado. Não foram alterados arquivos não relacionados.

## Preocupações

Nenhuma preocupação conhecida.
