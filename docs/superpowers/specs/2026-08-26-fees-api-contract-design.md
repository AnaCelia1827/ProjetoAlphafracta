# Design do contrato de comunicacao da API Fees

## Objetivo

Definir uma fronteira estavel e executavel entre o frontend Next.js e o backend
Express para o MVP de monitoramento de taxas Ethereum da Alphractal. O contrato
deve permitir que as duas aplicacoes sejam desenvolvidas em paralelo sem DTOs
duplicados ou interpretacoes concorrentes dos endpoints.

## Fonte de verdade e escopo

`docs/architecture.md` e a fonte de verdade arquitetural. O contrato normativo
de comunicacao fica em `docs/api/fees-contract.md`; `packages/contracts` sera a
implementacao executavel desse documento.

O design cobre somente a aba Fees:

- ultimo snapshot conhecido;
- historico de snapshots para graficos;
- atualizacoes ao vivo por SSE.

Continuam fora do escopo autenticacao, escrita on-chain, conexao direta do
navegador a Alchemy, Coinbase ou MongoDB, deploy de producao, Redis, filas e
microsservicos.

## Abordagem escolhida

A equipe primeiro revisa e aprova o contrato em Markdown. Em seguida,
`packages/contracts` implementa schemas Zod, tipos inferidos e fixtures. Essa
abordagem foi escolhida em vez de OpenAPI-first ou interfaces TypeScript puras
porque combina revisao humana simples com validacao de runtime e funciona sem
geracao de codigo no monorepo.

OpenAPI pode ser gerado posteriormente para documentar REST. O protocolo SSE
continua documentado explicitamente porque OpenAPI nao representa todo o seu
ciclo de conexao e reconexao.

## Superficie HTTP

| Endpoint | Responsabilidade |
| --- | --- |
| `GET /api/v1/fees/current` | Retornar o ultimo `FeeSnapshot`. |
| `GET /api/v1/fees/history` | Retornar snapshots persistidos em ordem cronologica e com paginacao por cursor. |
| `GET /api/v1/fees/stream` | Publicar o ultimo snapshot e os proximos calculos por SSE. |
| `GET /health` | Verificar a infraestrutura; fica fora do contrato de dominio Fees. |

Os endpoints REST usam envelopes JSON, request ID, CORS configurado e
`Cache-Control: no-store`. O stream usa `text/event-stream`, evento
`fee-snapshot`, retry de tres segundos e heartbeat de 15 segundos.

## Modelo compartilhado

`FeeSnapshot` e o unico modelo de medicao exposto. Ele inclui:

- instante de calculo e rede `ethereum-mainnet`;
- taxa maxima e taxa de prioridade recomendadas em Gwei;
- cotacao ETH/USD usada;
- tamanho da amostra e idade do dado mais antigo;
- provedores Alchemy e Coinbase;
- instante de atualizacao de cada fonte;
- estados de atualidade da mempool e do preco;
- estado `available` ou `degraded` da persistencia.

O payload detalhado, suas restricoes e exemplos ficam em
`docs/api/fees-contract.md`. O mesmo envelope e usado por `/current` e pelo
evento SSE; `/history` retorna uma lista do mesmo recurso.

## Fluxo de dados

O backend recebe a mempool e dados Ethereum da Alchemy e a cotacao ETH/USD da
Coinbase. O caso de uso calcula um snapshot em memoria. O snapshot e publicado
diretamente no hub SSE e persistido em intervalo controlado no MongoDB.

`/current` consulta o estado em memoria. `/stream` acompanha a publicacao do
caso de uso sem depender do banco. `/history` consulta exclusivamente os
snapshots persistidos. Assim, falha do MongoDB degrada o historico, mas nao
interrompe o painel ao vivo.

## Resiliencia e erros

O ultimo snapshot permanece disponivel durante reconexoes dos provedores. Os
campos `fresh`, `stale`, `available`, `degraded` e `dataAgeMs` tornam a
degradacao explicita sem fabricar precisao.

REST usa um envelope unico de erro com `code`, `message`, `requestId` e
`details` opcional. O contrato distingue query invalida, intervalo invalido,
snapshot ainda indisponivel, historico indisponivel, rota inexistente e falha
interna. Nenhuma resposta expoe stack trace, segredo ou mensagem bruta de
provedor.

Uma conexao SSE estabelecida nao e encerrada por falhas de fonte ou banco. O
cliente usa a reconexao nativa de `EventSource` e recebe o snapshot mais recente
ao voltar. Replay completo de eventos nao faz parte do MVP.

## Fronteiras de implementacao

| Unidade | Responsabilidade |
| --- | --- |
| `docs/api/fees-contract.md` | Semantica, endpoints, payloads, erros, compatibilidade e exemplos. |
| `packages/contracts` | Schemas Zod, tipos inferidos e fixtures compartilhadas. |
| `apps/api` | Validar entrada e produzir respostas compativeis com os schemas. |
| `apps/web` | Validar REST/SSE e apresentar estados normal, stale, degraded e unavailable. |
| Testes de integracao | Provar que a API real entrega o contrato consumido pelo frontend. |

Nao serao criados DTOs equivalentes dentro de `apps/api` ou `apps/web`.

## Desenvolvimento paralelo

A implementacao acontece em tres ondas:

1. Implementar e testar `packages/contracts` a partir do contrato aprovado.
2. Fixar o commit do pacote e iniciar frontend e backend em paralelo, cada um
   em uma trilha isolada.
3. Integrar as duas trilhas e executar testes de contrato e integracao.

Essa dependencia inicial curta evita que os dois lados inventem formatos
durante o trabalho paralelo. Mudancas posteriores no contrato exigem alterar o
Markdown, os schemas, as fixtures e os testes no mesmo commit.

## Versionamento

A API comeca em `/api/v1`. Campos opcionais podem ser adicionados de forma
compativel, e consumidores devem ignorar campos desconhecidos. Remocao,
renomeacao, mudanca de tipo ou alteracao de semantica exige `/api/v2`. Novos
valores de enum exigem revisao dos consumidores antes de entrar na `v1`.

## Estrategia de testes

### Contratos

- validar fixtures canonicas de snapshots, historico, erros e eventos SSE;
- rejeitar datas invalidas, numeros negativos, `NaN`, enums desconhecidos e
  campos obrigatorios ausentes;
- inferir todos os tipos TypeScript dos schemas Zod.

### Backend

- testar status, headers e bodies com Supertest;
- validar respostas reais contra os schemas compartilhados;
- cobrir ausencia de snapshot, query e cursor invalidos e MongoDB indisponivel;
- testar framing SSE, primeiro evento, heartbeat e reconexao;
- substituir Alchemy, Coinbase e MongoDB por adaptadores falsos.

### Frontend

- consumir somente fixtures de `packages/contracts`;
- cobrir carregamento atual, serie historica e atualizacoes SSE;
- apresentar estados stale, degraded e unavailable;
- rejeitar payload incompativel sem renderizar dados corrompidos;
- simular queda e reconexao de `EventSource`.

### Integracao

- provar os tres endpoints contra os schemas compartilhados;
- compilar frontend e backend separadamente contra o mesmo pacote;
- limitar Vitest a no maximo dois workers ou forks para respeitar os recursos
  da maquina.

## Criterios de conclusao

- O contrato Markdown, os schemas e as fixtures descrevem os mesmos formatos.
- Os tres endpoints atendem aos casos de sucesso e degradacao documentados.
- Frontend e backend nao possuem DTOs duplicados.
- Cada aplicacao pode ser desenvolvida e testada isoladamente.
- A integracao falha automaticamente diante de mudanca incompativel.

