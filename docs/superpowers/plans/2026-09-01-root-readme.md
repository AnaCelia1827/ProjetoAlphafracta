# Root README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um README raiz em português que explique o produto, seu fluxo técnico e a execução local no Windows e no Linux.

**Architecture:** O README será uma porta de entrada para o monorepo e resumirá somente comportamentos confirmados no código ou na documentação técnica. As instruções usarão os scripts npm da raiz, separarão comandos de Bash e PowerShell e apresentarão o MongoDB como dependência opcional do modo ao vivo.

**Tech Stack:** Markdown, Node.js 24, npm 11, TypeScript, Next.js, Express, MongoDB, Docker Compose, Alchemy, Coinbase WebSocket e SSE.

## Global Constraints

- Escrever o documento em português do Brasil.
- Criar somente `README.md` na raiz durante a implementação.
- Usar Node.js `>=24 <25` e npm `>=11 <12`, exatamente como declarado no `package.json`.
- Exigir URLs HTTP e WebSocket da Alchemy no backend e nunca expor a chave ao frontend.
- Tratar MongoDB e Docker como opcionais; sem `MONGODB_URI`, o tempo real funciona em memória e o histórico fica degradado.
- Usar no máximo dois workers/forks ao executar testes Vitest.
- Não incluir no commit arquivos locais preexistentes e ignorados em `docs/superpowers/`.

---

### Task 1: Criar e validar o README raiz

**Files:**
- Create: `README.md`
- Reference: `package.json`
- Reference: `.env.example`
- Reference: `apps/web/.env.example`
- Reference: `docker-compose.yml`
- Reference: `docs/architecture.md`
- Reference: `apps/api/src/app.ts`
- Reference: `apps/web/next.config.ts`

**Interfaces:**
- Consumes: scripts npm da raiz, variáveis de ambiente da API e do frontend, rotas REST/SSE e decisões registradas em `docs/architecture.md`.
- Produces: documentação de entrada autocontida para avaliação, configuração, execução e validação local do monorepo.

- [ ] **Step 1: Conferir as fontes de verdade antes da escrita**

Executar:

```bash
sed -n '1,180p' package.json
sed -n '1,180p' .env.example
sed -n '1,120p' apps/web/.env.example
sed -n '1,180p' docker-compose.yml
rg -n "app\.(get|use)|router\.get|/api/v1|rewrites" apps/api/src apps/web/next.config.ts
```

Resultado esperado: versões Node/npm, scripts, variáveis, serviço MongoDB, rotas e proxy correspondem ao conteúdo que será documentado.

- [ ] **Step 2: Criar o documento com a estrutura aprovada**

Criar `README.md` com estes títulos e responsabilidades exatas:

```markdown
# Alphractal

## Sobre o projeto
## Funcionalidades
## Como funciona
## Arquitetura
## Tecnologias
## Estrutura do repositório
## Pré-requisitos
## Configuração
## Como rodar no Linux
## Como rodar no Windows
## Endereços locais
## API
## Comandos úteis
## Solução de problemas
## Limitações atuais
## Documentação adicional
```

Incluir no fluxo de execução:

```text
Alchemy + Coinbase -> API Express -> regras de domínio -> SSE/REST -> Next.js
                                      -> MongoDB opcional
```

Incluir comandos Linux:

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
docker compose up -d mongo
npm install
npm run dev:api
npm run dev:web
```

Incluir os equivalentes PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item apps/web/.env.example apps/web/.env.local
docker compose up -d mongo
npm install
npm run dev:api
npm run dev:web
```

Explicar que API e frontend rodam em terminais separados, em
`http://localhost:3001` e `http://localhost:3000`.

- [ ] **Step 3: Verificar precisão e ausência de segredos**

Executar:

```bash
rg -n "Node.js 24|npm 11|localhost:3000|localhost:3001|ALCHEMY_HTTP_URL|ALCHEMY_WS_URL|MONGODB_URI|Copy-Item|docker compose|npm run dev:api|npm run dev:web" README.md
git diff -- README.md
```

Resultado esperado: todos os tópicos operacionais aparecem; a revisão do diff
confirma que exemplos da Alchemy usam somente `replace-with-your-key` e que
nenhum segredo real ou chave preenchida aparece no documento.

- [ ] **Step 4: Validar Markdown e qualidade do repositório**

Executar em sequência, sem processos pesados concorrentes:

```bash
npx prettier --check README.md
npm run typecheck
npm run lint
npm run test --workspace @alphractal/contracts -- --pool=forks --poolOptions.forks.maxForks=2
npm run test --workspace @alphractal/api -- --pool=forks --poolOptions.forks.maxForks=2
npm run test --workspace web -- --pool=forks --poolOptions.forks.maxForks=2
API_SERVER_URL=http://localhost:3001 npm run build
git diff --check
```

Resultado esperado: todos os comandos terminam com código zero. Se um erro de baseline não relacionado existir, registrar o comando, a saída e confirmar que `README.md` não é a causa antes de prosseguir.

- [ ] **Step 5: Revisar e registrar a implementação**

Executar:

```bash
git diff -- README.md
git status --short
git add README.md
git diff --cached --check
git commit -m "docs: add project setup guide"
```

Resultado esperado: o commit contém somente `README.md`; documentos ignorados ou mudanças locais preexistentes não são adicionados.

- [ ] **Step 6: Reconfirmar e publicar na main**

Executar:

```bash
git fetch origin
git rev-list --count HEAD..origin/main
git status --short --branch
git push origin main
git status --short --branch
```

Resultado esperado: a contagem antes do push é `0`, o push é aceito e o estado final mostra `main...origin/main` sem divergência.
