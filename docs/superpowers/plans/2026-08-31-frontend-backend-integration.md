# Frontend–Backend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the Alphractal Next.js dashboard to the REST and SSE API on `main`, preserve the approved blue identity, and make visual identity changes local to semantic color tokens.

**Architecture:** The web workspace consumes the executable Zod schemas from `@alphractal/contracts`. Transport modules validate API envelopes, adapters create UI view models, and one live-monitor hook owns REST bootstrap, SSE reconciliation, and block search. The browser uses same-origin `/api/v1` URLs through a Next rewrite configured by server-only `API_SERVER_URL`.

**Tech Stack:** Node.js 24, npm 11 workspaces, Next.js 16.3, React 19.2, TypeScript, Zod 4, Vitest 3.2, jsdom, Testing Library, Express 5, Server-Sent Events.

## Global Constraints

- Preserve the Alphractal logo and blue direction; components consume semantic CSS variables rather than raw brand hex values.
- Use `@alphractal/contracts` as the only authority for REST and SSE DTO validation.
- Keep Ethereum Mainnet as the only network; remove the unsupported network filter and query parameter.
- Use one `EventSource` and the named events `fee-snapshot`, `block-added`, and `block-status-changed`.
- Keep at most twenty recent blocks and reconcile blocks by number plus hash.
- Fetch history with `limit=5000`, follow every cursor, and render at most 288 evenly spaced points while preserving first and last.
- Mocks may run only in development/test and must be visibly identified.
- Do not add authentication, multi-network support, an internal analysis screen, or configurable metrics.
- Run Vitest with at most two forks: `--pool=forks --poolOptions.forks.maxForks=2`.
- Do not push or merge until standalone typecheck, tests, build, visual QA, and adversarial review pass.

---

### Task 1: Establish a reproducible frontend test and typecheck gate

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/app/layout.tsx`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/test/setup.ts`
- Create: `apps/web/test/contracts-smoke.test.ts`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `FeeSnapshotSchema` from `@alphractal/contracts`.
- Produces: `npm run test --workspace web`, a clean standalone typecheck, and a test DOM environment for later tasks.

- [ ] **Step 1: Add the failing contract smoke test**

```ts
// apps/web/test/contracts-smoke.test.ts
import { describe, expect, it } from "vitest";
import { FeeSnapshotSchema } from "@alphractal/contracts";

describe("frontend contract dependency", () => {
  it("loads the shared fee schema", () => {
    expect(FeeSnapshotSchema).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test --workspace web -- --pool=forks --poolOptions.forks.maxForks=2`

Expected: FAIL because the web workspace has no test script/configuration and does not depend on `@alphractal/contracts`.

- [ ] **Step 3: Add exact tooling and contract dependencies**

Run:

```bash
npm install --workspace web @alphractal/contracts@file:../../packages/contracts
npm install --workspace web --save-dev vitest@3.2.7 jsdom@30.0.1 @testing-library/react@16.3.3 @testing-library/user-event@14.6.6 @testing-library/jest-dom@7.0.1
```

Set these scripts in `apps/web/package.json`:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  }
}
```

Create the test config:

```ts
// apps/web/vitest.config.ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    restoreMocks: true,
  },
});
```

```ts
// apps/web/test/setup.ts
import "@testing-library/jest-dom/vitest";
```

Replace generated-only `LayoutProps` with an explicit stable prop:

```tsx
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Verify GREEN and the clean typecheck order**

Run:

```bash
npm run test --workspace web -- --pool=forks --poolOptions.forks.maxForks=2
rm -rf apps/web/.next
npm run typecheck --workspace web
```

Expected: one passing test and typecheck exit 0 without requiring `next build`. The `.next` deletion targets only generated output inside this isolated worktree.

- [ ] **Step 5: Commit the test foundation**

```bash
git add apps/web/package.json apps/web/src/app/layout.tsx apps/web/vitest.config.ts apps/web/test package-lock.json
git commit -m "test(web): establish integration test foundation"
```

---

### Task 2: Make API routing and failures production-safe

**Files:**
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/.env.example`
- Create: `apps/web/src/lib/api/config.ts`
- Create: `apps/web/src/lib/api/server-config.ts`
- Create: `apps/web/src/lib/api/errors.ts`
- Modify: `apps/web/src/lib/api/fetch-json.ts`
- Create: `apps/web/test/api-config.test.ts`
- Create: `apps/web/test/fetch-json.test.ts`

**Interfaces:**
- Consumes: `ApiErrorSchema` and the server-only environment.
- Produces: `apiConfig`, `resolveApiServerUrl(env, nodeEnv)`, `ApiClientError`, and `fetchJson<T>(url, schema, signal)`.

- [ ] **Step 1: Write failing URL, production-config, and API-error tests**

```ts
// apps/web/test/api-config.test.ts
import { describe, expect, it } from "vitest";
import { apiConfig } from "@/lib/api/config";
import { resolveApiServerUrl } from "@/lib/api/server-config";

describe("API configuration", () => {
  it("uses the versioned same-origin routes", () => {
    expect(apiConfig).toMatchObject({
      currentFeeUrl: "/api/v1/fees/current",
      historyUrl: "/api/v1/fees/history",
      recentBlocksUrl: "/api/v1/blocks/recent",
      streamUrl: "/api/v1/live/stream",
    });
  });

  it("rejects a missing production target", () => {
    expect(() => resolveApiServerUrl({}, "production")).toThrow(/API_SERVER_URL/);
  });

  it("uses localhost only in development", () => {
    expect(resolveApiServerUrl({}, "development")).toBe("http://localhost:3001");
  });
});
```

```ts
// apps/web/test/fetch-json.test.ts
import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@/lib/api/errors";
import { fetchJson } from "@/lib/api/fetch-json";

afterEach(() => vi.unstubAllGlobals());

describe("fetchJson", () => {
  it("preserves the backend error code and request id", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: "BLOCK_NOT_FOUND", message: "Block not found", requestId: "req-1" },
    }), { status: 404, headers: { "Content-Type": "application/json" } })));

    await expect(fetchJson("/api/v1/blocks/1", z.unknown())).rejects.toEqual(
      expect.objectContaining<ApiClientError>({ code: "BLOCK_NOT_FOUND", requestId: "req-1" }),
    );
  });
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm run test --workspace web -- test/api-config.test.ts test/fetch-json.test.ts --pool=forks --poolOptions.forks.maxForks=2`

Expected: FAIL on missing exports and old unversioned URLs.

- [ ] **Step 3: Implement configuration and typed errors**

```ts
// apps/web/src/lib/api/config.ts
const useMockData = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";

export const apiConfig = {
  currentFeeUrl: "/api/v1/fees/current",
  historyUrl: "/api/v1/fees/history",
  recentBlocksUrl: "/api/v1/blocks/recent",
  blockUrl: (identifier: string) => `/api/v1/blocks/${encodeURIComponent(identifier)}`,
  streamUrl: "/api/v1/live/stream",
  useMockData,
  staleAfterMs: 15_000,
} as const;
```

```ts
// apps/web/src/lib/api/server-config.ts
export function resolveApiServerUrl(
  env: Record<string, string | undefined>,
  nodeEnv: string | undefined,
): string {
  const value = env.API_SERVER_URL?.replace(/\/+$/, "");
  if (value) return value;
  if (nodeEnv !== "production") return "http://localhost:3001";
  throw new Error("API_SERVER_URL is required in production");
}
```

```ts
// apps/web/src/lib/api/errors.ts
import type { ApiErrorCode } from "@alphractal/contracts";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: ApiErrorCode,
    readonly requestId?: string,
    readonly details?: ReadonlyArray<{ field: string; issue: string }>,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}
```

Implement the transport boundary:

```ts
// apps/web/src/lib/api/fetch-json.ts
import { ApiErrorSchema } from "@alphractal/contracts";
import type { ZodType } from "zod";
import { ApiClientError } from "@/lib/api/errors";

export async function fetchJson<T>(
  url: string,
  schema: ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal });
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiClientError(`A API respondeu com HTTP ${response.status}.`, response.status);
  }
  if (!response.ok) {
    const parsedError = ApiErrorSchema.safeParse(body);
    if (parsedError.success) {
      const { code, message, requestId, details } = parsedError.data.error;
      throw new ApiClientError(message, response.status, code, requestId, details);
    }
    throw new ApiClientError(`A API respondeu com HTTP ${response.status}.`, response.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiClientError("A API retornou uma resposta inválida.", response.status);
  }
  return parsed.data;
}
```

Configure the rewrite:

```ts
// apps/web/next.config.ts
import type { NextConfig } from "next";
import { resolveApiServerUrl } from "./src/lib/api/server-config";

const apiServerUrl = resolveApiServerUrl(process.env, process.env.NODE_ENV);
const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${apiServerUrl}/api/v1/:path*` }];
  },
};

export default nextConfig;
```

- [ ] **Step 4: Verify GREEN**

Run: `npm run test --workspace web -- test/api-config.test.ts test/fetch-json.test.ts --pool=forks --poolOptions.forks.maxForks=2`

Expected: all configuration and error tests pass.

- [ ] **Step 5: Commit API infrastructure**

```bash
git add apps/web/next.config.ts apps/web/.env.example apps/web/src/lib/api apps/web/test/api-config.test.ts apps/web/test/fetch-json.test.ts
git commit -m "feat(web): align api routing and errors"
```

---

### Task 3: Validate shared DTOs and create stable view models

**Files:**
- Create: `apps/web/src/lib/api/view-models.ts`
- Replace: `apps/web/src/lib/api/parsers.ts`
- Replace: `apps/web/src/types/fees.ts`
- Replace: `apps/web/src/types/blocks.ts`
- Create: `apps/web/test/fixtures.ts`
- Create: `apps/web/test/view-models.test.ts`

**Interfaces:**
- Consumes: `FeeSnapshotDto`, `BlockSummaryDto`, and response schemas from `@alphractal/contracts`.
- Produces: `FeeViewModel`, `FeeHistoryPoint`, `BlockViewModel`, `toFeeViewModel`, `toHistoryPoint`, and `toBlockViewModel`.

- [ ] **Step 1: Write failing adapter tests with contract-valid fixtures**

```ts
// apps/web/test/view-models.test.ts
import { describe, expect, it } from "vitest";
import { feeSnapshotFixture, blockFixture } from "./fixtures";
import { toBlockViewModel, toFeeViewModel } from "@/lib/api/view-models";

describe("API view models", () => {
  it("derives transfer cost and confidence from the shared fee DTO", () => {
    const view = toFeeViewModel(feeSnapshotFixture);
    expect(view.maxCostUsd).toBe(2.31);
    expect(view.confidence).toEqual({ level: "high", reasons: ["fresh-data"] });
  });

  it("preserves decimal block identity and canonical actions", () => {
    const view = toBlockViewModel(blockFixture);
    expect(view.number).toBe("23548192");
    expect(view.priorityFeeGwei).toBe(1.8);
    expect(view.etherscanUrl).toBe("https://etherscan.io/block/23548192");
  });
});
```

`fixtures.ts` must export full objects that pass `FeeSnapshotSchema.parse` and `BlockSummarySchema.parse`, including every required status, source, finality, utilization, and URL field.

- [ ] **Step 2: Verify RED**

Run: `npm run test --workspace web -- test/view-models.test.ts --pool=forks --poolOptions.forks.maxForks=2`

Expected: FAIL because the view-model module does not exist.

- [ ] **Step 3: Implement the exact view-model boundary**

```ts
// apps/web/src/types/fees.ts
import type { FeeConfidenceDto, FeeTrendDto } from "@alphractal/contracts";

export type FeeViewModel = {
  timestamp: string;
  recommendationState: "current" | "last-known";
  recommendedMaxFeeGwei: number;
  recommendedPriorityFeeGwei: number;
  baseFeeGwei: number;
  effectiveGasPriceGwei: number;
  maxCostEth: number;
  maxCostUsd?: number;
  priceStatus: "fresh" | "stale" | "unavailable";
  trend: FeeTrendDto;
  confidence: FeeConfidenceDto;
  sampleSize: number;
  dataAgeMs: number;
  status: { mempool: string; ethereum: string; price: string; persistence: string };
};

export type FeeHistoryPoint = {
  timestamp: string;
  recommendedMaxFeeGwei: number;
  recommendedPriorityFeeGwei: number;
};
```

```ts
// apps/web/src/types/blocks.ts
export type BlockViewModel = {
  number: string;
  hash: string;
  timestamp: string;
  finality: "latest" | "safe" | "finalized";
  feeLevel: "low" | "normal" | "elevated" | "high" | "unavailable";
  baseFeeGwei: number;
  priorityFeeGwei: number;
  effectiveGasPriceGwei: number;
  utilizationPercent: number;
  transactionCount: number;
  provider: "alchemy";
  etherscanUrl: string;
};
```

Expose only schema-backed parsers:

```ts
// apps/web/src/lib/api/parsers.ts
import {
  BlockResponseSchema,
  FeeCurrentResponseSchema,
  FeeHistoryResponseSchema,
  LiveEventSchema,
  RecentBlocksResponseSchema,
} from "@alphractal/contracts";

export const parseCurrentFeeResponse = (value: unknown) => FeeCurrentResponseSchema.parse(value);
export const parseFeeHistoryResponse = (value: unknown) => FeeHistoryResponseSchema.parse(value);
export const parseRecentBlocksResponse = (value: unknown) => RecentBlocksResponseSchema.parse(value);
export const parseBlockResponse = (value: unknown) => BlockResponseSchema.parse(value);
export function parseLiveMessage(event: string, id: string, value: unknown) {
  return LiveEventSchema.parse({ event, id, data: value });
}
```

Map priced and unavailable transfer-cost variants without inventing a USD value:

```ts
// apps/web/src/lib/api/view-models.ts
import type { BlockSummaryDto, FeeSnapshotDto } from "@alphractal/contracts";
import type { BlockViewModel } from "@/types/blocks";
import type { FeeHistoryPoint, FeeViewModel } from "@/types/fees";

export function toFeeViewModel(snapshot: FeeSnapshotDto): FeeViewModel {
  const cost = snapshot.estimatedTransferCost;
  return {
    timestamp: snapshot.timestamp,
    recommendationState: snapshot.recommendationState,
    recommendedMaxFeeGwei: snapshot.recommendedMaxFeeGwei,
    recommendedPriorityFeeGwei: snapshot.recommendedPriorityFeeGwei,
    baseFeeGwei: snapshot.baseFeeGwei,
    effectiveGasPriceGwei: snapshot.effectiveGasPriceGwei,
    maxCostEth: cost.maxCostEth,
    ...(cost.status === "unavailable" ? {} : { maxCostUsd: cost.maxCostUsd }),
    priceStatus: cost.status,
    trend: snapshot.trend24h,
    confidence: snapshot.confidence,
    sampleSize: snapshot.sampleSize,
    dataAgeMs: snapshot.dataAgeMs,
    status: snapshot.status,
  };
}

export const toHistoryPoint = (snapshot: FeeSnapshotDto): FeeHistoryPoint => ({
  timestamp: snapshot.timestamp,
  recommendedMaxFeeGwei: snapshot.recommendedMaxFeeGwei,
  recommendedPriorityFeeGwei: snapshot.recommendedPriorityFeeGwei,
});

export const toBlockViewModel = (block: BlockSummaryDto): BlockViewModel => ({
  number: block.number,
  hash: block.hash,
  timestamp: block.timestamp,
  finality: block.finality,
  feeLevel: block.feeLevel,
  baseFeeGwei: block.baseFeeGwei,
  priorityFeeGwei: block.medianPriorityFeeGwei,
  effectiveGasPriceGwei: block.effectiveGasPriceGwei,
  utilizationPercent: block.utilizationPercent,
  transactionCount: block.transactionCount,
  provider: block.provider,
  etherscanUrl: block.etherscanUrl,
});
```

- [ ] **Step 4: Verify GREEN**

Run: `npm run test --workspace web -- test/view-models.test.ts --pool=forks --poolOptions.forks.maxForks=2`

Expected: all adapter tests pass and the fixtures are accepted by shared schemas.

- [ ] **Step 5: Commit adapters**

```bash
git add apps/web/src/lib/api/parsers.ts apps/web/src/lib/api/view-models.ts apps/web/src/types apps/web/test/fixtures.ts apps/web/test/view-models.test.ts
git commit -m "feat(web): adapt shared api contracts"
```

---

### Task 4: Implement paginated history and bounded chart data

**Files:**
- Replace: `apps/web/src/lib/api/fetch-fee-history.ts`
- Modify: `apps/web/src/hooks/use-fee-history.ts`
- Create: `apps/web/src/lib/history/downsample.ts`
- Create: `apps/web/test/fee-history.test.ts`

**Interfaces:**
- Consumes: `FeeHistoryResponseSchema`, `fetchJson`, and `toHistoryPoint`.
- Produces: `fetchAllFeeHistory(from, to, signal)` and `downsampleHistory(points, 288)`.

- [ ] **Step 1: Write failing pagination and sampling tests**

```ts
// apps/web/test/fee-history.test.ts
import { describe, expect, it } from "vitest";
import { downsampleHistory } from "@/lib/history/downsample";

describe("fee history", () => {
  it("keeps first and last while bounding chart points", () => {
    const points = Array.from({ length: 1000 }, (_, index) => ({
      timestamp: new Date(index * 1000).toISOString(),
      recommendedMaxFeeGwei: index,
      recommendedPriorityFeeGwei: 1,
    }));
    const sampled = downsampleHistory(points, 288);
    expect(sampled).toHaveLength(288);
    expect(sampled[0]).toBe(points[0]);
    expect(sampled.at(-1)).toBe(points.at(-1));
  });
});
```

Add a second test that stubs two `{ data, page }` responses and asserts that the second request preserves identical `from`, `to`, `limit=5000`, and adds only the returned `cursor`.

- [ ] **Step 2: Verify RED**

Run: `npm run test --workspace web -- test/fee-history.test.ts --pool=forks --poolOptions.forks.maxForks=2`

Expected: FAIL on missing `downsampleHistory` and pagination.

- [ ] **Step 3: Implement pagination and deterministic even sampling**

```ts
export function downsampleHistory<T>(items: readonly T[], maximum: number): T[] {
  if (items.length <= maximum) return [...items];
  if (maximum < 2) throw new RangeError("maximum must be at least 2");
  return Array.from({ length: maximum }, (_, index) =>
    items[Math.round((index * (items.length - 1)) / (maximum - 1))]!,
  );
}
```

`fetchAllFeeHistory` loops until `hasMore` is false, passes the same ISO bounds and limit on every page, validates every response, and returns `downsampleHistory(allPoints, 288)`. The hook sets loading and clears its old error on every range change before starting the request.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test --workspace web -- test/fee-history.test.ts --pool=forks --poolOptions.forks.maxForks=2`

Expected: pagination and downsampling tests pass.

- [ ] **Step 5: Commit history integration**

```bash
git add apps/web/src/lib/api/fetch-fee-history.ts apps/web/src/lib/history apps/web/src/hooks/use-fee-history.ts apps/web/test/fee-history.test.ts
git commit -m "feat(web): paginate and bound fee history"
```

---

### Task 5: Build the unified REST bootstrap and SSE reducer

**Files:**
- Create: `apps/web/src/lib/api/fetch-current-fee.ts`
- Replace: `apps/web/src/lib/api/fetch-recent-blocks.ts`
- Create: `apps/web/src/lib/live/live-reducer.ts`
- Create: `apps/web/src/hooks/use-live-monitor.ts`
- Delete: `apps/web/src/hooks/use-fee-stream.ts`
- Delete: `apps/web/src/hooks/use-recent-blocks.ts`
- Create: `apps/web/test/live-reducer.test.ts`
- Create: `apps/web/test/use-live-monitor.test.tsx`

**Interfaces:**
- Consumes: current/recent REST schemas, `LiveEventSchema`, and Task 3 adapters.
- Produces: `LiveMonitorState`, `reduceLiveEvent(state, event)`, and `useLiveMonitor()`.

- [ ] **Step 1: Write failing reducer tests**

```ts
// apps/web/test/live-reducer.test.ts
import { describe, expect, it } from "vitest";
import { reduceLiveEvent } from "@/lib/live/live-reducer";
import { blockFixture } from "./fixtures";

describe("live reducer", () => {
  it("replaces the old hash when the same block number reorgs", () => {
    const replacement = { ...blockFixture, hash: `0x${"b".repeat(64)}` };
    const state = { fee: null, blocks: [blockFixture] };
    const next = reduceLiveEvent(state, {
      id: `block:${replacement.number}:${replacement.hash}`,
      event: "block-added",
      data: { data: replacement },
    });
    expect(next.blocks).toEqual([replacement]);
  });

  it("ignores finality updates for a different hash", () => {
    const state = { fee: null, blocks: [blockFixture] };
    const next = reduceLiveEvent(state, {
      id: `block-status:${blockFixture.number}:safe`,
      event: "block-status-changed",
      data: { data: { number: blockFixture.number, hash: `0x${"c".repeat(64)}`, finality: "safe" } },
    });
    expect(next).toEqual(state);
  });
});
```

- [ ] **Step 2: Run reducer tests and verify RED**

Run: `npm run test --workspace web -- test/live-reducer.test.ts --pool=forks --poolOptions.forks.maxForks=2`

Expected: FAIL because no unified reducer exists.

- [ ] **Step 3: Implement the pure reducer and fetch functions**

```ts
export type LiveMonitorState = {
  fee: FeeSnapshotDto | null;
  blocks: BlockSummaryDto[];
};

export function reduceLiveEvent(state: LiveMonitorState, event: LiveEventDto): LiveMonitorState {
  if (event.event === "fee-snapshot") return { ...state, fee: event.data.data };
  if (event.event === "block-added") {
    const block = event.data.data;
    const blocks = [block, ...state.blocks.filter((item) => item.number !== block.number)]
      .slice(0, 20);
    return { ...state, blocks };
  }
  const change = event.data.data;
  return {
    ...state,
    blocks: state.blocks.map((block) =>
      block.number === change.number && block.hash.toLowerCase() === change.hash.toLowerCase()
        ? { ...block, finality: change.finality }
        : block,
    ),
  };
}
```

Add REST functions that validate `FeeCurrentResponseSchema` and `RecentBlocksResponseSchema` and return their `data` values.

- [ ] **Step 4: Write the failing hook test before the hook**

Create a small fake `EventSource` that records listeners. Render `useLiveMonitor` with Testing Library's `renderHook`; assert initial REST bootstrap occurs, `fee-snapshot` updates state, and the second `open` event refetches current fees and recent blocks.

Run: `npm run test --workspace web -- test/use-live-monitor.test.tsx --pool=forks --poolOptions.forks.maxForks=2`

Expected: FAIL because `useLiveMonitor` does not exist.

- [ ] **Step 5: Implement `useLiveMonitor` and verify GREEN**

The hook must expose:

```ts
type UseLiveMonitorResult = {
  fee: FeeViewModel | null;
  blocks: BlockViewModel[];
  connection: "connecting" | "live" | "degraded" | "offline";
  bootstrapLoading: boolean;
  feeError: ApiClientError | null;
  blocksError: ApiClientError | null;
  refresh: () => Promise<void>;
};
```

It registers only the three named event listeners, reconstructs and validates each event using `lastEventId`, preserves the last valid state on error, closes the stream on cleanup, and reboots REST data after every successful open following the first.

Run: `npm run test --workspace web -- test/live-reducer.test.ts test/use-live-monitor.test.tsx --pool=forks --poolOptions.forks.maxForks=2`

Expected: reducer and hook tests pass.

- [ ] **Step 6: Commit the live monitor**

```bash
git add apps/web/src/lib/api apps/web/src/lib/live apps/web/src/hooks apps/web/test/live-reducer.test.ts apps/web/test/use-live-monitor.test.tsx
git commit -m "feat(web): integrate live rest and sse flow"
```

---

### Task 6: Implement block search and canonical actions

**Files:**
- Create: `apps/web/src/lib/api/fetch-block.ts`
- Create: `apps/web/src/hooks/use-block-search.ts`
- Modify: `apps/web/src/components/dashboard-filters.tsx`
- Modify: `apps/web/src/components/recent-blocks.tsx`
- Create: `apps/web/test/block-search.test.tsx`
- Create: `apps/web/test/recent-blocks.test.tsx`

**Interfaces:**
- Consumes: `BlockIdentifierSchema`, `BlockResponseSchema`, `BlockViewModel`, and the live block list.
- Produces: `useBlockSearch()`, explicit search submission, `Back to Live`, Etherscan analysis, and share fallback.

- [ ] **Step 1: Write failing search and action tests**

```tsx
it("submits a block number only on Enter", async () => {
  render(<DashboardFilters rangeHours={24} search="" onRangeChange={vi.fn()} onSearch={onSearch} />);
  await user.type(screen.getByRole("searchbox"), "23548192");
  expect(onSearch).not.toHaveBeenCalled();
  await user.keyboard("{Enter}");
  expect(onSearch).toHaveBeenCalledWith("23548192");
});

it("opens the backend-provided Etherscan URL", async () => {
  render(<RecentBlocks blocks={[blockViewFixture]} searchedBlock={null} onBackToLive={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: /analisar bloco/i }));
  expect(open).toHaveBeenCalledWith(blockViewFixture.etherscanUrl, "_blank", "noopener,noreferrer");
});
```

Add a share test that rejects `navigator.share`, falls back to `navigator.clipboard.writeText`, and displays `Link copiado`.

- [ ] **Step 2: Verify RED**

Run: `npm run test --workspace web -- test/block-search.test.tsx test/recent-blocks.test.tsx --pool=forks --poolOptions.forks.maxForks=2`

Expected: FAIL because typing currently changes query state on every key and action buttons have no handlers.

- [ ] **Step 3: Implement validated search and actions**

`fetchBlock(identifier, signal)` validates the identifier locally, calls `apiConfig.blockUrl(identifier)`, validates `BlockResponseSchema`, and returns `toBlockViewModel(data)`. `useBlockSearch` exposes:

```ts
type BlockSearchResult = {
  searchedBlock: BlockViewModel | null;
  searching: boolean;
  error: string | null;
  search: (identifier: string) => Promise<void>;
  backToLive: () => void;
};
```

Replace the network dropdown with a static `Ethereum Mainnet` label and replace the time-range custom listbox with a styled native `<select>`. Remove the Add Metric button. Implement analysis and sharing exactly as asserted.

- [ ] **Step 4: Verify GREEN**

Run: `npm run test --workspace web -- test/block-search.test.tsx test/recent-blocks.test.tsx --pool=forks --poolOptions.forks.maxForks=2`

Expected: search and action tests pass, including keyboard submission and share fallback.

- [ ] **Step 5: Commit block interactions**

```bash
git add apps/web/src/lib/api/fetch-block.ts apps/web/src/hooks/use-block-search.ts apps/web/src/components/dashboard-filters.tsx apps/web/src/components/recent-blocks.tsx apps/web/test/block-search.test.tsx apps/web/test/recent-blocks.test.tsx
git commit -m "feat(web): add block search and actions"
```

---

### Task 7: Render the real domain data with reusable blue tokens

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/page.module.css`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/components/dashboard-header.tsx`
- Modify: `apps/web/src/components/fee-card.tsx`
- Replace: `apps/web/src/components/data-status.tsx`
- Modify: `apps/web/src/components/fee-history-chart.tsx`
- Replace: `apps/web/src/mocks/fee-snapshot.ts`
- Replace: `apps/web/src/mocks/recent-blocks.ts`
- Create: `apps/web/test/dashboard-rendering.test.tsx`

**Interfaces:**
- Consumes: `useLiveMonitor`, `useFeeHistory`, `useBlockSearch`, and all view models.
- Produces: the complete connected dashboard, semantic identity tokens, confidence/trend/cost states, and visible demo mode.

- [ ] **Step 1: Write failing rendering tests**

```tsx
it("renders confidence, transfer cost, and available trend", () => {
  render(<FeeCard snapshot={feeViewFixture} ageMs={4200} />);
  expect(screen.getByText(/confiança alta/i)).toBeVisible();
  expect(screen.getByText("US$ 2,31")).toBeVisible();
  expect(screen.getByText(/12,00%/)).toBeVisible();
});

it("does not invent USD or trend values when unavailable", () => {
  render(<FeeCard snapshot={unavailableFeeViewFixture} ageMs={20000} />);
  expect(screen.getByText(/cotação indisponível/i)).toBeVisible();
  expect(screen.getByText(/histórico insuficiente/i)).toBeVisible();
});
```

Add assertions for the `Demo` badge, `Live/Degraded/Offline` header labels, confidence reasons, stale data, and block finality.

- [ ] **Step 2: Verify RED**

Run: `npm run test --workspace web -- test/dashboard-rendering.test.tsx --pool=forks --poolOptions.forks.maxForks=2`

Expected: FAIL because the current components use the obsolete DTO and status card.

- [ ] **Step 3: Introduce semantic tokens and connected components**

Define the approved identity once:

```css
:root {
  --color-background: #070a12;
  --color-surface: #171923;
  --color-surface-raised: #242733;
  --color-border: #343848;
  --color-text: #f5f7ff;
  --color-text-muted: #9ca3b5;
  --color-primary: #1946e5;
  --color-primary-hover: #123bbf;
  --color-primary-deep: #020068;
  --color-focus: #6f8dff;
  --color-success: #34d399;
  --color-warning: #fbbf24;
  --color-danger: #ef4444;
}
```

Replace raw blue/purple/green/red values in component rules with these semantic variables. `FeeCard` renders recommendation, base/priority/effective values, transfer cost, and trend. `data-status.tsx` becomes a confidence/source-status panel using the backend confidence reasons and no manual Refresh Data button. `page.tsx` composes the unified hooks and passes the searched block separately from the live list. Valid mocks are created from the same contract fixtures and show a visible `Demo` badge.

- [ ] **Step 4: Verify GREEN and responsive DOM behavior**

Run:

```bash
npm run test --workspace web -- test/dashboard-rendering.test.tsx --pool=forks --poolOptions.forks.maxForks=2
npm run lint --workspace web
npm run typecheck --workspace web
```

Expected: rendering tests, lint, and standalone typecheck pass.

- [ ] **Step 5: Commit the connected UI**

```bash
git add apps/web/src/app apps/web/src/components apps/web/src/mocks apps/web/test/dashboard-rendering.test.tsx
git commit -m "feat(web): render connected alphractal dashboard"
```

---

### Task 8: Prove the frontend against the real Express composition

**Files:**
- Create: `apps/web/test/backend-integration.test.ts`
- Modify: `apps/web/README.md`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: the real `createApp`, frontend fetch functions, and shared schemas.
- Produces: an executable cross-workspace contract test and root build/dev scripts.

- [ ] **Step 1: Write the failing integration test**

```ts
// apps/web/test/backend-integration.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../../api/src/app.js";
import { fetchCurrentFee } from "@/lib/api/fetch-current-fee";
import { fetchRecentBlocks } from "@/lib/api/fetch-recent-blocks";
import { blockSummary, feeSnapshot } from "../../api/test/helpers/fixtures.js";

describe("web client against Express", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => close?.());

  it("consumes the current fee and recent-block envelopes emitted by createApp", async () => {
    const fee = feeSnapshot();
    const block = blockSummary(23548192n);
    const dependencies: NonNullable<Parameters<typeof createApp>[0]> = {
      corsOrigins: new Set(),
      getCurrentFeeSnapshot: { execute: async () => fee },
      getFeeHistory: { execute: async () => ({ data: [fee], nextCursor: null }) },
      getRecentBlocks: { execute: async () => [block] },
      getBlockByIdentifier: { execute: async () => block },
      liveSseHub: { handle: (_request, response) => response.end() },
    };
    const app = createApp(dependencies);
    const server = app.listen(0);
    close = () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Expected TCP server");
    const origin = `http://127.0.0.1:${address.port}`;

    await expect(fetchCurrentFee(undefined, `${origin}/api/v1/fees/current`)).resolves.toMatchObject({
      recommendedMaxFeeGwei: expect.any(Number),
    });
    await expect(fetchRecentBlocks(undefined, `${origin}/api/v1/blocks/recent`)).resolves.toHaveLength(1);
  });
});
```

The fetch functions accept an optional URL override strictly for this server-side integration test, while production callers use `apiConfig`:

```ts
export async function fetchCurrentFee(signal?: AbortSignal, url = apiConfig.currentFeeUrl) {
  const response = await fetchJson(url, FeeCurrentResponseSchema, signal);
  return toFeeViewModel(response.data);
}

export async function fetchRecentBlocks(signal?: AbortSignal, url = apiConfig.recentBlocksUrl) {
  const response = await fetchJson(url, RecentBlocksResponseSchema, signal);
  return response.data.map(toBlockViewModel);
}
```

- [ ] **Step 2: Run and verify RED**

Run: `npm run test --workspace web -- test/backend-integration.test.ts --pool=forks --poolOptions.forks.maxForks=2`

Expected: FAIL until the real backend fixture shapes and optional URL boundary are wired correctly.

- [ ] **Step 3: Finish the integration boundary and root scripts**

Add to root `package.json`:

```json
{
  "scripts": {
    "dev:web": "npm run dev --workspace web",
    "build": "npm run build --workspaces --if-present"
  }
}
```

Update `apps/web/README.md` to document `API_SERVER_URL`, mock restrictions, the versioned endpoints, named SSE events, and the exact local commands. Remove the nested `apps/web/package-lock.json`; the root lock is the only npm authority.

- [ ] **Step 4: Run the complete verification matrix**

Run sequentially:

```bash
npm ci
npm run lint
rm -rf apps/web/.next
npm run typecheck
npm run test --workspace web -- --pool=forks --poolOptions.forks.maxForks=2
npm run test --workspace @alphractal/contracts -- --pool=forks --poolOptions.forks.maxForks=2
npm run test --workspace @alphractal/api -- --pool=forks --poolOptions.forks.maxForks=2
API_SERVER_URL=http://localhost:3001 npm run build
git diff --check origin/main...HEAD
```

Expected: clean install; lint, standalone typecheck, all frontend/contract/API tests, and production build exit 0; diff check prints nothing.

- [ ] **Step 5: Perform visual QA and adversarial review**

Run the frontend with mock mode on and inspect 1440×900, 1024×768, 390×844, and 360×800. Verify no document-level horizontal overflow, readable provider names, keyboard-operable controls, confidence/trend/cost states, block search, Back to Live, and share feedback. Then run the adversarial-review skill for API contracts, SSE/reconnection, frontend interactions/accessibility, and production configuration; fix every critical/high finding with a failing regression test first.

- [ ] **Step 6: Commit integration proof and documentation**

```bash
git add apps/web/test/backend-integration.test.ts apps/web/README.md package.json package-lock.json apps/web/package-lock.json
git commit -m "test(web): verify frontend backend integration"
```

---

## Execution Completion Gate

Before any push, fetch `origin/main`, confirm the branch introduces no new commits behind it, rerun the full Task 8 matrix, inspect the final diff, and reconfirm PR #4 as mergeable. Push requires `--force-with-lease` because the feature branch was rebased; merge remains a separate user-approved action.
