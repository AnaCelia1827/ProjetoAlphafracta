# Deploy no EasyPanel

## Arquitetura

O projeto usa dois recursos dentro do mesmo projeto do EasyPanel:

- um MongoDB nativo, privado e persistente;
- um serviço Compose contendo `api` e `web`.

Somente `web:3000` recebe um domínio público. A API é acessada pelo rewrite
same-origin do Next.js em `/api/v1/*`, e MongoDB e API permanecem na rede
privada. `packages/contracts` não é um terceiro serviço: ele é incorporado aos
artefatos da API e do frontend durante seus builds.

## 1. Preparar o primeiro build no GitHub

Em **Settings > Secrets and variables > Actions > Variables**, crie:

- `GHCR_NAMESPACE=anacelia1827`;
- `API_SERVER_URL=http://api:3001`;
- `EASYPANEL_DEPLOY_ENABLED=false`.

Ainda não cadastre o hook. O primeiro workflow deve testar e publicar as
imagens sem tentar acessar um Compose que ainda não existe.

Depois que a implementação entrar em `main`, abra a execução **Build and deploy
Compose**. Confirme que `build-api`, `build-web` e `promote` passaram e que
`deploy` foi ignorado.

## 2. Tornar as imagens públicas

Abra os packages `alphractal-api` e `alphractal-web` no GitHub, entre em
**Package settings > Danger Zone > Change visibility** e selecione **Public**
para ambos.

O serviço Compose fará pull anônimo do GHCR. Não armazene um personal access
token de packages na VPS. Essa escolha é compatível com o projeto porque o
código-fonte e os artefatos da aplicação já são públicos; os segredos são
injetados apenas em runtime pelo EasyPanel.

## 3. Criar o MongoDB nativo

No mesmo projeto EasyPanel que receberá a aplicação:

1. crie um serviço MongoDB chamado `alphractal-mongo`;
2. mantenha **Expose** desabilitado;
3. defina uma senha forte e exclusiva;
4. copie a URL interna apresentada na área de credenciais;
5. configure a URI para usar o banco `alphractal` e preserve o
   `authSource` indicado na credencial;
6. configure um backup lógico diário em armazenamento externo;
7. teste uma restauração fora do banco de produção.

A URL interna completa será usada como `MONGODB_URI` no Compose. Ela nunca deve
ser salva no repositório, em Actions variables ou em argumentos de build.

## 4. Criar o serviço Compose

Crie um **Compose Service** com fonte Git e informe:

- Repository: `https://github.com/AnaCelia1827/ProjetoAlphafracta.git`;
- Branch: `main`;
- Build Path: `/`;
- Docker Compose File: `docker-compose.production.yml`.

Como o repositório e as duas imagens são públicos, não é necessário configurar
deploy key nem credencial de registry.

No editor de ambiente do Compose, configure:

```env
GHCR_NAMESPACE=anacelia1827
ALCHEMY_HTTP_URL=valor-secreto-configurado-no-easypanel
ALCHEMY_WS_URL=valor-secreto-configurado-no-easypanel
COINBASE_WS_URL=wss://ws-feed.exchange.coinbase.com
MONGODB_URI=url-interna-configurada-no-easypanel
CORS_ORIGINS=https://origem-final-do-frontend
FEE_INTERVAL_MS=5000
SSE_HEARTBEAT_MS=15000
PROVIDER_REQUEST_TIMEOUT_MS=10000
```

Substitua os valores descritivos somente no EasyPanel. Em `CORS_ORIGINS`, use
a origem HTTPS exata, sem caminho e sem barra final.

Adicione um domínio HTTPS para o serviço interno `web`, protocolo HTTP, porta 3000. Não crie domínio ou porta publicada para `api` ou MongoDB.

## 5. Fazer o primeiro deploy manual

Pressione **Deploy** uma vez no serviço Compose. A sequência esperada é:

1. o EasyPanel baixa `alphractal-api:main` e `alphractal-web:main`;
2. a API inicia e responde em `/health` dentro da rede privada;
3. o frontend inicia depois do health check da API;
4. o domínio público passa a servir a aplicação.

Se a API não ficar saudável, confira primeiro `ALCHEMY_HTTP_URL`,
`ALCHEMY_WS_URL`, `MONGODB_URI` e `CORS_ORIGINS` nos logs e no ambiente do
Compose. Não exponha uma porta da API para contornar falhas de rede interna.

## 6. Ativar o deploy automático

Depois do deploy manual:

1. copie a **Deployment Trigger URL** do serviço Compose;
2. em **Settings > Secrets and variables > Actions > Secrets**, salve-a como
   repository secret `EASYPANEL_COMPOSE_DEPLOY_HOOK`;
3. altere a repository variable `EASYPANEL_DEPLOY_ENABLED` para `true`;
4. abra **Actions > Build and deploy Compose > Run workflow** e selecione
   `main`;
5. confirme que as duas imagens reutilizam seus caches e que o EasyPanel
   registra exatamente um deploy do Compose.

O hook é uma credencial. Se aparecer em log, issue, conversa ou commit,
rotacione-o e atualize o secret imediatamente.

## Deploy cotidiano

| Mudança              | Resultado                               |
| -------------------- | --------------------------------------- |
| Somente API          | testa e publica API; aplica o Compose   |
| Somente web          | testa e publica web; aplica o Compose   |
| `packages/contracts` | testa e publica ambos; aplica o Compose |
| Somente Compose      | não publica imagem; aplica o Compose    |
| Somente documentação | não inicia o workflow                   |

Cada imagem é publicada primeiro como `sha-<commit>`. Apenas depois de todos os
builds selecionados passarem, o workflow promove essas imagens para `main` e
chama o hook uma vez.

## Smoke test

No terminal, informe a origem pública quando solicitado:

```bash
printf 'Origem HTTPS pública (sem barra final): '
read -r ALPHRACTAL_PUBLIC_ORIGIN
export ALPHRACTAL_PUBLIC_ORIGIN
test -n "$ALPHRACTAL_PUBLIC_ORIGIN"
curl --fail --silent --show-error "$ALPHRACTAL_PUBLIC_ORIGIN/" >/dev/null
curl --fail --silent --show-error "$ALPHRACTAL_PUBLIC_ORIGIN/api/v1/fees/current"
curl --no-buffer --max-time 20 "$ALPHRACTAL_PUBLIC_ORIGIN/api/v1/live/stream"
```

A raiz deve retornar 2xx, o endpoint REST deve retornar seu envelope JSON e o
SSE deve emitir dados ou heartbeat antes do timeout do cliente.

## Rollback

Escolha as tags SHA válidas anteriores de API e web, fixe temporariamente essas
tags em `docker-compose.production.yml` e faça um deploy. As duas imagens podem
usar commits diferentes quando apenas uma delas havia mudado. Depois do smoke
test, restaure as referências `main`.

Não restaure MongoDB para reverter somente o código da aplicação. Mudanças de
versão ou restauração do banco são operações separadas e sempre exigem um
backup externo verificado.
