# Configuração local de backend e frontend

## Objetivo

Permitir que uma pessoa execute o projeto principal seguindo os comandos do
README da raiz, usando a credencial Alchemy que já existe localmente no exemplo
legado, sem imprimir ou versionar essa credencial.

## Arquivos locais

- `.env`: configuração do backend Express, carregada a partir da raiz do
  monorepo.
- `apps/web/.env.local`: configuração privada do frontend Next.js.

Os dois arquivos permanecem ignorados pelo Git. Os arquivos `.env.example`
versionados não recebem valores secretos.

## Backend

O `.env` será derivado de `.env.example`. As URLs HTTP e WebSocket serão
montadas com a credencial `ALCHEMY_API_KEY` presente em
`../alchemy-example/server/.env`, sem expor o valor em saída de terminal,
documentação ou mensagens.

Os demais valores seguirão os padrões documentados: API na porta 3001,
Coinbase pública, CORS para o frontend local e intervalos já definidos no
modelo. `MONGODB_URI` ficará ausente por padrão para que a API inicialize sem
Docker; as variáveis `MONGO_INITDB_*` poderão permanecer no arquivo para uso
pelo Docker Compose.

## Frontend

O arquivo `apps/web/.env.local` apontará `API_SERVER_URL` para
`http://localhost:3001` e manterá `NEXT_PUBLIC_USE_MOCK_DATA=false`, garantindo
que o dashboard consuma a API local e dados reais dos provedores.

## Tratamento de falhas

A implementação interromperá a preparação caso a chave de origem esteja
ausente ou vazia. Nenhum fallback público ou chave fictícia será usado. A
validação não mostrará valores secretos; somente informará presença, formato e
resultado do carregamento.

## Verificação

1. Confirmar que os dois arquivos locais existem e continuam ignorados pelo
   Git.
2. Executar os testes focados de carregamento e validação de configuração.
3. Iniciar a API e confirmar o endpoint `/health`.
4. Iniciar o frontend e confirmar uma resposta HTTP em `localhost:3000`.
5. Encerrar os processos de desenvolvimento usados na verificação.

## Fora de escopo

- versionar ou divulgar a credencial Alchemy;
- alterar o código para criar um novo modo mock;
- exigir MongoDB no fluxo básico;
- mudar portas, contratos ou comportamento da aplicação.
