# Alphractal Fees — frontend

Frontend Next.js do painel de monitoramento de taxas Ethereum. Conforme a
arquitetura do projeto, o navegador consome somente a API NestJS; conexões com
Alchemy, Coinbase e MongoDB pertencem ao backend.

## Executar localmente

```powershell
Copy-Item .env.example .env.local
npm.cmd run dev
```

A aplicação estará em `http://localhost:3000`. Ajuste
`NEXT_PUBLIC_API_URL` em `.env.local` quando a API usar outro endereço.

## Comandos

- `npm.cmd run dev`: servidor de desenvolvimento.
- `npm.cmd run lint`: análise estática.
- `npm.cmd run build`: build de produção.
- `npm.cmd run start`: executa o build de produção.

## Stack

- Next.js com App Router
- React
- TypeScript
- CSS Modules
- ESLint
