# Contrato da API Live Monitor — v1

## Status e autoridade

Este documento é a fonte normativa da comunicação entre `apps/web` e
`apps/api` para o MVP do Live Monitor. Esta revisão, de 30 de agosto de 2026,
substitui o contrato inicial restrito a snapshots de Fees e deriva de
`docs/architecture.md`.

`packages/contracts` deve implementar este documento com schemas Zod e tipos
TypeScript inferidos. Em caso de divergência, este documento deve ser revisado
antes dos schemas ou das aplicações.

## Escopo

O contrato cobre somente Ethereum Mainnet:

- consulta do snapshot atual de taxas;
- histórico de snapshots para o gráfico;
- consulta dos 20 blocos mais recentes;
- consulta pontual de bloco pós-EIP-1559 por número ou hash;
- eventos de taxas e blocos por um único stream SSE.

O sistema é somente de leitura. Não inclui autenticação, assinatura ou envio de
transações, múltiplas redes, blocos pré-EIP-1559, análise interna de blocos,
Redis, filas ou microsserviços.

`GET /health` continua sendo um endpoint de infraestrutura e não faz parte do
domínio do Live Monitor.

## Convenções

- Prefixo REST: `/api/v1`.
- REST usa `application/json; charset=utf-8`.
- Datas usam ISO 8601 em UTC com sufixo `Z`.
- Gwei, ETH e USD usam números JSON finitos e não negativos.
- Percentuais de variação podem ser negativos; utilização fica entre 0 e 100.
- Gwei usa até 9 casas decimais, ETH até 18, USD até 6 e percentuais até 2.
  O arredondamento comum é metade para longe de zero.
- Números de bloco, `gasUsed` e `gasLimit` são strings decimais para não
  depender dos limites numéricos do JavaScript.
- Hashes usam strings `0x` com 64 dígitos hexadecimais.
- Respostas REST incluem `X-Request-Id` e `Cache-Control: no-store`.
- O MVP não possui autenticação. CORS aceita somente as origens configuradas.
- Clientes devem ignorar campos desconhecidos.

## Recurso `FeeSnapshot`

`FeeSnapshot` representa o estado consolidado do monitor em um instante. O
mesmo recurso aparece em `/fees/current`, em `/fees/history` e no evento
`fee-snapshot`.

```json
{
  "timestamp": "2026-08-30T18:42:15.123Z",
  "metadata": {
    "network": "ethereum-mainnet"
  },
  "recommendationState": "current",
  "recommendedMaxFeeGwei": 32.4,
  "recommendedPriorityFeeGwei": 1.8,
  "baseFeeGwei": 28.7,
  "effectiveGasPriceGwei": 30.5,
  "estimatedTransferCost": {
    "status": "fresh",
    "transactionType": "native-eth-transfer",
    "gasUnits": 21000,
    "maxCostEth": 0.0006804,
    "ethUsd": 3420.25,
    "maxCostUsd": 2.33,
    "priceUpdatedAt": "2026-08-30T18:42:15.002Z"
  },
  "trend24h": {
    "status": "available",
    "windowMinutes": 5,
    "percentChange": 8.4,
    "currentMedianMaxFeeGwei": 32.1,
    "previousMedianMaxFeeGwei": 29.61
  },
  "confidence": {
    "level": "high",
    "reasons": ["fresh-data", "stable-fees", "strong-sample"]
  },
  "sampleSize": 2847,
  "dataAgeMs": 320,
  "sources": {
    "mempool": "alchemy",
    "ethereum": "alchemy",
    "price": "coinbase"
  },
  "sourceUpdatedAt": {
    "mempool": "2026-08-30T18:42:14.810Z",
    "ethereum": "2026-08-30T18:42:13.900Z",
    "price": "2026-08-30T18:42:15.002Z"
  },
  "status": {
    "mempool": "fresh",
    "ethereum": "fresh",
    "price": "fresh",
    "persistence": "available"
  }
}
```

### Campos principais

| Campo                        | Tipo e restrições          | Semântica                                                      |
| ---------------------------- | -------------------------- | -------------------------------------------------------------- |
| `timestamp`                  | data ISO 8601 UTC          | Instante em que o estado foi produzido                         |
| `metadata.network`           | literal `ethereum-mainnet` | Rede fixa do MVP                                               |
| `recommendationState`        | `current` ou `last-known`  | Se os valores foram calculados com dados atuais ou preservados |
| `recommendedMaxFeeGwei`      | number, >= 0               | Teto recomendado em Gwei                                       |
| `recommendedPriorityFeeGwei` | number, >= 0               | Gorjeta recomendada em Gwei                                    |
| `baseFeeGwei`                | number, >= 0               | Base Fee usada no cálculo                                      |
| `effectiveGasPriceGwei`      | number, >= 0               | `baseFeeGwei + recommendedPriorityFeeGwei`                     |
| `sampleSize`                 | integer, >= 0              | Quantidade de transações da janela recente                     |
| `dataAgeMs`                  | integer, >= 0              | Idade da fonte mais antiga usada pela recomendação             |

Quando `recommendationState` for `last-known`, os valores de taxa continuam
representando o último cálculo válido, `dataAgeMs` aumenta e
`confidence.level` deve ser `unavailable`.

### `estimatedTransferCost`

O custo usa sempre:

```text
recommendedMaxFeeGwei × 10^-9 × 21.000 gas
```

O objeto é uma união discriminada por `status`:

- `fresh`: contém todos os campos do exemplo e uma cotação atual;
- `stale`: contém os mesmos campos, mas usa a última cotação conhecida;
- `unavailable`: contém apenas `status`, `transactionType`, `gasUnits` e
  `maxCostEth` porque nenhuma cotação foi recebida.

`transactionType` é sempre `native-eth-transfer` e `gasUnits` é sempre 21000.
O custo é um teto estimado, não o valor efetivamente pago.

### `trend24h`

Quando existem dados:

```json
{
  "status": "available",
  "windowMinutes": 5,
  "percentChange": 8.4,
  "currentMedianMaxFeeGwei": 32.1,
  "previousMedianMaxFeeGwei": 29.61
}
```

`percentChange` compara a mediana dos últimos cinco minutos com a mediana da
janela equivalente 24 horas antes.

Sem as duas janelas completas:

```json
{
  "status": "insufficient-history",
  "windowMinutes": 5
}
```

O frontend mostra `Not enough history` e não substitui o valor por zero.

Quando o repositório histórico estiver indisponível:

```json
{
  "status": "unavailable",
  "windowMinutes": 5,
  "reason": "history-unavailable"
}
```

### `confidence`

`level` aceita `high`, `medium`, `low` ou `unavailable`. `reasons` contém uma
ou mais justificativas:

| Código          | Significado                               |
| --------------- | ----------------------------------------- |
| `fresh-data`    | Dados necessários estão atuais            |
| `stable-fees`   | Distribuição recente está estável         |
| `strong-sample` | Amostra tem tamanho forte                 |
| `aging-data`    | Alguma fonte necessária está envelhecendo |
| `volatile-fees` | Distribuição recente está volátil         |
| `weak-sample`   | Amostra é pequena                         |
| `missing-data`  | Faltam dados necessários                  |

Coinbase e persistência não participam do nível de confiança da recomendação.

### Fontes e estados

`sources` usa os literais `alchemy` para mempool/Ethereum e `coinbase` para
preço. `sourceUpdatedAt` omite uma fonte somente quando ela nunca produziu dado.

`status.mempool`, `status.ethereum` e `status.price` aceitam `fresh`, `stale`
ou `unavailable`. `status.persistence` aceita `available` ou `degraded`.

Mempool e Ethereum ficam `fresh` até 10 segundos, `stale` acima de 10 até 30
segundos e `unavailable` depois de 30 segundos ou antes do primeiro dado. O
preço fica `fresh` até 30 segundos, `stale` depois disso quando há uma cotação
anterior e `unavailable` antes da primeira cotação.

## Recurso `BlockSummary`

`BlockSummary` é usado na lista recente, na consulta pontual e nos eventos de
bloco.

```json
{
  "number": "23548192",
  "hash": "0x7d9452dca37be2e88b85f074f8142ab746d9f58b90d63d1d7ba2ea5ecbf10a4e",
  "timestamp": "2026-08-30T18:42:15.000Z",
  "finality": "latest",
  "feeLevel": "normal",
  "baseFeeGwei": 28.7,
  "medianPriorityFeeGwei": 1.8,
  "effectiveGasPriceGwei": 30.5,
  "gasUsed": "23400000",
  "gasLimit": "30000000",
  "utilizationPercent": 78,
  "transactionCount": 184,
  "provider": "alchemy",
  "etherscanUrl": "https://etherscan.io/block/23548192"
}
```

### Semântica

| Campo                   | Semântica                                                                    |
| ----------------------- | ---------------------------------------------------------------------------- |
| `finality`              | `latest`, `safe` ou `finalized` segundo as referências canônicas da Ethereum |
| `baseFeeGwei`           | Base Fee definida pelo bloco                                                 |
| `medianPriorityFeeGwei` | Mediana das gorjetas efetivamente pagas pelas transações                     |
| `effectiveGasPriceGwei` | Base Fee + mediana da Priority Fee                                           |
| `utilizationPercent`    | `gasUsed / gasLimit × 100`                                                   |
| `feeLevel`              | Classificação relativa ao Effective Gas Price dos blocos da última hora      |

`feeLevel` aceita `low`, `normal`, `elevated`, `high` ou `unavailable`:

- abaixo de P25: `low`;
- P25 até abaixo de P75: `normal`;
- P75 até abaixo de P90: `elevated`;
- P90 ou acima: `high`;
- menos de 20 blocos disponíveis para a janela: `unavailable`.

Para transações EIP-1559, a gorjeta efetiva é limitada pela diferença entre
`maxFeePerGas` e a Base Fee. Para transações legadas, é `gasPrice - baseFee`,
limitada ao mínimo zero. A mediana considera apenas valores válidos.

## Envelopes

Um recurso único usa:

```json
{
  "data": {}
}
```

Listas usam:

```json
{
  "data": []
}
```

O histórico mantém paginação por cursor. A lista fixa de blocos recentes não é
paginada.

## `GET /api/v1/fees/current`

Retorna o último `FeeSnapshot` conhecido. Não aceita query nem body.

- `200 OK`: envelope com `FeeSnapshot`.
- `503 SNAPSHOT_UNAVAILABLE`: nenhum snapshot utilizável foi produzido desde o
  início do processo.

## `GET /api/v1/fees/history`

Retorna snapshots persistidos em ordem crescente para o gráfico de Recommended
Max Fee.

### Query

| Parâmetro | Obrigatório | Regra                                            |
| --------- | ----------- | ------------------------------------------------ |
| `from`    | sim         | Data ISO 8601 UTC inclusiva                      |
| `to`      | sim         | Data ISO 8601 UTC exclusiva e posterior a `from` |
| `limit`   | não         | Inteiro de 1 a 5000; padrão 1000                 |
| `cursor`  | não         | Cursor opaco retornado pela página anterior      |

Quando `cursor` for enviado, `from`, `to` e `limit` preservam os valores da
consulta original.

```json
{
  "data": [],
  "page": {
    "nextCursor": null,
    "hasMore": false
  }
}
```

Regras:

- intervalo vazio retorna `200` com `data: []`;
- `hasMore` equivale a `nextCursor !== null`;
- MongoDB indisponível retorna `503 HISTORY_UNAVAILABLE`;
- a falha do histórico não afeta `/fees/current` nem o SSE;
- a retenção máxima é 30 dias.

## `GET /api/v1/blocks/recent`

Retorna até os 20 blocos pós-EIP-1559 mais recentes em ordem decrescente por
número. Não aceita query nem body.

```json
{
  "data": [
    {
      "number": "23548192",
      "hash": "0x7d9452dca37be2e88b85f074f8142ab746d9f58b90d63d1d7ba2ea5ecbf10a4e",
      "timestamp": "2026-08-30T18:42:15.000Z",
      "finality": "latest",
      "feeLevel": "normal",
      "baseFeeGwei": 28.7,
      "medianPriorityFeeGwei": 1.8,
      "effectiveGasPriceGwei": 30.5,
      "gasUsed": "23400000",
      "gasLimit": "30000000",
      "utilizationPercent": 78,
      "transactionCount": 184,
      "provider": "alchemy",
      "etherscanUrl": "https://etherscan.io/block/23548192"
    }
  ]
}
```

Durante a inicialização, pode retornar menos de 20 itens. Sem cache e com a
Alchemy indisponível, retorna `503 BLOCKS_UNAVAILABLE`.

## `GET /api/v1/blocks/:numberOrHash`

Consulta um bloco sob demanda sem inseri-lo na lista recente. O primeiro bloco
aceito é o 12965000, ativação da London Upgrade na Ethereum Mainnet.

`numberOrHash` aceita:

- número decimal sem sinal;
- hash `0x` com 64 dígitos hexadecimais.

O resultado é um envelope com `BlockSummary`. Blocos pesquisados não são
persistidos apenas por terem sido pesquisados.

Falhas específicas:

- `400 INVALID_BLOCK_IDENTIFIER`;
- `404 BLOCK_NOT_FOUND`;
- `422 PRE_EIP1559_BLOCK_UNSUPPORTED` para números abaixo de 12965000 ou
  blocos sem `baseFeePerGas`;
- `503 ETHEREUM_PROVIDER_UNAVAILABLE`.

## `GET /api/v1/live/stream`

Mantém a única conexão SSE do Live Monitor.

```http
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
```

O servidor anuncia `retry: 3000` e envia heartbeat a cada 15 segundos.

### Evento `fee-snapshot`

```text
id: fee:2026-08-30T18:42:15.123Z
event: fee-snapshot
data: {"data":{"timestamp":"2026-08-30T18:42:15.123Z"}}

```

O `data` real contém o `FeeSnapshot` completo. O evento é publicado a cada
cinco segundos e na chegada de bloco.

### Evento `block-added`

```text
id: block:23548192:0x7d9452dca37be2e88b85f074f8142ab746d9f58b90d63d1d7ba2ea5ecbf10a4e
event: block-added
data: {"data":{"number":"23548192","hash":"0x7d9452dca37be2e88b85f074f8142ab746d9f58b90d63d1d7ba2ea5ecbf10a4e"}}

```

O `data` real contém o `BlockSummary` completo.

### Evento `block-status-changed`

```text
id: block-status:23548192:safe
event: block-status-changed
data: {"data":{"number":"23548192","hash":"0x7d9452dca37be2e88b85f074f8142ab746d9f58b90d63d1d7ba2ea5ecbf10a4e","finality":"safe"}}

```

O cliente localiza o bloco por número e hash e atualiza somente `finality`.

### Conexão e reconexão

- Ao conectar, o servidor envia o último `fee-snapshot` e o bloco mais recente,
  quando existirem.
- O frontend carrega `/fees/current` e `/blocks/recent` no bootstrap.
- `EventSource` faz reconexão automática.
- Após reconectar, o frontend refaz as duas consultas REST para cobrir eventos
  perdidos.
- O MVP não oferece replay pelo cabeçalho `Last-Event-ID`.
- Falhas de fonte ou MongoDB não encerram uma conexão estabelecida.
- `GET /api/v1/fees/stream` deixa de fazer parte do contrato antes da primeira
  implementação executável.

## Estado derivado pelo frontend

O cabeçalho deriva:

- `Live`: SSE conectado e todas as fontes/serviços em estado atual;
- `Degraded`: SSE conectado e algum `status` está `stale`, `unavailable` ou
  `degraded`;
- `Offline`: SSE desconectado.

`Updated … ago` usa o instante do último evento recebido. O frontend não
recalcula confiança, tendência, fee level ou métricas de bloco.

## Erros REST

Todos os erros seguem:

```json
{
  "error": {
    "code": "INVALID_QUERY",
    "message": "Os parâmetros da consulta são inválidos.",
    "details": [
      {
        "field": "from",
        "issue": "Deve ser uma data ISO 8601 válida."
      }
    ],
    "requestId": "req-01J6EXAMPLE"
  }
}
```

`details` é omitido quando não houver informação segura e acionável. Stack
traces, credenciais e mensagens brutas de provedores nunca são expostas.

| HTTP | `error.code`                    | Uso                                 |
| ---- | ------------------------------- | ----------------------------------- |
| 400  | `INVALID_QUERY`                 | Data, limite ou cursor inválido     |
| 400  | `INVALID_TIME_RANGE`            | `from` maior ou igual a `to`        |
| 400  | `INVALID_BLOCK_IDENTIFIER`      | Número ou hash malformado           |
| 404  | `ROUTE_NOT_FOUND`               | Rota inexistente                    |
| 404  | `BLOCK_NOT_FOUND`               | Bloco não encontrado                |
| 422  | `PRE_EIP1559_BLOCK_UNSUPPORTED` | Bloco anterior ao escopo do MVP     |
| 503  | `SNAPSHOT_UNAVAILABLE`          | Nenhum snapshot atual ou conhecido  |
| 503  | `HISTORY_UNAVAILABLE`           | MongoDB indisponível para histórico |
| 503  | `BLOCKS_UNAVAILABLE`            | Lista recente indisponível          |
| 503  | `ETHEREUM_PROVIDER_UNAVAILABLE` | Consulta pontual não atendida       |
| 500  | `INTERNAL_ERROR`                | Falha inesperada não exposta        |

## Compatibilidade

Esta revisão antecede a primeira implementação dos schemas e pode definir novos
campos obrigatórios dentro da `v1`. Depois da publicação de
`packages/contracts`:

- adicionar campo opcional é compatível;
- adicionar valor a enum exige revisar consumidores;
- remover/renomear campo, mudar tipo ou semântica exige `/api/v2`;
- mudanças normativas atualizam schemas, fixtures e testes no mesmo commit;
- `apps/api` e `apps/web` não declaram cópias locais dos DTOs.

## Critérios de aceite do contrato executável

- Schemas Zod representam recursos, uniões, requests, responses, erros e SSE.
- Tipos TypeScript são inferidos dos schemas.
- Fixtures válidas deste documento passam.
- Datas inválidas, números não finitos, negativos indevidos, hashes inválidos,
  enums desconhecidos e campos obrigatórios ausentes falham.
- Respostas reais da API são verificadas contra `packages/contracts`.
- Testes de integração cobrem todos os endpoints sem rede externa.
- Testes de SSE cobrem os três eventos, heartbeat e reconexão sem replay.
- Testes de domínio cobrem custo de 21.000 gas, tendência, confiança, mediana,
  percentis, utilização e finality.
