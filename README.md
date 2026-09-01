# Alphractal

Monitor em tempo real de taxas e blocos da Ethereum Mainnet. O Alphractal
combina dados da Alchemy com a cotação pública ETH/USD da Coinbase para exibir
uma recomendação de taxa, estimar o custo de uma transferência e acompanhar
blocos recentes em um dashboard web.

> O projeto é somente de leitura: ele não conecta carteiras, assina transações
> nem envia operações para a blockchain.

## Sobre o projeto

O Alphractal transforma sinais da mempool e da blockchain em informações mais
fáceis de interpretar. O backend calcula as métricas, mantém o último estado em
memória, transmite atualizações por Server-Sent Events (SSE) e, quando o
MongoDB está configurado, persiste o histórico por até 30 dias.

O navegador nunca acessa diretamente a Alchemy, a Coinbase ou o MongoDB. O
frontend Next.js encaminha as requisições feitas em `/api/v1` para a API
Express, mantendo as credenciais somente no servidor.

## Funcionalidades

- recomendação de Max Fee e Priority Fee em Gwei;
- composição da taxa com Base Fee e Effective Gas Price;
- custo máximo estimado em USD para uma transferência nativa de ETH com
  21.000 unidades de gas;
- tendência e nível de confiança da recomendação;
- gráfico de histórico em diferentes intervalos de tempo;
- atualizações em tempo real, com estados `Live`, `Degraded` e `Offline`;
- lista e catálogo paginado de blocos observados;
- pesquisa de bloco por número decimal ou hash;
- classificação de taxa, utilização e finality dos blocos;
- acesso ao bloco correspondente no Etherscan.

## Como funciona

```text
Alchemy HTTP/WebSocket ─┐
                        ├─> API Express ─> regras de fees e blocks ─> REST/SSE ─> Next.js
Coinbase WebSocket ─────┘                         │
                                                 └─> MongoDB opcional
```

1. A Alchemy fornece transações pendentes, dados de taxas e blocos da Ethereum
   Mainnet.
2. A Coinbase fornece a cotação pública do par `ETH-USD` por WebSocket.
3. A API calcula recomendações e métricas sem expor os provedores ao navegador.
4. O frontend busca o estado inicial por REST e recebe atualizações ao vivo por
   um único stream SSE.
5. O MongoDB armazena snapshots e blocos observados. Se ele não estiver
   configurado, o tempo real continua funcionando em memória, mas o histórico
   fica indisponível ou degradado.

## Arquitetura

O repositório é um monorepo npm organizado como um monólito modular:

| Parte | Responsabilidade |
| --- | --- |
| `apps/web` | Dashboard Next.js e integração same-origin com a API |
| `apps/api` | API Express, monitoramento, regras de domínio e adaptadores externos |
| `packages/contracts` | Schemas Zod e tipos compartilhados entre backend e frontend |
| MongoDB | Histórico opcional de snapshots e blocos observados |

Na API, as regras são separadas em quatro áreas:

- `domain`: cálculos e regras puras de taxas e blocos;
- `application`: coordenação dos casos de uso;
- `infrastructure`: integrações com Alchemy, Coinbase e MongoDB;
- `interfaces`: rotas HTTP e stream SSE.

Mais detalhes estão em [docs/architecture.md](docs/architecture.md).

## Tecnologias

- Node.js 24 e npm 11;
- TypeScript;
- Next.js 16 e React 19;
- Express 5;
- Alchemy RPC e WebSocket, com `viem`;
- Coinbase Exchange WebSocket;
- MongoDB 8;
- Zod para contratos e validação;
- Vitest e Testing Library para testes;
- Docker Compose para o MongoDB local.

## Estrutura do repositório

```text
.
├── apps/
│   ├── api/                 # backend Express
│   │   ├── src/
│   │   └── test/
│   └── web/                 # frontend Next.js
│       ├── src/
│       └── test/
├── packages/
│   └── contracts/           # DTOs, schemas Zod e tipos compartilhados
├── docs/                    # arquitetura e contratos da API
├── .env.example             # exemplo de configuração do backend
├── docker-compose.yml       # MongoDB para desenvolvimento
└── package.json             # scripts e workspaces do monorepo
```

## Pré-requisitos

Obrigatórios:

- [Git](https://git-scm.com/);
- Node.js `>=24 <25`;
- npm `>=11 <12`;
- uma aplicação da Alchemy com acesso à Ethereum Mainnet e suas URLs HTTP e
  WebSocket.

Opcional:

- Docker Desktop no Windows ou Docker Engine com o plugin Compose no Linux,
  caso queira persistência e histórico local no MongoDB.

Confira as versões instaladas:

```bash
node --version
npm --version
docker --version
docker compose version
```

## Configuração

O backend lê o arquivo `.env` da raiz. As duas variáveis da Alchemy devem ser
preenchidas com a chave da sua aplicação:

```env
PORT=3001
ALCHEMY_HTTP_URL=https://eth-mainnet.g.alchemy.com/v2/replace-with-your-key
ALCHEMY_WS_URL=wss://eth-mainnet.g.alchemy.com/v2/replace-with-your-key
COINBASE_WS_URL=wss://ws-feed.exchange.coinbase.com
CORS_ORIGINS=http://localhost:3000
FEE_INTERVAL_MS=5000
SSE_HEARTBEAT_MS=15000
PROVIDER_REQUEST_TIMEOUT_MS=10000
```

Para usar o MongoDB via Docker Compose, mantenha também:

```env
MONGO_INITDB_ROOT_USERNAME=alphractal
MONGO_INITDB_ROOT_PASSWORD=alphractal_dev_password
MONGO_INITDB_DATABASE=alphractal
MONGODB_URI=mongodb://alphractal:alphractal_dev_password@localhost:27017/alphractal?authSource=admin
```

Para rodar sem Docker e sem persistência, remova ou comente `MONGODB_URI`. As
variáveis `MONGO_INITDB_*` são consumidas apenas pelo Docker Compose.

O frontend lê `apps/web/.env.local`:

```env
API_SERVER_URL=http://localhost:3001
NEXT_PUBLIC_USE_MOCK_DATA=false
```

`API_SERVER_URL` é usada somente pelo servidor Next.js. Não coloque a chave da
Alchemy em variáveis `NEXT_PUBLIC_*` nem em arquivos do frontend.

## Como rodar no Linux

Os comandos também funcionam no WSL. No terminal:

```bash
git clone https://github.com/AnaCelia1827/ProjetoAlphafracta.git
cd ProjetoAlphafracta
npm install
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
```

Edite `.env` e substitua `replace-with-your-key` nas URLs HTTP e WebSocket da
Alchemy.

Se quiser histórico local, inicie o MongoDB:

```bash
docker compose up -d mongo
docker compose ps
```

Sem Docker, remova ou comente `MONGODB_URI` no `.env`.

Abra dois terminais na raiz do projeto. No primeiro, inicie a API:

```bash
npm run dev:api
```

No segundo, inicie o frontend:

```bash
npm run dev:web
```

Acesse [http://localhost:3000](http://localhost:3000).

## Como rodar no Windows

Use PowerShell, Windows Terminal ou o terminal integrado do VS Code. O Docker
Desktop precisa estar aberto caso você queira usar o MongoDB.

```powershell
git clone https://github.com/AnaCelia1827/ProjetoAlphafracta.git
Set-Location ProjetoAlphafracta
npm install
Copy-Item .env.example .env
Copy-Item apps/web/.env.example apps/web/.env.local
```

Abra `.env` em um editor e substitua `replace-with-your-key` nas URLs HTTP e
WebSocket da Alchemy.

Se quiser histórico local, inicie o MongoDB:

```powershell
docker compose up -d mongo
docker compose ps
```

Sem Docker, remova ou comente `MONGODB_URI` no `.env`.

Abra duas janelas do PowerShell na raiz do projeto. Na primeira, inicie a API:

```powershell
npm run dev:api
```

Na segunda, inicie o frontend:

```powershell
npm run dev:web
```

Acesse [http://localhost:3000](http://localhost:3000).

## Endereços locais

| Serviço | Endereço padrão |
| --- | --- |
| Dashboard | [http://localhost:3000](http://localhost:3000) |
| API | `http://localhost:3001` |
| Health check | [http://localhost:3001/health](http://localhost:3001/health) |
| MongoDB | `mongodb://localhost:27017` |

O frontend encaminha `/api/v1/*` para o endereço definido em
`API_SERVER_URL`. Se mudar `PORT` no backend, atualize essa variável no
frontend e reinicie os dois processos.

## API

### REST

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/health` | Verifica se o processo da API está respondendo |
| `GET` | `/api/v1/fees/current` | Retorna o snapshot atual de taxas |
| `GET` | `/api/v1/fees/history` | Consulta o histórico por intervalo de tempo |
| `GET` | `/api/v1/blocks/recent` | Retorna a janela de blocos recentes |
| `GET` | `/api/v1/blocks/history` | Retorna o catálogo paginado de blocos observados |
| `GET` | `/api/v1/blocks/:numberOrHash` | Pesquisa um bloco por número ou hash |

O histórico de taxas aceita `from`, `to`, `limit` e `cursor`. O catálogo de
blocos aceita `limit` e `cursor`. Datas são enviadas no formato ISO 8601.

### SSE

`GET /api/v1/live/stream` mantém um stream com os eventos:

- `fee-snapshot`;
- `block-added`;
- `block-status-changed`.

Após uma reconexão, o frontend atualiza novamente o snapshot e os blocos por
REST, pois o MVP não mantém replay dos eventos perdidos.

## Comandos úteis

Execute os comandos na raiz do monorepo:

| Comando | Finalidade |
| --- | --- |
| `npm run dev:api` | Inicia a API em modo de desenvolvimento |
| `npm run dev:web` | Inicia o frontend em modo de desenvolvimento |
| `npm run typecheck` | Verifica os tipos de todos os workspaces |
| `npm run lint` | Executa o ESLint em todos os workspaces |
| `npm run format:check` | Confere a formatação com Prettier |
| `npm run build` | Gera os builds disponíveis nos workspaces |

Para evitar consumo excessivo de memória, execute as suítes de teste uma por
vez e limite o Vitest a dois forks:

```bash
npm run test --workspace @alphractal/contracts -- --pool=forks --poolOptions.forks.maxForks=2
npm run test --workspace @alphractal/api -- --pool=forks --poolOptions.forks.maxForks=2
npm run test --workspace web -- --pool=forks --poolOptions.forks.maxForks=2
```

Para parar o MongoDB sem apagar os dados:

```bash
docker compose stop mongo
```

## Solução de problemas

### A API encerra ao iniciar

Confira se `.env` existe na raiz e se `ALCHEMY_HTTP_URL` usa `https://`,
`ALCHEMY_WS_URL` usa `wss://` e `CORS_ORIGINS` contém uma origem HTTP explícita.
Os placeholders da Alchemy não funcionam até serem substituídos por uma chave
válida.

### O dashboard abre, mas não recebe dados

Confirme que a API está ativa em [http://localhost:3001/health](http://localhost:3001/health),
que `API_SERVER_URL` aponta para a mesma porta e que o frontend foi reiniciado
depois de alterar `apps/web/.env.local`.

### O histórico aparece indisponível

Isso é esperado no modo sem MongoDB. Se quiser persistência, execute
`docker compose up -d mongo`, confira `docker compose ps` e mantenha uma
`MONGODB_URI` válida no `.env`.

### A porta 3000 ou 3001 já está em uso

Encerre o processo que ocupa a porta ou altere `PORT` no `.env`. Ao mudar a
porta da API, atualize também `API_SERVER_URL`.

### O PowerShell bloqueia `npm.ps1`

Use o executável `npm.cmd` no lugar de `npm`, por exemplo
`npm.cmd run dev:api`, ou execute os comandos pelo Prompt de Comando.

## Limitações atuais

- somente Ethereum Mainnet;
- sem autenticação, carteiras ou envio de transações;
- sem suporte a blocos anteriores à ativação da EIP-1559 na Mainnet;
- sem fallback para um segundo provedor RPC ou de cotação;
- histórico dependente do MongoDB;
- navegações avançadas, múltiplas redes e análise interna de blocos ainda não
  fazem parte do MVP.

## Documentação adicional

- [Arquitetura do Live Monitor](docs/architecture.md)
- [Contrato da API de taxas](docs/api/fees-contract.md)
- [Documentação específica do frontend](apps/web/README.md)
