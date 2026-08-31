# Arquitetura — Live Monitor de taxas Ethereum

## Objetivo

Entregar o MVP do **Live Monitor** da Alphractal para Ethereum Mainnet. O painel
transforma sinais da mempool e da cadeia em:

- uma recomendação única de Max Fee e Priority Fee em Gwei;
- o custo máximo estimado de uma transferência simples de ETH;
- a tendência da recomendação nas últimas 24 horas;
- uma confiança qualitativa e explicável;
- o histórico da recomendação;
- observação ao vivo e consulta pontual de blocos pós-EIP-1559.

O sistema é somente de leitura. Ele não assina, envia ou automatiza transações
on-chain.

## Decisões técnicas

| Área                | Decisão                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| Frontend            | Next.js com TypeScript                                                  |
| Backend             | Express sobre Node.js e TypeScript                                      |
| Dados Ethereum      | Alchemy RPC, com `viem` para consultas e tipos Ethereum                 |
| Mempool             | WebSocket `alchemy_pendingTransactions` da Alchemy                      |
| Blocos              | Cabeçalhos e blocos completos obtidos pela Alchemy                      |
| Cotação             | WebSocket público da Coinbase, produto `ETH-USD`                        |
| Atualização da tela | Um único stream SSE do backend para o frontend                          |
| Persistência        | MongoDB, com retenção de 30 dias                                        |
| Organização         | Monólito modular com DDD leve; sem fila, Redis ou microsserviços no MVP |

Express mantém o backend enxuto e explícito. O DDD leve preserva as regras de
estimativa, confiança e classificação fora de Express, Alchemy e MongoDB sem
introduzir padrões que o MVP ainda não exige.

## Decisões de produto

| Elemento         | Decisão                                                                             |
| ---------------- | ----------------------------------------------------------------------------------- |
| Rede             | Ethereum Mainnet fixa; seletor avançado permanece desabilitado para uso futuro      |
| Custo em USD     | Custo máximo de uma transferência nativa de ETH com 21.000 gas                      |
| Tendência de 24h | Variação entre medianas de janelas de cinco minutos separadas por 24 horas          |
| Confiança        | `High`, `Medium`, `Low` ou `Unavailable`, acompanhada de justificativas             |
| Composição       | Base Fee + Priority Fee; Max Fee aparece separadamente como teto                    |
| Histórico visual | Recommended Max Fee, com intervalos de 5m, 15m, 1h, 6h e 24h; padrão 1h             |
| Blocos recentes  | Últimos 20 blocos, três visíveis, com rolagem                                       |
| Pesquisa         | Número ou hash de bloco pós-EIP-1559, consultado sob demanda                        |
| Análise externa  | O MVP abre o bloco no Etherscan; análise interna fica para uma fase futura          |
| Navegação        | `Dashboard` e `History` permanecem visíveis e desabilitados; `Live Monitor` é ativo |

## Estrutura proposta

```text
apps/
  web/                   # Next.js: Live Monitor
  api/
    src/
      domain/
        fees/            # estimativa, confiança, tendência e valores de taxa
        blocks/          # resumo, finality e classificação de blocos
      application/
        fees/            # casos de uso de snapshot e histórico
        blocks/          # blocos recentes e consulta por identificador
      infrastructure/
        alchemy/         # mempool, RPC, cabeçalhos e blocos
        coinbase/        # cotação ETH/USD
        mongodb/         # snapshots e blocos observados
      interfaces/
        http/            # rotas e controllers Express
        sse/             # hub único do Live Monitor
      config/            # validação de variáveis de ambiente
packages/
  contracts/             # schemas Zod, tipos e fixtures compartilhados
docs/
  architecture.md
  api/fees-contract.md
```

## Fronteiras do monólito modular

O MVP possui dois módulos relacionados:

| Módulo   | Responsabilidade                                                                      |
| -------- | ------------------------------------------------------------------------------------- |
| `fees`   | Produzir snapshots, tendência, confiança e custo estimado da transferência            |
| `blocks` | Observar blocos, calcular métricas por bloco, acompanhar finality e atender pesquisas |

As camadas continuam separadas:

| Camada           | Responsabilidade                                                                 |
| ---------------- | -------------------------------------------------------------------------------- |
| `domain`         | Valores, regras puras e portas; não importa Express, `viem`, MongoDB ou ambiente |
| `application`    | Coordena casos de uso, publicação e persistência                                 |
| `infrastructure` | Implementa Alchemy, Coinbase e MongoDB                                           |
| `interfaces`     | Traduz REST e SSE para chamadas da aplicação                                     |

O domínio define portas como `SnapshotRepository`, `ObservedBlockRepository`,
`EthereumDataSource` e `LiveEventPublisher`. O `server.ts` atua como
_composition root_ e liga as portas aos adaptadores concretos.

## Fluxo de dados ao vivo

```text
Alchemy pending tx ──┐
Alchemy RPC/blocks ──┼─> aplicação ─> regras de fees ─> fee-snapshot ─┐
Coinbase ETH-USD ────┘          │                                  │
                               ├─> regras de blocks ─> block-* ─────┼─> SSE único ─> Next.js
                               │                                  │
                               └─> MongoDB (histórico de 30 dias) ┘
```

1. A Alchemy entrega transações pendentes completas e novos cabeçalhos.
2. O backend mantém uma janela deslizante da mempool, por exemplo 30 segundos.
3. A cada cinco segundos e na chegada de um bloco, o estimador produz um novo
   estado do snapshot.
4. A Coinbase mantém a cotação ETH/USD usada no custo estimado.
5. O backend publica eventos nomeados em um único SSE.
6. O MongoDB persiste snapshots válidos e blocos observados por 30 dias.

O navegador nunca se conecta diretamente à Alchemy, Coinbase ou MongoDB.

## Estimativa de taxas

O estimador combina:

- amostra recente da mempool;
- Base Fee do bloco atual;
- dados de `eth_feeHistory`;
- Priority Fees observadas;
- atualidade e estabilidade das fontes.

Transações EIP-1559 usam `maxFeePerGas` e `maxPriorityFeePerGas`. Transações
legadas usam `gasPrice`. A recomendação expõe:

- `recommendedMaxFeeGwei`: teto sugerido;
- `recommendedPriorityFeeGwei`: gorjeta sugerida;
- `baseFeeGwei`: Base Fee usada;
- `effectiveGasPriceGwei`: Base Fee + Priority Fee sugerida.

O cálculo ocorre a cada cinco segundos e na chegada de bloco. O SSE publica
automaticamente o resultado; o frontend não faz polling e não possui botão
`Refresh Data`.

## Custo estimado de transferência

O card em USD representa exclusivamente o custo máximo estimado de enviar ETH
de uma carteira comum para outra:

```text
maxCostEth = recommendedMaxFeeGwei × 10^-9 × 21.000
maxCostUsd = maxCostEth × ethUsd
```

O contrato inclui o tipo literal `native-eth-transfer` e `gasUnits: 21000` para
que a premissa não fique implícita. Transferências de tokens e interações com
contratos permanecem fora do MVP.

Se a Coinbase estiver desatualizada, o último custo permanece visível como
`stale`, com o horário da cotação. Isso não reduz a confiança da recomendação em
Gwei.

## Tendência de 24 horas

A tendência compara:

- a mediana de `recommendedMaxFeeGwei` dos últimos cinco minutos;
- a mediana da janela equivalente 24 horas antes.

Até existirem as duas janelas, o estado é `insufficient-history` e nenhum
percentual é fabricado.

## Confiança da recomendação

A confiança é qualitativa e considera apenas a recomendação em Gwei:

- atualidade da mempool e dos dados Ethereum;
- tamanho da amostra;
- estabilidade da distribuição recente de taxas.

O pior sinal determina o nível final. Os níveis são `high`, `medium`, `low` e
`unavailable`. O resultado inclui códigos de justificativa, permitindo que a
interface mostre explicações como `Fresh data`, `Stable fees` e `Strong sample`.

Coinbase e MongoDB possuem estados próprios e não reduzem essa confiança. Quando
os dados da Alchemy deixam de ser suficientes, o último valor permanece como
`last-known`, sua idade continua aumentando e a confiança passa a
`unavailable`. Nenhuma nova estimativa é fabricada.

## Observação e consulta de blocos

O backend mantém os 20 blocos mais recentes. O frontend exibe três deles por vez
e oferece rolagem. Para cada bloco, o backend calcula:

- Base Fee;
- mediana das Priority Fees efetivamente pagas;
- Effective Gas Price = Base Fee + mediana da Priority Fee;
- utilização = `gasUsed / gasLimit`;
- quantidade de transações;
- nível `low`, `normal`, `elevated` ou `high`;
- finality `latest`, `safe` ou `finalized`;
- URL canônica do Etherscan.

O nível compara o Effective Gas Price do bloco com os percentis da última hora:

- abaixo de P25: `low`;
- P25 até abaixo de P75: `normal`;
- P75 até abaixo de P90: `elevated`;
- P90 ou acima: `high`.

Até existirem ao menos 20 blocos na janela, a classificação é `unavailable`.

A pesquisa aceita número decimal ou hash e consulta a Alchemy sob demanda. O
resultado substitui temporariamente o detalhe selecionado, não entra na lista
dos 20 recentes e oferece `Back to Live`. Blocos anteriores ao 12965000,
ativação da London Upgrade na Mainnet, ficam fora do MVP e retornam erro
explícito.

`Analyze Block` abre o bloco no Etherscan. A futura análise interna poderá
reutilizar o mesmo recurso sem alterar o coletor.

## REST e SSE

Os recursos REST são:

- `GET /api/v1/fees/current`;
- `GET /api/v1/fees/history`;
- `GET /api/v1/blocks/recent`;
- `GET /api/v1/blocks/:numberOrHash`.

Um único `GET /api/v1/live/stream` publica eventos:

- `fee-snapshot`;
- `block-added`;
- `block-status-changed`.

O stream usa heartbeat, retry e reconexão nativa de `EventSource`. Após uma
reconexão, o frontend busca novamente o snapshot atual e os blocos recentes,
pois o MVP não garante replay de eventos perdidos.

## MongoDB

`fee_snapshots` é uma coleção de série temporal. Cada documento representa uma
medição calculada, nunca uma transação individual da mempool.

`observed_blocks` é uma coleção normal, indexada por número e hash, usada para:

- restaurar a lista recente após reinício;
- calcular percentis da última hora;
- atualizar os estados `safe` e `finalized`;
- apoiar validações futuras do estimador.

As duas coleções possuem retenção de 30 dias. O MongoDB não participa do caminho
crítico do SSE. Se ficar indisponível, o backend continua calculando em memória,
publicando dados ao vivo e tentando reconectar. O histórico fica degradado.

## Estado da interface

O frontend apresenta:

- `Live`: SSE conectado e fontes atuais;
- `Degraded`: SSE conectado, mas alguma fonte ou persistência está degradada;
- `Offline`: SSE desconectado;
- `Updated … ago` com base no último evento recebido.

O bloco mais recente é selecionado inicialmente. Novos blocos atualizam a lista,
mas não interrompem uma seleção anterior; a interface sinaliza
`New block available`.

## Resiliência e limites do MVP

- WebSockets usam heartbeat e reconexão com backoff.
- O último snapshot conhecido permanece disponível com idade explícita.
- Chaves da Alchemy ficam somente no backend.
- Não há segundo RPC, fallback de cotação, Redis, fila ou microsserviços.
- Não há autenticação, escrita on-chain ou envio de transações.
- Não há suporte a blocos pré-EIP-1559.
- Não há múltiplas redes, filtros avançados funcionais ou análise interna de
  blocos.
- `Dashboard` e `History` permanecem desabilitados.

## Referências técnicas

- [EIP-1559 — mercado de taxas e limite de mudança da Base Fee](https://eips.ethereum.org/EIPS/eip-1559)
- [EIP-6953 — ativações por bloco, incluindo London](https://eips.ethereum.org/EIPS/eip-6953)
- [Alchemy — `alchemy_pendingTransactions`](https://www.alchemy.com/docs/reference/alchemy-pendingtransactions)
- [Alchemy — limites e escopo de subscriptions](https://www.alchemy.com/docs/reference/subscription-api)
- [Coinbase Exchange — canal `ticker`](https://docs.cdp.coinbase.com/exchange/websocket-feed/channels)
- [MongoDB — índices para séries temporais](https://www.mongodb.com/docs/manual/core/timeseries/timeseries-index/)
