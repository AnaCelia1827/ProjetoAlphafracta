# Arquitetura — Monitoramento de taxas Ethereum em tempo real

## Objetivo

Entregar um MVP isolado para a aba **Fees** da Alphractal. O painel deve
transformar sinais ao vivo da mempool Ethereum em uma única recomendação de
taxa, exibir sua equivalência em USD e manter um histórico consultável.

O sistema é somente de leitura. Ele não assina, envia ou automatiza transações
on-chain.

## Decisões

| Área | Decisão |
| --- | --- |
| Frontend | Next.js com TypeScript |
| Backend | NestJS sobre Node.js e TypeScript |
| Dados Ethereum | Alchemy RPC, com `viem` para consultas e tipos Ethereum |
| Mempool | WebSocket `alchemy_pendingTransactions` da Alchemy |
| Cotação | WebSocket público da Coinbase, produto `ETH-USD` |
| Atualização da tela | Server-Sent Events (SSE) do backend para o frontend |
| Persistência | MongoDB, com coleção de séries temporais para snapshots |
| Organização | Monólito modular; não usar fila, Redis ou microsserviços no MVP |

Essa escolha acompanha a base tecnológica atual da Alphractal (Next.js e
NestJS), preservando uma separação explícita entre interface e ingestão de
dados sem introduzir infraestrutura que o MVP ainda não exige.

## Estrutura proposta

```text
apps/
  web/                 # Next.js: painel Fees
  api/                 # NestJS: ingestão, cálculo, SSE e API
packages/
  domain/              # tipos e fórmulas compartilhados
docs/
  architecture.md
```

Os módulos internos de `apps/api` terão responsabilidades únicas:

| Módulo | Responsabilidade |
| --- | --- |
| `mempool` | Conectar à Alchemy, receber e normalizar transações pendentes. |
| `ethereum` | Consultar blocos e `eth_feeHistory` usando `viem`. |
| `pricing` | Manter a última cotação ETH/USD e seu horário de atualização. |
| `estimator` | Produzir a recomendação única de taxa a partir dos sinais recebidos. |
| `stream` | Expor o snapshot atual via SSE. |
| `persistence` | Persistir snapshots e dados de blocos no MongoDB. |

## Fluxo de dados

```text
Alchemy WSS ──┐
              ├─> API NestJS ─> estimador em memória ─> SSE ─> Next.js
Coinbase WSS ─┘                   │
                                  └─> MongoDB
```

1. A Alchemy envia as transações pendentes observadas pela sua infraestrutura.
2. O backend preserva somente uma janela deslizante recente da amostra em
   memória, por exemplo, dos últimos 30 segundos.
3. A cada intervalo curto, o estimador combina a amostra, a `baseFee` do bloco
   atual e dados de `eth_feeHistory` para gerar uma única taxa recomendada.
4. A cotação ETH/USD mais recente da Coinbase converte os valores monetários e
   tem o próprio horário de atualização registrado.
5. O backend publica um snapshot pronto aos clientes conectados por SSE e grava
   o histórico em intervalos controlados, por exemplo a cada cinco segundos e
   na chegada de um bloco.

O navegador nunca se conecta diretamente à Alchemy, Coinbase ou MongoDB.

## Mempool: o que será medido

`newPendingTransactions`, a assinatura JSON-RPC padrão, emite apenas hashes.
Buscar o restante dos dados para cada hash adicionaria uma chamada RPC por
transação. Para o MVP, o coletor usa a assinatura estendida
`alchemy_pendingTransactions` sem filtros e solicita objetos completos.

Assim, o backend recebe os campos necessários para analisar taxas sem a consulta
extra por evento. Transações EIP-1559 serão tratadas pelos campos de taxa máxima
e gorjeta; transações legadas, por `gasPrice`.

Uma mempool é local a cada nó: o indicador representa a amostra observada pela
Alchemy, não uma suposta mempool global. Esse limite aparecerá na interface e
nos metadados do snapshot como origem do dado. O valor estimado será validado
posteriormente contra as taxas realmente incluídas nos próximos blocos, para
medir erro e confiança por janela.

## MongoDB

O MongoDB não participa da atualização em tempo real. A fonte de verdade do
snapshot atual é a memória do processo do backend; o banco existe para o
histórico, gráficos e validação da estimativa.

A coleção `fee_snapshots` será uma série temporal com retenção por TTL. Cada
documento representa uma medição calculada, não uma transação individual da
mempool:

```ts
{
  timestamp: Date,
  metadata: { network: 'ethereum-mainnet' },
  recommendedMaxFeeGwei: number,
  recommendedPriorityFeeGwei: number,
  ethUsd: number,
  sampleSize: number,
  dataAgeMs: number,
  sources: { mempool: 'alchemy', price: 'coinbase' }
}
```

Uma coleção normal separada pode registrar blocos por número e hash, inclusive
eventuais reorganizações. Não dependemos de change streams para atualizar a
tela: SSE é publicado pelo próprio backend no momento do cálculo.

Se o MongoDB estiver indisponível, o serviço continua calculando e transmitindo
o snapshot ao vivo; a persistência é marcada como degradada e tenta reconectar.

## Resiliência e limites do MVP

- As duas conexões WebSocket usam heartbeat, reconexão com backoff e indicador
  de dado desatualizado no snapshot.
- O último snapshot conhecido permanece disponível após uma reconexão, com seu
  tempo de idade explícito.
- A chave da Alchemy fica somente nas variáveis de ambiente do backend.
- O primeiro MVP não inclui segundo RPC, fallback de cotação, Redis, fila,
  microsserviços, deploy de produção, envio de transações ou auditoria formal.
- A escolha de um limite de gás para converter a taxa em custo total de uma
  operação ainda é uma decisão de produto; esta arquitetura registra a taxa em
  Gwei e a cotação ETH/USD sem assumir um tipo de transação.

## Referências técnicas

- [Alchemy — `alchemy_pendingTransactions`](https://www.alchemy.com/docs/reference/alchemy-pendingtransactions)
- [Alchemy — limites e escopo de subscriptions](https://www.alchemy.com/docs/reference/subscription-api)
- [Coinbase Exchange — canal `ticker`](https://docs.cdp.coinbase.com/exchange/websocket-feed/channels)
- [MongoDB — índices para séries temporais](https://www.mongodb.com/docs/manual/core/timeseries/timeseries-index/)
