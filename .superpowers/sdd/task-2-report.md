# Relatório — Tarefa 2: paginação estável do histórico de blocos

## Implementação

- Adicionados `BlockHistoryQuery`, `BlockHistoryPage` e `ObservedBlockRepository.findPage`.
- Criado `GetBlockHistory`, que preserva a página e traduz `PersistenceUnavailableError` para `BlocksUnavailableError`.
- Implementada paginação Mongo decrescente por `number` e `_id`, com cursor base64url opaco, versionado, vinculado ao `limit` e ancorado na altura inicial. Assim, inserções mais novas não entram nas páginas seguintes.
- Adicionado suporte no fake e um fallback `UnavailableBlockRepository.findPage` que mantém a semântica de persistência indisponível.

## Evidência TDD

### RED — paginação e caso de uso

```bash
rtk npm test --workspace @alphractal/api -- --pool=forks --poolOptions.forks.maxForks=2 test/application/block-use-cases.test.ts test/infrastructure/mongo-repositories.test.ts
```

Resultado: falhou como esperado. O caso de uso não pôde importar `get-block-history.js` e o cenário Mongo falhou com `blockRepository.findPage is not a function`; ambos os símbolos ainda não existiam.

### RED — fallback de runtime

```bash
rtk npm test --workspace @alphractal/api -- --pool=forks --poolOptions.forks.maxForks=2 test/runtime/resilience.test.ts
```

Resultado: falhou como esperado com `UnavailableBlockRepository is not a constructor`, antes de expor e implementar o fallback consultável. O teste protege que ele rejeita a consulta com `PersistenceUnavailableError`.

### GREEN

```bash
rtk npm test --workspace @alphractal/api -- --pool=forks --poolOptions.forks.maxForks=2 test/application/block-use-cases.test.ts test/infrastructure/mongo-repositories.test.ts test/runtime/resilience.test.ts
```

Resultado: 3 arquivos e 28 testes passaram. O teste Mongo confirma ordem `[105n, 104n]`, continuação `[103n, 102n]` após inserir `106n`, ausência do bloco novo na segunda página e rejeição de cursor com outro limite.

## Typecheck e autorrevisão

```bash
rtk npm run typecheck --workspace @alphractal/api
rtk git diff --check
```

Resultado: `tsc -p tsconfig.json` terminou com código 0 e a verificação do diff não retornou problemas de whitespace. A revisão confirmou filtro canônico, ordenação estável, âncora inicial no cursor, validação de versão/limite/formato e preservação de `InvalidQueryError` em vez de normalizá-lo como indisponibilidade.

## Arquivos alterados

- `apps/api/src/domain/blocks/models.ts`
- `apps/api/src/domain/blocks/ports.ts`
- `apps/api/src/application/blocks/get-block-history.ts`
- `apps/api/src/infrastructure/mongodb/mongo-observed-block-repository.ts`
- `apps/api/src/runtime.ts`
- `apps/api/test/helpers/fakes.ts`
- `apps/api/test/application/block-use-cases.test.ts`
- `apps/api/test/infrastructure/mongo-repositories.test.ts`
- `apps/api/test/runtime/resilience.test.ts`
- `.superpowers/sdd/task-2-report.md`

## Preocupações

O brief original não listava `runtime.ts`, mas a nova porta é obrigatória e o fallback a implementa; sem o stub, o typecheck falharia. O ajuste e o teste foram autorizados pelo responsável da integração. Nenhuma outra preocupação conhecida.
