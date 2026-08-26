# Contrato da API Fees - v1

## Status e autoridade

Este documento e a fonte normativa da comunicacao entre `apps/web` e
`apps/api` para o MVP da aba **Fees**. Ele foi aprovado em 26 de agosto de
2026 e deriva das decisoes de `docs/architecture.md`.

`packages/contracts` deve implementar este documento com schemas Zod e tipos
TypeScript inferidos. Em caso de divergencia, este documento deve ser revisto e
aprovado antes de os schemas ou as aplicacoes serem alterados.

## Escopo

O contrato cobre somente o monitoramento de taxas da Ethereum Mainnet:

- consulta do ultimo snapshot calculado;
- consulta do historico de snapshots para graficos;
- recebimento de novos snapshots por Server-Sent Events (SSE).

O sistema e somente de leitura. O contrato nao inclui autenticacao, assinatura
ou envio de transacoes, conexao do navegador a provedores RPC, deploy de
contratos, Redis, filas ou microsservicos.

`GET /health` continua sendo um endpoint de infraestrutura e nao faz parte do
dominio Fees.

## Convencoes

- Prefixo da API: `/api/v1`.
- REST usa `application/json; charset=utf-8`.
- Datas usam ISO 8601 em UTC, com o sufixo `Z`.
- Valores de Gwei e USD usam numeros JSON finitos e nao negativos.
- Campos obrigatorios de `FeeSnapshot` nunca usam `null`. Na paginacao,
  `nextCursor: null` indica explicitamente que nao existe outra pagina.
- Respostas REST incluem `X-Request-Id`.
- Respostas REST usam `Cache-Control: no-store`.
- O MVP nao possui autenticacao. O backend limita origens pela configuracao de
  CORS do frontend.
- Clientes devem ignorar campos desconhecidos para permitir extensoes
  compativeis dentro da `v1`.

## Recurso compartilhado: `FeeSnapshot`

O mesmo `FeeSnapshot` aparece em `/current`, nos itens de `/history` e no
evento `fee-snapshot` do stream.

```json
{
  "timestamp": "2026-08-26T18:42:15.123Z",
  "metadata": {
    "network": "ethereum-mainnet"
  },
  "recommendedMaxFeeGwei": 18.42,
  "recommendedPriorityFeeGwei": 1.35,
  "ethUsd": 4612.83,
  "sampleSize": 842,
  "dataAgeMs": 740,
  "sources": {
    "mempool": "alchemy",
    "price": "coinbase"
  },
  "sourceUpdatedAt": {
    "mempool": "2026-08-26T18:42:14.810Z",
    "price": "2026-08-26T18:42:15.002Z"
  },
  "status": {
    "mempool": "fresh",
    "price": "fresh",
    "persistence": "available"
  }
}
```

### Campos

| Campo | Tipo e restricoes | Semantica |
| --- | --- | --- |
| `timestamp` | string ISO 8601 UTC | Instante em que o snapshot foi calculado. |
| `metadata.network` | literal `ethereum-mainnet` | Rede observada pelo MVP. |
| `recommendedMaxFeeGwei` | number, finito, >= 0 | Taxa maxima total recomendada em Gwei. |
| `recommendedPriorityFeeGwei` | number, finito, >= 0 | Gorjeta recomendada em Gwei. |
| `ethUsd` | number, finito, >= 0 | Cotacao ETH/USD usada no calculo. |
| `sampleSize` | integer, >= 0 | Quantidade de transacoes da amostra recente. |
| `dataAgeMs` | integer, >= 0 | Idade, em milissegundos, da fonte mais antiga usada. |
| `sources.mempool` | literal `alchemy` | Origem da amostra de mempool e dos dados Ethereum. |
| `sources.price` | literal `coinbase` | Origem da cotacao ETH/USD. |
| `sourceUpdatedAt.mempool` | string ISO 8601 UTC | Ultima atualizacao da fonte de mempool usada. |
| `sourceUpdatedAt.price` | string ISO 8601 UTC | Ultima atualizacao da cotacao usada. |
| `status.mempool` | `fresh` ou `stale` | Atualidade da fonte de mempool segundo a configuracao do backend. |
| `status.price` | `fresh` ou `stale` | Atualidade da cotacao segundo a configuracao do backend. |
| `status.persistence` | `available` ou `degraded` | Estado da persistencia no instante do snapshot. |

O backend determina os limites de atualidade de cada fonte. O frontend nao
recalcula `fresh` ou `stale`; ele apresenta o estado recebido e usa
`dataAgeMs` como contexto para o usuario.

## Envelope de snapshot

REST e SSE usam o mesmo envelope JSON, com um unico campo `data` cujo valor e
um `FeeSnapshot` completo. O exemplo integral aparece na resposta de
`GET /api/v1/fees/current`.

## `GET /api/v1/fees/current`

Retorna o ultimo snapshot conhecido.

### Request

Nao aceita query parameters nem body.

### Response `200 OK`

```json
{
  "data": {
    "timestamp": "2026-08-26T18:42:15.123Z",
    "metadata": {
      "network": "ethereum-mainnet"
    },
    "recommendedMaxFeeGwei": 18.42,
    "recommendedPriorityFeeGwei": 1.35,
    "ethUsd": 4612.83,
    "sampleSize": 842,
    "dataAgeMs": 740,
    "sources": {
      "mempool": "alchemy",
      "price": "coinbase"
    },
    "sourceUpdatedAt": {
      "mempool": "2026-08-26T18:42:14.810Z",
      "price": "2026-08-26T18:42:15.002Z"
    },
    "status": {
      "mempool": "fresh",
      "price": "fresh",
      "persistence": "available"
    }
  }
}
```

### Falha especifica

Retorna `503 SNAPSHOT_UNAVAILABLE` quando o processo ainda nao possui um
snapshot utilizavel.

## `GET /api/v1/fees/history`

Retorna snapshots persistidos para composicao de graficos.

### Query parameters

| Parametro | Obrigatorio | Regra |
| --- | --- | --- |
| `from` | sim | Data ISO 8601 UTC inclusiva. |
| `to` | sim | Data ISO 8601 UTC exclusiva e posterior a `from`. |
| `limit` | nao | Inteiro de 1 a 5000; padrao `1000`. |
| `cursor` | nao | Cursor opaco retornado pela pagina anterior. |

Exemplo:

```http
GET /api/v1/fees/history?from=2026-08-26T17:00:00.000Z&to=2026-08-26T18:00:00.000Z&limit=1000
```

Quando `cursor` for enviado, `from`, `to` e `limit` devem preservar os valores
da consulta original. Cursor invalido, expirado ou usado com outro intervalo
gera `400 INVALID_QUERY`.

### Response `200 OK`

```json
{
  "data": [
    {
      "timestamp": "2026-08-26T17:00:05.000Z",
      "metadata": {
        "network": "ethereum-mainnet"
      },
      "recommendedMaxFeeGwei": 17.91,
      "recommendedPriorityFeeGwei": 1.21,
      "ethUsd": 4608.44,
      "sampleSize": 801,
      "dataAgeMs": 615,
      "sources": {
        "mempool": "alchemy",
        "price": "coinbase"
      },
      "sourceUpdatedAt": {
        "mempool": "2026-08-26T17:00:04.610Z",
        "price": "2026-08-26T17:00:04.385Z"
      },
      "status": {
        "mempool": "fresh",
        "price": "fresh",
        "persistence": "available"
      }
    }
  ],
  "page": {
    "nextCursor": null,
    "hasMore": false
  }
}
```

Regras:

- `data` e ordenado por `timestamp` crescente.
- Um intervalo sem registros retorna `200` com `data: []`.
- `nextCursor` e string quando existe outra pagina; caso contrario e `null`.
- `hasMore` deve ser equivalente a `nextCursor !== null`.
- Indisponibilidade do MongoDB retorna `503 HISTORY_UNAVAILABLE` e nao afeta
  `/current` ou `/stream`.

## `GET /api/v1/fees/stream`

Mantem uma conexao SSE para publicar snapshots calculados em tempo real.

### Request

Nao aceita query parameters nem body. O cliente usa `EventSource`.

### Response `200 OK`

```http
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
```

O servidor anuncia tres segundos como intervalo inicial de reconexao:

```text
retry: 3000

```

Quando existe um snapshot, o servidor o envia imediatamente. Novos calculos
usam o mesmo evento:

```text
id: 2026-08-26T18:42:15.123Z
event: fee-snapshot
data: {"data":{"timestamp":"2026-08-26T18:42:15.123Z","metadata":{"network":"ethereum-mainnet"},"recommendedMaxFeeGwei":18.42,"recommendedPriorityFeeGwei":1.35,"ethUsd":4612.83,"sampleSize":842,"dataAgeMs":740,"sources":{"mempool":"alchemy","price":"coinbase"},"sourceUpdatedAt":{"mempool":"2026-08-26T18:42:14.810Z","price":"2026-08-26T18:42:15.002Z"},"status":{"mempool":"fresh","price":"fresh","persistence":"available"}}}

```

Regras:

- O nome do evento e `fee-snapshot`.
- `data` usa exatamente o envelope de `/current`.
- `id` usa o `timestamp` do snapshot.
- O servidor envia um comentario de heartbeat a cada 15 segundos:

  ```text
  : heartbeat 2026-08-26T18:42:30.123Z

  ```

- Se ainda nao houver snapshot, a conexao permanece aberta ate o primeiro
  calculo.
- `EventSource` faz a reconexao automatica. Ao reconectar, o servidor envia o
  snapshot mais recente.
- O MVP nao garante replay dos eventos perdidos e nao usa o MongoDB para
  reconstruir o stream.
- Falhas de Alchemy, Coinbase ou MongoDB nao encerram uma conexao estabelecida;
  aparecem em `status` e `dataAgeMs`.

## Erros REST

Todos os erros REST usam:

```json
{
  "error": {
    "code": "INVALID_QUERY",
    "message": "Os parametros da consulta sao invalidos.",
    "details": [
      {
        "field": "from",
        "issue": "Deve ser uma data ISO 8601 valida."
      }
    ],
    "requestId": "req-01J6EXAMPLE"
  }
}
```

`details` e omitido quando nao houver informacao segura e acionavel. Stack
traces, credenciais e mensagens brutas de provedores nunca sao expostas.

| HTTP | `error.code` | Uso |
| --- | --- | --- |
| `400` | `INVALID_QUERY` | Data, limite ou cursor invalido. |
| `400` | `INVALID_TIME_RANGE` | `from` maior ou igual a `to`. |
| `404` | `ROUTE_NOT_FOUND` | Rota inexistente. |
| `503` | `SNAPSHOT_UNAVAILABLE` | Snapshot atual ainda indisponivel. |
| `503` | `HISTORY_UNAVAILABLE` | MongoDB indisponivel para consulta. |
| `500` | `INTERNAL_ERROR` | Falha inesperada e nao exposta. |

## Compatibilidade

- Adicionar um campo opcional e uma mudanca compativel na `v1`.
- Adicionar novo valor a um enum exige revisar consumidores antes da mudanca.
- Remover ou renomear campo, mudar tipo ou alterar semantica exige `/api/v2`.
- Mudancas neste documento devem atualizar schemas, fixtures e testes no mesmo
  commit.
- `apps/api` e `apps/web` nao podem declarar copias locais destes DTOs.

## Criterios de aceite do contrato executavel

- Schemas Zod representam todos os requests, responses, erros e dados SSE.
- Tipos TypeScript sao inferidos dos schemas, nao escritos em duplicidade.
- Fixtures validas deste documento passam nos schemas.
- Fixtures com datas invalidas, numeros negativos, `NaN`, enums desconhecidos
  ou campos obrigatorios ausentes falham nos schemas.
- Respostas reais da API sao verificadas contra `packages/contracts` nos testes.
- O frontend usa as mesmas fixtures para REST e SSE.
- Testes de integracao cobrem os tres endpoints sem depender de Alchemy,
  Coinbase ou MongoDB externos.
