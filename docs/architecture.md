# Arquitetura — Monitoramento de taxas Ethereum em tempo real

## Objetivo

Entregar um MVP isolado para a aba **Fees** da Alphractal. O painel deve
transformar sinais ao vivo da mempool Ethereum em uma única recomendação de
taxa em Gwei, exibir a cotação ETH/USD usada como contexto e manter um histórico
consultável.

O sistema é somente de leitura. Ele não assina, envia ou automatiza transações
on-chain.

## Decisões

| Área | Decisão |
| --- | --- |
| Frontend | Next.js com TypeScript |
| Backend | Express sobre Node.js e TypeScript |
| Dados Ethereum | Alchemy RPC, com `viem` para consultas e tipos Ethereum |
| Mempool | WebSocket `alchemy_pendingTransactions` da Alchemy |
| Cotação | WebSocket público da Coinbase, produto `ETH-USD` |
| Atualização da tela | Server-Sent Events (SSE) do backend para o frontend |
| Persistência | MongoDB, com coleção de séries temporais para snapshots |
| Organização | Monólito modular com DDD leve; não usar fila, Redis ou microsserviços no MVP |

Express mantém o backend enxuto e explícito para este protótipo independente.
O DDD leve preserva as regras de estimativa fora de Express, Alchemy e MongoDB,
sem introduzir padrões complexos que o MVP ainda não exige.

## Estrutura proposta

```text
apps/
  web/                 # Next.js: painel Fees
  api/                 # Express: ingestão, cálculo, SSE e API
    src/
      domain/fees/      # regras puras de estimativa e suas interfaces
      application/fees/ # casos de uso
      infrastructure/   # Alchemy, Coinbase e MongoDB
      interfaces/       # rotas, controllers Express e SSE
      config/           # validação das variáveis de ambiente
packages/
  contracts/           # DTOs compartilhados entre API e frontend
docs/
  architecture.md
```

## DDD leve

O contexto de domínio único do MVP é `fee-monitoring`: ele responde qual taxa
única deve ser recomendada naquele instante. As responsabilidades ficam
separadas por camada:

| Camada | Responsabilidade |
| --- | --- |
| `domain/fees` | Valores de domínio, como Gwei e recomendação de taxa, e a regra pura de estimativa. Não importa Express, `viem`, MongoDB ou variáveis de ambiente. |
| `application/fees` | Casos de uso que coordenam a atualização, consulta e publicação de um snapshot. |
| `infrastructure` | Adaptadores concretos para Alchemy, Coinbase e MongoDB. |
| `interfaces` | Rotas, controllers Express e hub SSE que traduzem HTTP em chamadas da aplicação. |

O domínio define portas, como `SnapshotRepository` e
`LiveSnapshotPublisher`. Em `server.ts`, o *composition root* conecta essas
portas às implementações concretas `MongoSnapshotRepository` e `SseHub`.
Assim, a regra de cálculo não muda se um provedor ou banco for substituído.

## Fluxo de dados

```text
Alchemy WSS ──┐
              ├─> API Express ─> estimador em memória ─> SSE ─> Next.js
Coinbase WSS ─┘                   │
                                  └─> MongoDB
```

1. A Alchemy envia as transações pendentes observadas pela sua infraestrutura.
2. O backend preserva somente uma janela deslizante recente da amostra em
   memória, por exemplo, dos últimos 30 segundos.
3. A cada intervalo curto, o estimador combina a amostra, a `baseFee` do bloco
   atual e dados de `eth_feeHistory` para gerar uma única taxa recomendada.
4. A cotação ETH/USD mais recente da Coinbase é associada ao snapshot e tem seu
   próprio horário de atualização registrado.
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
- O painel exibe a taxa recomendada em Gwei e a cotação ETH/USD. Ele não estima
  o custo total de uma operação: isso exigiria definir o gas usado por uma
  transferência ou contrato específico, o que está fora do MVP.

## Referências técnicas

- [Alchemy — `alchemy_pendingTransactions`](https://www.alchemy.com/docs/reference/alchemy-pendingtransactions)
- [Alchemy — limites e escopo de subscriptions](https://www.alchemy.com/docs/reference/subscription-api)
- [Coinbase Exchange — canal `ticker`](https://docs.cdp.coinbase.com/exchange/websocket-feed/channels)
- [MongoDB — índices para séries temporais](https://www.mongodb.com/docs/manual/core/timeseries/timeseries-index/)
