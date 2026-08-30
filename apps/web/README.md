# Alphractal Fees — frontend

Frontend Next.js do painel de monitoramento de taxas Ethereum. O navegador
consome somente a API Express; Alchemy, Coinbase e MongoDB pertencem ao backend.

## Executar com dados simulados

```powershell
Copy-Item .env.example .env.local
npm.cmd install
npm.cmd run dev
```

A aplicação estará em `http://localhost:3000`. O arquivo de exemplo já habilita
os mocks, portanto o backend não é necessário para visualizar a interface.

## Conectar ao backend

Configure `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_USE_MOCK_DATA=false
NEXT_PUBLIC_ENABLE_RECENT_BLOCKS=false
```

O frontend está preparado para estes contratos:

- `GET /stream`: SSE com `FeeSnapshot` em mensagens padrão ou evento `snapshot`.
- `GET /fees/history?from=<ISO>&to=<ISO>`: `{ "items": FeeHistoryPoint[] }`.
- `GET /blocks/recent?limit=5`: `{ "items": RecentBlock[] }`, opcional.

O endpoint de histórico e o de blocos também aceitam uma lista direta durante a
fase de integração. Para ativar blocos, defina
`NEXT_PUBLIC_ENABLE_RECENT_BLOCKS=true`.

## Comandos

- `npm.cmd run dev`: servidor de desenvolvimento.
- `npm.cmd run lint`: análise estática.
- `npm.cmd run typecheck`: validação TypeScript.
- `npm.cmd run build`: build de produção.
- `npm.cmd run start`: executa o build de produção.
