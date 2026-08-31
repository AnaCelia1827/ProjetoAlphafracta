# Alphractal Fees — frontend

Dashboard Next.js do monitoramento de taxas e blocos da Ethereum Mainnet. O
navegador usa somente rotas same-origin em `/api/v1`; o servidor Next encaminha
essas requisições para a API Express.

## Configuração local

Copie `.env.example` para `.env.local` e defina:

```env
API_SERVER_URL=http://localhost:3001
NEXT_PUBLIC_USE_MOCK_DATA=false
```

`API_SERVER_URL` é lida apenas pelo servidor Next e é obrigatória em produção.
O navegador nunca recebe a origem interna do backend. Mocks ficam desligados
por padrão, só podem ser ativados em desenvolvimento/teste e mostram um selo
`Demo` na interface.

Na raiz do monorepo:

```bash
npm install
npm run dev:api
npm run dev:web
```

A API fica em `http://localhost:3001` e o dashboard em
`http://localhost:3000`.

## Contratos consumidos

Todos os envelopes são validados por `@alphractal/contracts`:

- `GET /api/v1/fees/current`
- `GET /api/v1/fees/history?from=<ISO>&to=<ISO>&limit=5000&cursor=<cursor>`
- `GET /api/v1/blocks/recent?limit=20`
- `GET /api/v1/blocks/:numberOrHash`
- `GET /api/v1/live/stream`

O stream registra somente os eventos nomeados `fee-snapshot`, `block-added` e
`block-status-changed`. Depois de uma reconexão, o cliente atualiza novamente
as taxas atuais e a janela de blocos por REST.

## Comandos

Execute a partir da raiz:

- `npm run dev:web`: servidor de desenvolvimento do frontend.
- `npm run lint --workspace web`: análise estática.
- `npm run typecheck --workspace web`: validação TypeScript isolada.
- `npm run test --workspace web -- --pool=forks --poolOptions.forks.maxForks=2`:
  testes unitários e integração com Express.
- `API_SERVER_URL=http://localhost:3001 npm run build --workspace web`: build de
  produção.

O `package-lock.json` da raiz é a única autoridade de dependências npm do
monorepo.
