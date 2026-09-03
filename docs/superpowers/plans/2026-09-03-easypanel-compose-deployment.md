# EasyPanel Compose Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, publish, and deploy the API and web images through one selectively cached GitHub Actions workflow and one EasyPanel Compose deployment, while keeping MongoDB as a native service.

**Architecture:** GitHub Actions classifies changes into API, web, and stack groups, verifies affected workspaces, publishes immutable `linux/amd64` images only for affected applications, promotes their `main` tags after every selected build succeeds, and calls one Compose hook. EasyPanel runs a Git-sourced Compose service for `web` and `api`; a native MongoDB service owns persistent data and backups.

**Tech Stack:** Node.js 24, npm 11 workspaces, TypeScript, tsup, Next.js standalone, Docker BuildKit, Docker Compose, GitHub Actions, GHCR, EasyPanel, MongoDB 8.

## Global Constraints

- Keep `@alphractal/contracts` private; never publish it to npm.
- Use the repository root as both Docker build contexts.
- Build only `linux/amd64`; keep Vitest at no more than two forks.
- Keep one API replica and keep MongoDB outside the Compose service.
- Keep both GHCR packages public so the EasyPanel Compose service can pull them anonymously.
- Never place provider, database, registry, or deployment credentials in Git, build arguments, image layers, or logs.
- Keep development `docker-compose.yml`; production uses `docker-compose.production.yml`.
- A Compose-only change deploys the stack without rebuilding images.
- Keep automatic deploy disabled until the first GHCR images and Compose service exist.

## File Map

- Modify `apps/api/package.json` and `package-lock.json`; create `apps/api/tsup.config.ts` for a production API bundle.
- Modify `apps/web/next.config.ts`; create `apps/web/test/next-config.test.ts` for monorepo-safe standalone output.
- Create `.dockerignore`, `Dockerfile.api`, and `Dockerfile.web` for cached minimal images.
- Create `docker-compose.production.yml` for the EasyPanel runtime stack.
- Create `.github/workflows/deploy.yml` for selective publication and one deploy hook.
- Create `docs/deployment/easypanel.md` and link it from `README.md`.

---

### Task 1: Produce the production API bundle

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/tsup.config.ts`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `apps/api/src/server.ts` and source-only `@alphractal/contracts`.
- Produces: `apps/api/dist/server.js`, executed by the API `start` script.

- [ ] **Step 1: Prove the build script is missing**

Run `npm run build --workspace @alphractal/api`.

Expected: FAIL with `Missing script: "build"`.

- [ ] **Step 2: Install the exact bundler version**

```bash
npm install --save-dev --workspace @alphractal/api tsup@8.5.1
```

- [ ] **Step 3: Replace the API scripts**

Use this exact `scripts` object in `apps/api/package.json`:

```json
{
  "dev": "tsx watch src/server.ts",
  "build": "tsup",
  "start": "node dist/server.js",
  "test": "vitest run",
  "typecheck": "tsc -p tsconfig.json",
  "lint": "eslint src test tsup.config.ts"
}
```

- [ ] **Step 4: Create `apps/api/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  outDir: 'dist',
  clean: true,
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  sourcemap: true,
  splitting: false,
  treeshake: true,
  dts: false,
  noExternal: ['@alphractal/contracts'],
});
```

- [ ] **Step 5: Build and inspect the artifact**

```bash
npm run build --workspace @alphractal/api
test -s apps/api/dist/server.js
node --check apps/api/dist/server.js
if rg -n "from ['\"]@alphractal/contracts['\"]" apps/api/dist/server.js; then exit 1; fi
```

Expected: PASS; contracts are bundled instead of imported as raw TypeScript.

- [ ] **Step 6: Run focused gates**

```bash
npm run lint --workspace @alphractal/api
npm run typecheck --workspace @alphractal/api
npm run test --workspace @alphractal/api -- --pool=forks --poolOptions.forks.maxForks=2
npm run test --workspace @alphractal/contracts -- --pool=forks --poolOptions.forks.maxForks=2
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json apps/api/tsup.config.ts package-lock.json
git commit -m "build: add production api bundle"
```

---

### Task 2: Generate monorepo-safe standalone Next.js output

**Files:**
- Modify: `apps/web/next.config.ts`
- Create: `apps/web/test/next-config.test.ts`

**Interfaces:**
- Consumes: `@alphractal/contracts` and build-time `API_SERVER_URL`.
- Produces: `apps/web/.next/standalone/apps/web/server.js`.

- [ ] **Step 1: Create the failing test**

Create `apps/web/test/next-config.test.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';

describe('production Next.js output', () => {
  it('uses standalone output rooted at the monorepo', () => {
    expect(nextConfig.output).toBe('standalone');
    expect(nextConfig.outputFileTracingRoot).toBe(
      fileURLToPath(new URL('../../..', import.meta.url)),
    );
  });
});
```

- [ ] **Step 2: Verify that it fails**

```bash
npm run test --workspace web -- test/next-config.test.ts --pool=forks --poolOptions.forks.maxForks=2
```

Expected: FAIL because both output properties are undefined.

- [ ] **Step 3: Replace `apps/web/next.config.ts`**

```ts
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import { resolveApiServerUrl } from './src/lib/api/server-config';

const apiServerUrl = resolveApiServerUrl(process.env, process.env.NODE_ENV);
const monorepoRoot = fileURLToPath(new URL('../..', import.meta.url));

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ['@alphractal/contracts'],
  experimental: {
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    },
  },
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiServerUrl}/api/v1/:path*` }];
  },
};

export default nextConfig;
```

- [ ] **Step 4: Verify test and output layout**

```bash
npm run test --workspace web -- test/next-config.test.ts --pool=forks --poolOptions.forks.maxForks=2
API_SERVER_URL=http://api:3001 npm run build --workspace web
test -s apps/web/.next/standalone/apps/web/server.js
```

Expected: PASS and standalone server exists.

- [ ] **Step 5: Run web gates and commit**

```bash
npm run lint --workspace web
npm run typecheck --workspace web
npm run test --workspace web -- --pool=forks --poolOptions.forks.maxForks=2
git add apps/web/next.config.ts apps/web/test/next-config.test.ts
git commit -m "build: add standalone web output"
```

---

### Task 3: Build the API container

**Files:**
- Create: `.dockerignore`
- Create: `Dockerfile.api`

**Interfaces:**
- Consumes: root workspace manifests, API source, contracts source, and Task 1 build.
- Produces: non-root API image listening on port 3001.

- [ ] **Step 1: Confirm the image definition is absent**

Run `docker build --platform linux/amd64 -f Dockerfile.api -t alphractal-api:test .`.

Expected: FAIL because `Dockerfile.api` is absent.

- [ ] **Step 2: Create `.dockerignore`**

```text
.git
.github
.worktrees
.superpowers
node_modules
**/node_modules
**/.next
**/dist
**/coverage
.env
.env.*
**/.env
**/.env.*
*.log
npm-debug.log*
docs
README.md
```

- [ ] **Step 3: Create `Dockerfile.api`**

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS deps
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS builder
COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages/contracts packages/contracts
RUN npm run build --workspace @alphractal/api

FROM node:24-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --workspace @alphractal/api --include-workspace-root=false

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --home-dir /app api
COPY --from=prod-deps --chown=api:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=api:nodejs /workspace/apps/api/dist ./apps/api/dist
COPY --chown=api:nodejs apps/api/package.json ./apps/api/package.json
COPY --chown=api:nodejs packages/contracts/package.json ./packages/contracts/package.json
USER api
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/server.js"]
```

- [ ] **Step 4: Build twice and observe cache hits**

```bash
docker build --platform linux/amd64 --progress=plain -f Dockerfile.api -t alphractal-api:test .
docker build --platform linux/amd64 --progress=plain -f Dockerfile.api -t alphractal-api:test .
```

Expected: both PASS; the second build reuses dependency/build layers.

- [ ] **Step 5: Smoke-test `/health`**

```bash
container_id=$(docker run -d -p 127.0.0.1:13001:3001 \
  -e ALCHEMY_HTTP_URL=https://rpc.invalid/v2/test \
  -e ALCHEMY_WS_URL=wss://ws.invalid/v2/test \
  -e CORS_ORIGINS=http://localhost:13000 \
  -e PROVIDER_REQUEST_TIMEOUT_MS=100 alphractal-api:test)
trap 'docker rm -f "$container_id" >/dev/null 2>&1 || true' EXIT
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  curl --fail --silent http://127.0.0.1:13001/health >/dev/null && break
  sleep 1
done
curl --fail --silent http://127.0.0.1:13001/health
```

Expected: `{"status":"ok"}`.

- [ ] **Step 6: Commit**

```bash
git add .dockerignore Dockerfile.api
git commit -m "build: containerize production api"
```

---

### Task 4: Build the standalone web container

**Files:**
- Create: `Dockerfile.web`

**Interfaces:**
- Consumes: Task 2 standalone output and build argument `API_SERVER_URL`.
- Produces: non-root web image listening on port 3000.

- [ ] **Step 1: Confirm the image definition is absent**

Run `docker build --platform linux/amd64 -f Dockerfile.web -t alphractal-web:test .`.

Expected: FAIL because `Dockerfile.web` is absent.

- [ ] **Step 2: Create `Dockerfile.web`**

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim AS deps
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS builder
WORKDIR /workspace
ARG API_SERVER_URL
ENV API_SERVER_URL=${API_SERVER_URL}
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY tsconfig.base.json ./
COPY apps/web apps/web
COPY packages/contracts packages/contracts
RUN test -n "$API_SERVER_URL" && npm run build --workspace web

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --home-dir /app nextjs
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/web/.next/static ./apps/web/.next/static
USER nextjs
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 3: Verify that the build argument is required**

Run `docker build --platform linux/amd64 -f Dockerfile.web -t alphractal-web:test .`.

Expected: FAIL at `test -n "$API_SERVER_URL"`.

- [ ] **Step 4: Build twice and smoke-test**

```bash
docker build --platform linux/amd64 --progress=plain --build-arg API_SERVER_URL=http://api:3001 -f Dockerfile.web -t alphractal-web:test .
docker build --platform linux/amd64 --progress=plain --build-arg API_SERVER_URL=http://api:3001 -f Dockerfile.web -t alphractal-web:test .
container_id=$(docker run -d -p 127.0.0.1:13000:3000 alphractal-web:test)
trap 'docker rm -f "$container_id" >/dev/null 2>&1 || true' EXIT
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  curl --fail --silent http://127.0.0.1:13000/ >/dev/null && break
  sleep 1
done
curl --fail --silent --output /dev/null http://127.0.0.1:13000/
```

Expected: both builds PASS with second-run cache hits; HTTP root returns 2xx.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile.web
git commit -m "build: containerize standalone web"
```

---

### Task 5: Define the production Compose stack

**Files:**
- Create: `docker-compose.production.yml`

**Interfaces:**
- Consumes: GHCR `main` images and EasyPanel environment values.
- Produces: internal `api:3001` and `web:3000`; EasyPanel exposes only web.

- [ ] **Step 1: Prove the production stack is absent**

Run `docker compose -f docker-compose.production.yml config --quiet`.

Expected: FAIL because the file is absent.

- [ ] **Step 2: Create `docker-compose.production.yml`**

```yaml
name: alphractal

services:
  api:
    image: ghcr.io/${GHCR_NAMESPACE:?set GHCR_NAMESPACE}/alphractal-api:main
    pull_policy: always
    init: true
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3001
      ALCHEMY_HTTP_URL: ${ALCHEMY_HTTP_URL:?set ALCHEMY_HTTP_URL}
      ALCHEMY_WS_URL: ${ALCHEMY_WS_URL:?set ALCHEMY_WS_URL}
      COINBASE_WS_URL: ${COINBASE_WS_URL:-wss://ws-feed.exchange.coinbase.com}
      MONGODB_URI: ${MONGODB_URI:?set MONGODB_URI}
      CORS_ORIGINS: ${CORS_ORIGINS:?set CORS_ORIGINS}
      FEE_INTERVAL_MS: ${FEE_INTERVAL_MS:-5000}
      SSE_HEARTBEAT_MS: ${SSE_HEARTBEAT_MS:-15000}
      PROVIDER_REQUEST_TIMEOUT_MS: ${PROVIDER_REQUEST_TIMEOUT_MS:-10000}
    expose: ['3001']
    healthcheck:
      test:
        - CMD
        - node
        - -e
        - >-
          fetch('http://127.0.0.1:3001/health')
          .then((response) => process.exit(response.ok ? 0 : 1))
          .catch(() => process.exit(1))
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s

  web:
    image: ghcr.io/${GHCR_NAMESPACE:?set GHCR_NAMESPACE}/alphractal-web:main
    pull_policy: always
    init: true
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
      HOSTNAME: 0.0.0.0
      API_SERVER_URL: http://api:3001
      NEXT_PUBLIC_USE_MOCK_DATA: 'false'
    expose: ['3000']
    depends_on:
      api:
        condition: service_healthy
```

Do not add `ports`, `container_name`, volumes, or MongoDB.

- [ ] **Step 3: Validate interpolation and topology**

```bash
GHCR_NAMESPACE=anacelia1827 ALCHEMY_HTTP_URL=https://rpc.invalid/v2/test \
ALCHEMY_WS_URL=wss://ws.invalid/v2/test \
MONGODB_URI='mongodb://mongo:test@mongo.internal:27017/alphractal?authSource=admin' \
CORS_ORIGINS=https://fees.example.invalid \
docker compose -f docker-compose.production.yml config --quiet

GHCR_NAMESPACE=anacelia1827 ALCHEMY_HTTP_URL=https://rpc.invalid/v2/test \
ALCHEMY_WS_URL=wss://ws.invalid/v2/test \
MONGODB_URI='mongodb://mongo:test@mongo.internal:27017/alphractal?authSource=admin' \
CORS_ORIGINS=https://fees.example.invalid \
docker compose -f docker-compose.production.yml config --services
```

Expected: PASS; service output is exactly `api` and `web`.

- [ ] **Step 4: Verify isolation and commit**

```bash
if rg -n '^\s+(ports|container_name):|^\s+mongo:' docker-compose.production.yml; then exit 1; fi
git add docker-compose.production.yml
git commit -m "build: add production compose stack"
```

---

### Task 6: Add selective cached CI/CD and one Compose hook

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: variables `GHCR_NAMESPACE`, `API_SERVER_URL`, `EASYPANEL_DEPLOY_ENABLED`; secret `EASYPANEL_COMPOSE_DEPLOY_HOOK`.
- Produces: selected immutable GHCR images, coordinated `main` tag promotion, and at most one Compose hook request.

- [ ] **Step 1: Prove the workflow is absent**

Run `test -f .github/workflows/deploy.yml`.

Expected: FAIL.

- [ ] **Step 2: Create `.github/workflows/deploy.yml`**

```yaml
name: Build and deploy Compose

on:
  push:
    branches: [main]
    paths:
      - 'apps/api/**'
      - 'apps/web/**'
      - 'packages/contracts/**'
      - 'package.json'
      - 'package-lock.json'
      - 'tsconfig.base.json'
      - 'eslint.config.js'
      - '.prettierrc.json'
      - '.prettierignore'
      - '.dockerignore'
      - 'Dockerfile.api'
      - 'Dockerfile.web'
      - 'docker-compose.production.yml'
      - '.github/workflows/deploy.yml'
  workflow_dispatch:

concurrency:
  group: deploy-compose-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      api: ${{ steps.selection.outputs.api }}
      web: ${{ steps.selection.outputs.web }}
      stack: ${{ steps.selection.outputs.stack }}
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - name: Detect changed areas
        if: github.event_name != 'workflow_dispatch'
        id: filter
        uses: dorny/paths-filter@v4
        with:
          filters: |
            api:
              - 'apps/api/**'
              - 'packages/contracts/**'
              - 'package.json'
              - 'package-lock.json'
              - 'tsconfig.base.json'
              - 'eslint.config.js'
              - '.prettierrc.json'
              - '.prettierignore'
              - '.dockerignore'
              - 'Dockerfile.api'
              - '.github/workflows/deploy.yml'
            web:
              - 'apps/web/**'
              - 'packages/contracts/**'
              - 'package.json'
              - 'package-lock.json'
              - 'tsconfig.base.json'
              - 'eslint.config.js'
              - '.prettierrc.json'
              - '.prettierignore'
              - '.dockerignore'
              - 'Dockerfile.web'
              - '.github/workflows/deploy.yml'
            stack:
              - 'docker-compose.production.yml'

      - name: Select jobs
        id: selection
        env:
          EVENT_NAME: ${{ github.event_name }}
          API_CHANGED: ${{ steps.filter.outputs.api }}
          WEB_CHANGED: ${{ steps.filter.outputs.web }}
          STACK_CHANGED: ${{ steps.filter.outputs.stack }}
        run: |
          if [ "$EVENT_NAME" = "workflow_dispatch" ]; then
            echo "api=true" >> "$GITHUB_OUTPUT"
            echo "web=true" >> "$GITHUB_OUTPUT"
            echo "stack=true" >> "$GITHUB_OUTPUT"
          else
            echo "api=${API_CHANGED:-false}" >> "$GITHUB_OUTPUT"
            echo "web=${WEB_CHANGED:-false}" >> "$GITHUB_OUTPUT"
            echo "stack=${STACK_CHANGED:-false}" >> "$GITHUB_OUTPUT"
          fi

  verify:
    needs: changes
    if: needs.changes.outputs.api == 'true' || needs.changes.outputs.web == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: package-lock.json
      - run: npm ci
      - name: Validate contracts
        run: |
          npm run lint --workspace @alphractal/contracts
          npm run typecheck --workspace @alphractal/contracts
          npm run test --workspace @alphractal/contracts -- --pool=forks --poolOptions.forks.maxForks=2
      - name: Validate API
        if: needs.changes.outputs.api == 'true'
        run: |
          npm run lint --workspace @alphractal/api
          npm run typecheck --workspace @alphractal/api
          npm run test --workspace @alphractal/api -- --pool=forks --poolOptions.forks.maxForks=2
          npm run build --workspace @alphractal/api
      - name: Validate web
        if: needs.changes.outputs.web == 'true'
        env:
          API_SERVER_URL: ${{ vars.API_SERVER_URL }}
        run: |
          npm run lint --workspace web
          npm run typecheck --workspace web
          npm run test --workspace web -- --pool=forks --poolOptions.forks.maxForks=2
          npm run build --workspace web

  build-api:
    needs: [changes, verify]
    if: needs.changes.outputs.api == 'true'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    env:
      IMAGE_NAME: ghcr.io/${{ vars.GHCR_NAMESPACE }}/alphractal-api
    steps:
      - uses: actions/checkout@v6
      - uses: docker/setup-buildx-action@v4
      - uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v7
        with:
          context: .
          file: ./Dockerfile.api
          platforms: linux/amd64
          push: true
          tags: ${{ env.IMAGE_NAME }}:sha-${{ github.sha }}
          cache-from: type=gha,scope=alphractal-api
          cache-to: type=gha,mode=max,scope=alphractal-api

  build-web:
    needs: [changes, verify]
    if: needs.changes.outputs.web == 'true'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    env:
      IMAGE_NAME: ghcr.io/${{ vars.GHCR_NAMESPACE }}/alphractal-web
    steps:
      - uses: actions/checkout@v6
      - uses: docker/setup-buildx-action@v4
      - uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v7
        with:
          context: .
          file: ./Dockerfile.web
          platforms: linux/amd64
          push: true
          build-args: |
            API_SERVER_URL=${{ vars.API_SERVER_URL }}
          tags: ${{ env.IMAGE_NAME }}:sha-${{ github.sha }}
          cache-from: type=gha,scope=alphractal-web
          cache-to: type=gha,mode=max,scope=alphractal-web

  promote:
    needs: [changes, verify, build-api, build-web]
    if: >-
      always() &&
      (needs.changes.outputs.api == 'true' || needs.changes.outputs.web == 'true') &&
      needs.verify.result == 'success' &&
      (needs.changes.outputs.api != 'true' || needs.build-api.result == 'success') &&
      (needs.changes.outputs.web != 'true' || needs.build-web.result == 'success')
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    env:
      API_IMAGE: ghcr.io/${{ vars.GHCR_NAMESPACE }}/alphractal-api
      WEB_IMAGE: ghcr.io/${{ vars.GHCR_NAMESPACE }}/alphractal-web
      API_CHANGED: ${{ needs.changes.outputs.api }}
      WEB_CHANGED: ${{ needs.changes.outputs.web }}
    steps:
      - uses: docker/setup-buildx-action@v4
      - uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Promote successful images to main
        run: |
          if [ "$API_CHANGED" = "true" ]; then
            docker buildx imagetools create \
              --tag "$API_IMAGE:main" "$API_IMAGE:sha-$GITHUB_SHA"
          fi
          if [ "$WEB_CHANGED" = "true" ]; then
            docker buildx imagetools create \
              --tag "$WEB_IMAGE:main" "$WEB_IMAGE:sha-$GITHUB_SHA"
          fi

  deploy:
    needs: [changes, verify, build-api, build-web, promote]
    if: >-
      always() &&
      vars.EASYPANEL_DEPLOY_ENABLED == 'true' &&
      needs.changes.result == 'success' &&
      (needs.verify.result == 'success' || needs.verify.result == 'skipped') &&
      (needs.build-api.result == 'success' || needs.build-api.result == 'skipped') &&
      (needs.build-web.result == 'success' || needs.build-web.result == 'skipped') &&
      (((needs.changes.outputs.api == 'true' || needs.changes.outputs.web == 'true') &&
        needs.promote.result == 'success') ||
       (needs.changes.outputs.api != 'true' && needs.changes.outputs.web != 'true' &&
        needs.promote.result == 'skipped')) &&
      (needs.changes.outputs.api == 'true' ||
       needs.changes.outputs.web == 'true' ||
       needs.changes.outputs.stack == 'true')
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Trigger one EasyPanel Compose deployment
        env:
          DEPLOY_HOOK: ${{ secrets.EASYPANEL_COMPOSE_DEPLOY_HOOK }}
        run: |
          test -n "$DEPLOY_HOOK"
          curl --fail --silent --show-error "$DEPLOY_HOOK" >/dev/null
```

- [ ] **Step 3: Validate workflow syntax**

```bash
npx prettier --check .github/workflows/deploy.yml
docker run --rm -v "$PWD:/repo" --workdir /repo \
  rhysd/actionlint:1.7.12 -color .github/workflows/deploy.yml
```

Expected: both PASS.

- [ ] **Step 4: Verify critical routing and commit**

```bash
rg -n "scope=alphractal-(api|web)|imagetools create|EASYPANEL_COMPOSE_DEPLOY_HOOK|docker-compose.production.yml|packages/contracts" .github/workflows/deploy.yml
git add .github/workflows/deploy.yml
git commit -m "ci: add selective compose deployment"
```

Expected: distinct caches, contracts in both filters, stack-only routing,
post-build promotion, and one hook call.

---

### Task 7: Add the operator runbook

**Files:**
- Create: `docs/deployment/easypanel.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: Tasks 1–6 and the approved deployment design.
- Produces: exact bootstrap, deploy, smoke, backup, and rollback instructions.

- [ ] **Step 1: Create `docs/deployment/easypanel.md`**

```markdown
# Deploy no EasyPanel

## Arquitetura

O projeto usa um MongoDB nativo e um Compose com `api` e `web`. Somente
`web:3000` recebe domínio público. API e MongoDB ficam na rede privada.

## Primeiro build no GitHub

Crie estas repository variables antes do primeiro push para `main`:

- `GHCR_NAMESPACE=anacelia1827`
- `API_SERVER_URL=http://api:3001`
- `EASYPANEL_DEPLOY_ENABLED=false`

O primeiro workflow publica as imagens sem tentar usar um hook inexistente.

## MongoDB nativo

Crie o serviço `alphractal-mongo` no mesmo projeto EasyPanel, mantenha Expose
desabilitado e copie a URL interna da aba Credentials. Acrescente o banco
`alphractal` e o authentication source exigido pela credencial. Configure um
backup lógico diário em armazenamento externo e teste uma restauração fora de
produção.

## Compose e GHCR

Após o primeiro workflow, abra os packages `alphractal-api` e
`alphractal-web` no GitHub e altere a visibilidade de ambos para Public. O
serviço Compose do EasyPanel fará o pull anônimo dessas imagens; não armazene
um PAT do GitHub na VPS. Crie o Compose Service com:

- Repository: `https://github.com/AnaCelia1827/ProjetoAlphafracta.git`
- Branch: `main`
- Build Path: `/`
- Docker Compose File: `docker-compose.production.yml`

Configure o ambiente do Compose:

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

Os valores descritivos são substituídos somente no EasyPanel e nunca no Git.
Adicione um domínio HTTPS para o serviço interno `web`, protocolo HTTP, porta
3000. Não crie domínio ou porta publicada para API ou MongoDB.

## Ativação automática

Após o primeiro deploy manual, copie a Deployment Trigger URL do Compose para o
secret `EASYPANEL_COMPOSE_DEPLOY_HOOK` do GitHub environment `production`.
Altere `EASYPANEL_DEPLOY_ENABLED=true` e execute o workflow manualmente. Ele
deve publicar as duas imagens e chamar o hook uma vez.

## Deploy cotidiano

- API alterada: publica API e aplica o Compose.
- Web alterado: publica web e aplica o Compose.
- Contracts alterado: publica ambos e aplica o Compose.
- Somente Compose alterado: não publica imagens e aplica o Compose.
- Somente documentação alterada: não inicia o workflow.

## Smoke test

Defina `ALPHRACTAL_PUBLIC_ORIGIN` com a origem HTTPS real e execute:

```bash
curl --fail --silent --show-error "$ALPHRACTAL_PUBLIC_ORIGIN/" >/dev/null
curl --fail --silent --show-error "$ALPHRACTAL_PUBLIC_ORIGIN/api/v1/fees/current"
curl --no-buffer --max-time 20 "$ALPHRACTAL_PUBLIC_ORIGIN/api/v1/live/stream"
```

## Rollback

Escolha a tag SHA válida anterior de cada imagem, fixe temporariamente essas
tags no Compose e faça um deploy. API e web podem usar SHAs diferentes. Depois
do smoke test, restaure `main`. Nunca restaure MongoDB para reverter somente o
código da aplicação.

## Segurança e recuperação

Rotacione o hook caso ele seja exposto e atualize imediatamente o secret.
Mantenha MongoDB sem exposição externa. Antes de atualizar sua versão principal
ou restaurar dados, faça e verifique um backup externo.
```

- [ ] **Step 2: Link the runbook from `README.md`**

Immediately after the architecture table, add:

```markdown
O procedimento de publicação das imagens, criação do MongoDB nativo e deploy
coordenado está em [docs/deployment/easypanel.md](docs/deployment/easypanel.md).
```

- [ ] **Step 3: Validate and commit documentation**

```bash
npx prettier --check README.md docs/deployment/easypanel.md
if rg -n 'api/deploy/[A-Za-z0-9]+|mongodb://[^[:space:]@]+:[^[:space:]@]+@' docs/deployment/easypanel.md; then exit 1; fi
git add README.md docs/deployment/easypanel.md
git commit -m "docs: add easypanel deployment runbook"
```

Expected: format and secret hygiene checks PASS.

---

### Task 8: Run complete local release verification

**Files:**
- Verify: every file changed by Tasks 1–7.

**Interfaces:**
- Consumes: complete implementation.
- Produces: evidence ready for first GHCR bootstrap.

- [ ] **Step 1: Check memory, then run broad gates serially**

```bash
free -h
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test --workspaces --if-present -- --pool=forks --poolOptions.forks.maxForks=2
API_SERVER_URL=http://api:3001 npm run build
```

Expected: all PASS. Do not run Docker builds concurrently with this suite.

- [ ] **Step 2: Build release images serially**

```bash
docker build --platform linux/amd64 --progress=plain -f Dockerfile.api -t alphractal-api:test .
docker build --platform linux/amd64 --progress=plain --build-arg API_SERVER_URL=http://api:3001 -f Dockerfile.web -t alphractal-web:test .
```

Expected: both PASS.

- [ ] **Step 3: Validate Compose and workflow**

```bash
GHCR_NAMESPACE=anacelia1827 ALCHEMY_HTTP_URL=https://rpc.invalid/v2/test \
ALCHEMY_WS_URL=wss://ws.invalid/v2/test \
MONGODB_URI='mongodb://mongo:test@mongo.internal:27017/alphractal?authSource=admin' \
CORS_ORIGINS=https://fees.example.invalid \
docker compose -f docker-compose.production.yml config --quiet
docker run --rm -v "$PWD:/repo" --workdir /repo \
  rhysd/actionlint:1.7.12 -color .github/workflows/deploy.yml
git status --short
```

Expected: validators PASS and no unintended files are present.

- [ ] **Step 4: Perform the release checklist**

Confirm all of the following:

- contracts remain private, bundled into API, and traced into web;
- API and web caches use different scopes;
- the workflow contains exactly one EasyPanel hook call;
- production Compose has no `ports`, `container_name`, volume, or MongoDB;
- development `docker-compose.yml` is unchanged;
- no credential-shaped value or hook was introduced.

- [ ] **Step 5: Commit only if verification required a correction**

If a correction was necessary, return to the task that owns that file, repeat
its focused verification, stage only the exact corrected files shown by
`git status --short`, and commit with a message describing that correction. If
nothing was corrected, do not create an empty commit.

---

### Task 9: Bootstrap GitHub and EasyPanel

**Files:**
- External configuration only; follow `docs/deployment/easypanel.md`.

**Interfaces:**
- Consumes: verified main branch and published GHCR images.
- Produces: native MongoDB, Compose runtime, domain, hook, and automatic deploy.

- [ ] **Step 1: Create GitHub variables**

In `AnaCelia1827/ProjetoAlphafracta`, create:

```text
GHCR_NAMESPACE=anacelia1827
API_SERVER_URL=http://api:3001
EASYPANEL_DEPLOY_ENABLED=false
```

- [ ] **Step 2: Merge and verify the bootstrap workflow**

Merge through the normal review path. Expected: verification passes, both
immutable images are promoted to `main` in GHCR, and deploy is skipped.

- [ ] **Step 3: Make the two GHCR packages public**

In the package settings for `alphractal-api` and `alphractal-web`, change
visibility to Public. Confirm both `:main` image pages are anonymously
accessible before configuring Compose. This is acceptable because the source
repository and built application are already public.

- [ ] **Step 4: Create native MongoDB**

Create `alphractal-mongo` in the EasyPanel project, keep Expose disabled, copy its internal URL, and configure/test an external logical backup.

- [ ] **Step 5: Create the Git-sourced Compose service**

Use the repository, branch, build path, and Compose filename from the runbook.
The repository and GHCR packages are public, so the service needs neither a
GitHub deploy key nor a package PAT.

- [ ] **Step 6: Configure runtime and domain**

Paste real Alchemy and MongoDB values only in EasyPanel. Set CORS to the final HTTPS origin. Route that domain to `web`, HTTP, port 3000. Do not expose API or MongoDB.

- [ ] **Step 7: Run the first manual Compose deploy**

Press `Deploy` once. Expected: API becomes healthy, web starts, and the public root responds.

- [ ] **Step 8: Enable and test automatic deployment**

Save the Compose hook as `EASYPANEL_COMPOSE_DEPLOY_HOOK` in GitHub environment `production`; set `EASYPANEL_DEPLOY_ENABLED=true`; run `workflow_dispatch`.

Expected: both image jobs reuse their own caches, their immutable tags are
promoted to `main`, and EasyPanel records exactly one Compose deploy.

---

### Task 10: Validate production and rehearse rollback

**Files:**
- External verification only.

**Interfaces:**
- Consumes: deployed production stack.
- Produces: production smoke and recovery evidence.

- [ ] **Step 1: Verify web, REST, and SSE externally**

```bash
printf 'Origem HTTPS pública (sem barra final): '
read -r ALPHRACTAL_PUBLIC_ORIGIN
export ALPHRACTAL_PUBLIC_ORIGIN
test -n "$ALPHRACTAL_PUBLIC_ORIGIN"
curl --fail --silent --show-error "$ALPHRACTAL_PUBLIC_ORIGIN/" >/dev/null
curl --fail --silent --show-error "$ALPHRACTAL_PUBLIC_ORIGIN/api/v1/fees/current"
curl --no-buffer --max-time 20 "$ALPHRACTAL_PUBLIC_ORIGIN/api/v1/live/stream"
```

Expected: root is 2xx, REST returns an envelope, and SSE emits heartbeat/data
before the client timeout.

- [ ] **Step 2: Verify runtime isolation in EasyPanel**

Confirm one API container, MongoDB persistence available in API logs, web-to-API traffic on `http://api:3001`, MongoDB Expose disabled, and no API host port.

- [ ] **Step 3: Verify selective routing**

In a controlled validation window, make one API-only change, one web-only change, and one Compose-only change. Expected respectively: API image only; web image only; no image, with one Compose deploy in every applicable run.

- [ ] **Step 4: Rehearse rollback without touching MongoDB**

Record current image SHAs, temporarily pin each service to its previous valid SHA, deploy, run the smoke test, then restore `main` and deploy again. Expected: application rollback succeeds and MongoDB data is unchanged.

- [ ] **Step 5: Record private operational evidence**

Record workflow URL, EasyPanel timestamp, backup-restore test timestamp, and rollback result in the private operational log. Do not record secrets, internal database URLs, or hook URLs.
