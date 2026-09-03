# Deploy coordenado com EasyPanel Compose

## Objetivo

Publicar o frontend Next.js e a API Express com um único acionamento de deploy,
sem reconstruir serviços que não mudaram e sem acoplar o ciclo de vida do
MongoDB aos releases da aplicação.

## Decisão de arquitetura

O EasyPanel terá dois recursos no mesmo projeto:

- um serviço MongoDB nativo, privado e persistente;
- um serviço Compose contendo `web` e `api`.

O MongoDB será provisionado uma vez e administrado pelo EasyPanel, preservando
credenciais internas, controles de recursos e backups lógicos. O Compose será a
unidade cotidiana de deploy: um único botão no painel ou um único Deployment
Trigger atualizará frontend e backend de forma coordenada.

O Compose completo com MongoDB foi rejeitado porque colocaria o banco no mesmo
ciclo de recriação da aplicação e reduziria as facilidades operacionais do
serviço MongoDB nativo. Três App Services independentes também foram rejeitados
porque exigiriam múltiplos deployments no EasyPanel.

## Artefatos de entrega

O repositório terá:

- `Dockerfile.api`, com build compilado e runtime mínimo da API;
- `Dockerfile.web`, com saída standalone do Next.js;
- `.dockerignore`, cobrindo dependências, builds, Git e arquivos de ambiente;
- `docker-compose.production.yml`, referenciando as imagens publicadas;
- `.github/workflows/deploy.yml`, responsável por detecção de mudanças, testes,
  builds seletivos, publicação e acionamento do Compose.

As imagens serão publicadas no GitHub Container Registry com uma tag móvel
`main` e uma tag imutável derivada do SHA do commit:

- `ghcr.io/${GHCR_NAMESPACE}/alphractal-api:main`;
- `ghcr.io/${GHCR_NAMESPACE}/alphractal-api:sha-${GIT_COMMIT_SHA}`;
- `ghcr.io/${GHCR_NAMESPACE}/alphractal-web:main`;
- `ghcr.io/${GHCR_NAMESPACE}/alphractal-web:sha-${GIT_COMMIT_SHA}`.

O namespace em minúsculas será fornecido pela variável de repositório
`GHCR_NAMESPACE`. As tags SHA permitirão rollback e auditoria sem alterar o
fluxo cotidiano baseado em `main`.

## Topologia do Compose

O Compose conterá somente `web` e `api`. Nenhum dos dois publicará portas do
host diretamente.

O serviço Compose usará fonte Git, branch `main`, Build Path `/` e o arquivo
`docker-compose.production.yml`. Dessa forma, cada acionamento obtém a versão
do Compose pertencente ao mesmo commit da aplicação. O modo inline não será
usado porque separaria o YAML versionado da fonte efetivamente executada.

O domínio HTTPS será configurado no EasyPanel e encaminhado ao serviço interno
`web` na porta 3000. O `web` encaminhará `/api/v1/*` para `http://api:3001`,
incluindo o stream SSE. A API acessará o MongoDB por meio da URL interna do
serviço nativo no mesmo projeto EasyPanel.

Cada serviço usará `pull_policy: always`. Assim, todo deploy consultará o GHCR;
um container será recriado quando a imagem resolvida tiver mudado, enquanto a
imagem inalterada continuará representando o mesmo artefato.

A API terá health check em `/health`. O frontend dependerá da saúde inicial da
API para a primeira subida da stack. A política `restart: unless-stopped` será
usada para recuperar falhas de processo sem transformar falhas persistentes em
um loop oculto de build.

## Configuração e segredos

O EasyPanel armazenará as variáveis de runtime do Compose em seu editor de
ambiente. O repositório não conterá credenciais.

A API receberá:

- `NODE_ENV=production`;
- `PORT=3001`;
- `ALCHEMY_HTTP_URL`;
- `ALCHEMY_WS_URL`;
- `COINBASE_WS_URL`;
- `MONGODB_URI`;
- `CORS_ORIGINS`;
- `FEE_INTERVAL_MS`;
- `SSE_HEARTBEAT_MS`;
- `PROVIDER_REQUEST_TIMEOUT_MS`.

O frontend receberá:

- `NODE_ENV=production`;
- `PORT=3000`;
- `HOSTNAME=0.0.0.0`;
- `API_SERVER_URL=http://api:3001`;
- `NEXT_PUBLIC_USE_MOCK_DATA=false`.

Como o rewrite atual do Next.js é resolvido durante o build,
`API_SERVER_URL=http://api:3001` também será fornecida como argumento não
secreto do build da imagem web. Chaves Alchemy, credenciais MongoDB e o hook do
EasyPanel nunca serão Docker build arguments.

O GitHub armazenará:

- `GHCR_NAMESPACE` e `API_SERVER_URL` como variables;
- `EASYPANEL_COMPOSE_DEPLOY_HOOK` como secret.

Se as imagens forem privadas, o EasyPanel armazenará também um usuário GitHub e
um personal access token com permissão mínima `read:packages`. O token de
publicação continuará sendo o `GITHUB_TOKEN` efêmero do workflow.

## Detecção de mudanças

O workflow iniciará para mudanças em código de aplicação, contratos
compartilhados, manifests, Dockerfiles, Compose ou no próprio workflow. Uma
etapa inicial classificará o conjunto alterado em `api` e `web`.

As regras serão:

| Mudança | API | Web |
| --- | --- | --- |
| `apps/api/**` | build | ignora |
| `apps/web/**` | ignora | build |
| `packages/contracts/**` | build | build |
| `package.json` ou `package-lock.json` | build | build |
| `tsconfig.base.json` ou configuração global de qualidade | build | build |
| `Dockerfile.api` | build | ignora |
| `Dockerfile.web` | ignora | build |
| `.dockerignore`, Compose ou workflow | build | build |
| somente documentação sem impacto operacional | ignora | ignora |

`workflow_dispatch` permitirá rebuild manual dos dois artefatos. Um push que
não corresponda aos caminhos operacionais não criará um deploy.

## Cache de build

O workflow usará duas camadas de cache:

- cache de downloads npm por `actions/setup-node`, indexado pelo
  `package-lock.json`;
- cache remoto do BuildKit no GitHub Actions, exportado em modo `max`.

Os escopos `alphractal-api` e `alphractal-web` serão separados para impedir que
uma imagem sobrescreva o cache da outra. Os Dockerfiles copiarão manifests e
lockfile antes do código-fonte, preservando a camada de `npm ci` quando somente
arquivos de aplicação mudarem.

O contexto Docker continuará sendo a raiz do monorepo, pois as duas imagens
dependem de `packages/contracts`. A saída final não incluirá fontes, caches ou
dependências de desenvolvimento desnecessárias.

## Fluxo de CI/CD

Em um push elegível na `main`, o workflow:

1. identifica se API, web ou ambos mudaram;
2. instala dependências com cache npm;
3. executa lint, typecheck e testes focados nos workspaces afetados, limitando o
   Vitest a no máximo dois forks;
4. constrói e publica apenas as imagens afetadas, reutilizando o cache BuildKit;
5. aguarda todos os builds selecionados terminarem com sucesso;
6. chama uma única vez `EASYPANEL_COMPOSE_DEPLOY_HOOK`;
7. o EasyPanel aplica `docker compose up --build -d` e, por causa de
   `pull_policy: always`, consulta as imagens atuais no GHCR.

O grupo de concorrência será único para o Compose e cancelará um deploy antigo
quando um commit mais recente chegar antes de sua conclusão. O hook nunca será
chamado quando validação ou publicação falhar.

## Comportamento operacional

O Compose oferece um único deploy coordenado, mas não garante uma troca atômica
nem zero downtime. A API permanecerá com uma única réplica para não duplicar
conexões Alchemy, coletas e estado SSE em memória. Durante uma recriação, uma
curta interrupção do stream é aceitável porque o frontend usa reconexão nativa
de `EventSource` e reconcilia o estado por REST.

O MongoDB não será reiniciado nem atualizado durante deployments da aplicação.
Mudanças de versão, credenciais, limites ou restauração do banco serão operações
separadas, precedidas por backup verificado.

## Falhas e rollback

- Falha de lint, tipo, teste ou build interrompe o workflow antes do deploy.
- Falha ao publicar uma das imagens impede o acionamento do Compose.
- Falha no hook preserva as imagens publicadas e permite repetir somente o
  deploy manualmente.
- Falha de inicialização aparece nos logs do serviço interno correspondente.
- Falha temporária do MongoDB mantém a API em seu modo degradado existente.
- Rollback consiste em fixar temporariamente as imagens do Compose nas tags SHA
  da versão anterior, fazer o deploy e depois decidir quando restaurar `main`.

Nenhum rollback de aplicação deve restaurar ou substituir automaticamente os
dados do MongoDB.

## Verificação

A entrega será considerada válida quando:

1. um build limpo produzir imagens `linux/amd64` executáveis para API e web;
2. um segundo build sem mudança relevante demonstrar cache hit nas camadas de
   dependências;
3. uma mudança somente na API publicar apenas a imagem da API;
4. uma mudança somente no web publicar apenas a imagem web;
5. uma mudança em contratos publicar ambas;
6. uma mudança somente documental não iniciar deploy;
7. o hook do Compose for chamado exatamente uma vez após builds bem-sucedidos;
8. o domínio público responder pelo web, REST e SSE;
9. a API alcançar o MongoDB pela rede privada sem expor a porta 27017;
10. uma recriação da API provocar reconexão e recuperação do frontend;
11. as tags SHA permitirem restaurar uma versão anterior das duas imagens;
12. um backup MongoDB externo e uma restauração de teste forem confirmados.

## Fora de escopo

- publicar `@alphractal/contracts` em um registry npm;
- expor API ou MongoDB diretamente à internet;
- múltiplas réplicas da API;
- migrations de dados MongoDB gerenciadas pelo Compose;
- criação automática do serviço MongoDB pelo workflow;
- zero downtime garantido ou deploy blue-green.
