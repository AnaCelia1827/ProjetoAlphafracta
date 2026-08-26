# Atualização dos cartões de backend no Trello

## Objetivo

Atualizar os sete cartões abertos marcados como `[BACKEND]` no quadro
Alphractal para que representem a arquitetura atual descrita em
`docs/architecture.md`.

## Escopo

Os cartões serão preservados nas listas onde já estão. Responsáveis, prazos,
etiquetas e estado de conclusão não serão alterados. Cada cartão receberá um
título e uma descrição alinhados ao monólito modular em `apps/api`, com
Express, TypeScript e DDD leve.

## Mapeamento

| Cartão existente | Responsabilidade atualizada |
| --- | --- |
| Setup do backend | Estrutura `apps/api`, configuração validada e composition root. |
| Docker do MongoDB | Serviço local MongoDB e suporte a snapshots de série temporal com TTL. |
| Módulo de mempool | Adaptador Alchemy WSS, reconexão e janela deslizante em memória. |
| Módulo Ethereum | Consulta de `baseFee` e `eth_feeHistory` por `viem`. |
| Módulo estimator | Regra pura de recomendação e caso de uso de geração de snapshots. |
| Módulo stream | Hub SSE e endpoint de atualização do painel. |
| Módulo persistence | Repositório MongoDB, persistência controlada e operação degradada. |

## Critérios de conclusão

Cada descrição deverá indicar o resultado esperado, os limites de
responsabilidade e critérios verificáveis de aceite. A divisão não introduzirá
Redis, filas, microsserviços, conexão direta do navegador aos provedores ou
persistência de transações individuais da mempool.
