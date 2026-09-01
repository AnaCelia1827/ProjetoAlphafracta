# Investor-Oriented Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the real Ethereum dashboard useful to crypto investors by prioritizing native-transfer cost in USD, adding actionable network context, constraining recent blocks, and providing a stable paginated block catalog.

**Architecture:** Shared Zod contracts define an additive block-history endpoint. The Express application reads stable cursor pages from MongoDB, while the Next.js client keeps transport validation, pure investment-facing derivations, and UI state in separate modules. Existing REST/SSE contracts remain compatible, and the dashboard continues retaining twenty live blocks internally while rendering only ten.

**Tech Stack:** Node.js 24, npm 11 workspaces, TypeScript 6/5, Zod 4, Express 5, MongoDB 6, Next.js 16 App Router, React 19, Vitest 3, Testing Library, Iconify Solar.

## Global Constraints

- The primary monetary value is the estimated cost of a 21,000-gas native ETH transfer in USD; Gwei remains secondary technical context.
- The fee ranges are exactly `5m`, `15m`, `1h`, `6h`, and `24h`, represented as `5 | 15 | 60 | 360 | 1440` minutes.
- The network-moment baseline is the trailing 24 hours, with 33rd/67th percentile boundaries and a minimum of twelve priced points spanning at least five minutes.
- The dashboard renders at most ten recent block buttons while retaining the existing twenty-block live window internally.
- The catalog page size is ten; the public API accepts limits from 1 through 50 and uses opaque sequential cursors without a total-page claim.
- The block icon is exactly `solar:box-minimalistic-bold-duotone`, bundled locally and styled only with existing semantic color tokens.
- Existing `/api/v1/blocks/recent`, block lookup, fee REST, and SSE contracts remain backward compatible.
- UI copy is Portuguese; transport/domain code follows the repository's existing English naming.
- Follow `apps/web/AGENTS.md`: use Next.js 16 App Router file conventions and keep interactive state inside focused Client Components.
- Cap every Vitest command at two forks: `--pool=forks --poolOptions.forks.maxForks=2`.
- Run broad test suites, development servers, and builds sequentially to respect the machine memory limit.

---

## File Structure

### Shared contracts

- Modify `packages/contracts/src/blocks.ts`: add block-history query/page schemas and exported DTO types.
- Modify `packages/contracts/test/contracts.test.ts`: lock query bounds and page invariants.

### Backend

- Modify `apps/api/src/domain/blocks/models.ts`: add normalized block-history query/page types.
- Modify `apps/api/src/domain/blocks/ports.ts`: add `findPage` to `ObservedBlockRepository`.
- Create `apps/api/src/application/blocks/get-block-history.ts`: convert persistence outages into the public blocks-unavailable error.
- Modify `apps/api/src/infrastructure/mongodb/mongo-observed-block-repository.ts`: implement stable canonical cursor pagination.
- Modify `apps/api/src/interfaces/http/block-routes.ts`: validate and serve `/history` before the dynamic block route.
- Modify `apps/api/src/app.ts`: require the new query dependency.
- Modify `apps/api/src/runtime.ts`: compose `GetBlockHistory`.
- Modify `apps/api/test/helpers/fakes.ts`: support controlled block pages.
- Modify `apps/api/test/application/block-use-cases.test.ts`: cover application mapping.
- Modify `apps/api/test/infrastructure/mongo-repositories.test.ts`: cover cursor order, anchor stability, and validation.
- Modify `apps/api/test/interfaces/live-http.test.ts`: cover the public endpoint and query validation.

### Frontend data and presentation logic

- Modify `apps/web/src/types/fees.ts`: use minute ranges and preserve historical USD values.
- Modify `apps/web/src/lib/api/view-models.ts`: map priced and unpriced historical snapshots.
- Modify `apps/web/src/lib/api/config.ts`: add the block-history resource.
- Modify `apps/web/src/lib/api/fetch-fee-history.ts`: preserve USD gaps while downsampling.
- Create `apps/web/src/lib/api/fetch-block-history.ts`: validate block-history pages.
- Create `apps/web/src/lib/fees/network-moment.ts`: pure percentile classifier and Portuguese copy.
- Modify `apps/web/src/hooks/use-fee-history.ts`: load exact selected ranges plus the 24-hour baseline.
- Create `apps/web/src/hooks/use-block-catalog.ts`: own cached cursor pages and retry behavior.

### Frontend components and routes

- Create `apps/web/src/components/network-moment-card.tsx`: investor-facing context.
- Create `apps/web/src/components/block-icon.tsx`: locally bundled Solar icon wrapper.
- Create `apps/web/src/components/block-catalog.tsx`: catalog rows, details, pagination, refresh, and search.
- Modify `apps/web/src/components/fee-card.tsx`: make USD the hero and remove confidence/trend telemetry.
- Modify `apps/web/src/components/fee-history-chart.tsx`: plot USD with visible range buttons and Gwei tooltips.
- Modify `apps/web/src/components/dashboard-filters.tsx`: remove the obsolete range select.
- Modify `apps/web/src/components/recent-blocks.tsx`: cap rows, use `BlockIcon`, link to `/blocos`, and remove photographs.
- Modify `apps/web/src/components/dashboard-header.tsx`: use Next `Link` for dashboard/history/catalog navigation.
- Modify `apps/web/src/app/page.tsx`: compose hero, network moment, USD chart, and ten-block projection.
- Modify `apps/web/src/app/page.module.css`: implement approved hierarchy, independent block details, Iconify states, catalog, and responsive behavior.
- Create `apps/web/src/app/blocos/page.tsx`: expose the catalog route.
- Modify `apps/web/package.json` and root `package-lock.json`: add locally bundled Iconify packages.

### Frontend tests

- Modify `apps/web/test/fixtures.ts`: retain priced and unpriced fee snapshots.
- Modify `apps/web/test/view-models.test.ts`: prove USD history mapping.
- Modify `apps/web/test/fee-history.test.ts`: prove USD gaps and cursor traversal.
- Modify `apps/web/test/use-fee-history.test.tsx`: prove exact minute windows and baseline separation.
- Create `apps/web/test/network-moment.test.ts`: prove percentile and analyzing states.
- Modify `apps/web/test/dashboard-rendering.test.tsx`: prove investor copy and telemetry removal.
- Create `apps/web/test/fee-history-chart.test.tsx`: prove USD rendering and five range controls.
- Modify `apps/web/test/recent-blocks.test.tsx`: prove ten-row cap and Solar icon usage.
- Create `apps/web/test/use-block-catalog.test.tsx`: prove cursor stack, failure retention, and refresh.
- Create `apps/web/test/block-catalog.test.tsx`: prove pagination labels and selection.
- Modify `apps/web/test/api-config.test.ts`: prove the same-origin history URL.
- Modify `apps/web/test/backend-integration.test.ts`: consume the new Express endpoint with the shared schema.

---

### Task 1: Define the shared block-history contract

**Files:**
- Modify: `packages/contracts/src/blocks.ts`
- Modify: `packages/contracts/test/contracts.test.ts`

**Interfaces:**
- Produces: `BlockHistoryQuerySchema`, `BlockHistoryResponseSchema`, `BlockHistoryQueryDto`, and `BlockHistoryResponseDto`.
- Consumes: existing `BlockSummarySchema` and the contract package's Zod helpers.

- [ ] **Step 1: Write the failing contract tests**

Add this case under `REST envelopes and queries`:

```ts
it('validates block-history queries and coherent pages', () => {
  const querySchema = schema('BlockHistoryQuerySchema');
  const responseSchema = schema('BlockHistoryResponseSchema');

  expect(querySchema.parse({})).toEqual({ limit: 10 });
  expect(querySchema.parse({ limit: '50', cursor: 'opaque' })).toEqual({
    limit: 50,
    cursor: 'opaque',
  });
  expect(querySchema.safeParse({ limit: 0 }).success).toBe(false);
  expect(querySchema.safeParse({ limit: 51 }).success).toBe(false);
  expect(querySchema.safeParse({ cursor: '' }).success).toBe(false);

  expect(
    responseSchema.safeParse({
      data: [blockSummary],
      page: { nextCursor: 'next', hasMore: true },
    }).success,
  ).toBe(true);
  expect(
    responseSchema.safeParse({
      data: [],
      page: { nextCursor: null, hasMore: true },
    }).success,
  ).toBe(false);
});
```

- [ ] **Step 2: Run the contract test and verify the red state**

Run:

```bash
rtk npm test --workspace @alphractal/contracts -- --pool=forks --poolOptions.forks.maxForks=2 test/contracts.test.ts
```

Expected: FAIL because `BlockHistoryQuerySchema` and `BlockHistoryResponseSchema` are not exported.

- [ ] **Step 3: Implement the schemas and exported types**

Add after `RecentBlocksResponseSchema` in `packages/contracts/src/blocks.ts`:

```ts
export const BlockHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  cursor: z.string().min(1).optional(),
});

export const BlockHistoryResponseSchema = z
  .object({
    data: z.array(BlockSummarySchema).max(50),
    page: z.object({
      nextCursor: z.string().min(1).nullable(),
      hasMore: z.boolean(),
    }),
  })
  .superRefine((response, context) => {
    if (response.page.hasMore !== (response.page.nextCursor !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['page'],
        message: 'hasMore must match nextCursor presence',
      });
    }
  });

export type BlockHistoryQueryDto = z.infer<typeof BlockHistoryQuerySchema>;
export type BlockHistoryResponseDto = z.infer<typeof BlockHistoryResponseSchema>;
```

- [ ] **Step 4: Run contract tests and typecheck**

Run:

```bash
rtk npm test --workspace @alphractal/contracts -- --pool=forks --poolOptions.forks.maxForks=2 test/contracts.test.ts
rtk npm run typecheck --workspace @alphractal/contracts
```

Expected: all contract tests PASS and typecheck exits 0.

- [ ] **Step 5: Commit the contract**

```bash
rtk git add packages/contracts/src/blocks.ts packages/contracts/test/contracts.test.ts
rtk git commit -m "feat(contracts): add block history pagination"
```

---

### Task 2: Implement stable MongoDB block pagination

**Files:**
- Modify: `apps/api/src/domain/blocks/models.ts`
- Modify: `apps/api/src/domain/blocks/ports.ts`
- Create: `apps/api/src/application/blocks/get-block-history.ts`
- Modify: `apps/api/src/infrastructure/mongodb/mongo-observed-block-repository.ts`
- Modify: `apps/api/test/helpers/fakes.ts`
- Modify: `apps/api/test/application/block-use-cases.test.ts`
- Modify: `apps/api/test/infrastructure/mongo-repositories.test.ts`

**Interfaces:**
- Produces: `BlockHistoryQuery { limit: number; cursor?: string }`, `BlockHistoryPage { data: BlockSummary[]; nextCursor: string | null }`, `ObservedBlockRepository.findPage(query)`, and `GetBlockHistory.execute(query)`.
- Consumes: `InvalidQueryError`, `PersistenceUnavailableError`, `BlocksUnavailableError`, and canonical `BlockSummary` documents.

- [ ] **Step 1: Write failing application and repository tests**

Add to `block-use-cases.test.ts`:

```ts
it('returns a repository page and maps persistence failure', async () => {
  const context = setup();
  context.repository.page = {
    data: [blockSummary(20_000_010n)],
    nextCursor: 'next-page',
  };
  const history = new GetBlockHistory(context.repository);

  await expect(history.execute({ limit: 10 })).resolves.toEqual(context.repository.page);

  context.repository.error = new PersistenceUnavailableError();
  await expect(history.execute({ limit: 10 })).rejects.toBeInstanceOf(BlocksUnavailableError);
});
```

Add to `MongoObservedBlockRepository` tests, clearing only the test collection first:

```ts
it('paginates canonical blocks with a stable opaque cursor', async () => {
  await database!.collection('observed_blocks').deleteMany({});
  for (const number of [101n, 102n, 103n, 104n, 105n]) {
    const hash = `0x${number.toString(16).padStart(64, '0')}` as `0x${string}`;
    await blockRepository!.saveCanonical(blockSummary(number, hash));
  }

  const first = await blockRepository!.findPage({ limit: 2 });
  expect(first.data.map((block) => block.number)).toEqual([105n, 104n]);
  expect(first.nextCursor).toEqual(expect.any(String));

  await blockRepository!.saveCanonical(
    blockSummary(106n, `0x${'6a'.padStart(64, '0')}`),
  );
  const second = await blockRepository!.findPage({
    limit: 2,
    cursor: first.nextCursor!,
  });
  expect(second.data.map((block) => block.number)).toEqual([103n, 102n]);
  expect(second.data.some((block) => block.number === 106n)).toBe(false);

  await expect(
    blockRepository!.findPage({ limit: 3, cursor: first.nextCursor! }),
  ).rejects.toThrow(/cursor/i);
});
```

- [ ] **Step 2: Run focused backend tests and verify they fail**

```bash
rtk npm test --workspace @alphractal/api -- --pool=forks --poolOptions.forks.maxForks=2 test/application/block-use-cases.test.ts test/infrastructure/mongo-repositories.test.ts
```

Expected: FAIL because the page types, use case, fake field, and repository method do not exist.

- [ ] **Step 3: Add domain page types and port**

Add to `models.ts`:

```ts
export interface BlockHistoryQuery {
  limit: number;
  cursor?: string;
}

export interface BlockHistoryPage {
  data: BlockSummary[];
  nextCursor: string | null;
}
```

Add to `ObservedBlockRepository`:

```ts
findPage(query: BlockHistoryQuery): Promise<BlockHistoryPage>;
```

Import `BlockHistoryPage` and `BlockHistoryQuery` from `models.ts` in the port.

- [ ] **Step 4: Add the application use case and fake support**

Create `get-block-history.ts`:

```ts
import {
  BlocksUnavailableError,
  PersistenceUnavailableError,
} from '../common/errors.js';
import type {
  BlockHistoryPage,
  BlockHistoryQuery,
} from '../../domain/blocks/models.js';
import type { ObservedBlockRepository } from '../../domain/blocks/ports.js';

export class GetBlockHistory {
  constructor(
    private readonly repository: Pick<ObservedBlockRepository, 'findPage'>,
  ) {}

  async execute(query: BlockHistoryQuery): Promise<BlockHistoryPage> {
    try {
      return await this.repository.findPage(query);
    } catch (error) {
      if (error instanceof PersistenceUnavailableError) {
        throw new BlocksUnavailableError();
      }
      throw error;
    }
  }
}
```

Extend `FakeObservedBlockRepository`:

```ts
page: BlockHistoryPage = { data: [], nextCursor: null };

async findPage(_query: BlockHistoryQuery): Promise<BlockHistoryPage> {
  if (this.error !== null) throw this.error;
  return this.page;
}
```

- [ ] **Step 5: Implement the opaque cursor in MongoDB**

Mirror the proven fee-history pattern. Import `ObjectId`, `Filter`, and `z`, then add:

```ts
const BlockCursorSchema = z.object({
  v: z.literal(1),
  limit: z.number().int().min(1).max(50),
  anchorNumber: z.string().regex(/^(0|[1-9]\d*)$/),
  afterNumber: z.string().regex(/^(0|[1-9]\d*)$/),
  afterId: z.string().regex(/^[a-fA-F0-9]{24}$/),
});

type BlockCursor = z.infer<typeof BlockCursorSchema>;

class InvalidBlockHistoryCursorError extends InvalidQueryError {
  constructor() {
    super(
      [{ field: 'cursor', issue: 'The cursor is invalid or does not match the query' }],
      'The block history cursor is invalid or does not match the query',
    );
    this.name = 'InvalidBlockHistoryCursorError';
  }
}

function encodeBlockCursor(cursor: BlockCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeBlockCursor(encoded: string): BlockCursor {
  try {
    return BlockCursorSchema.parse(
      JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')),
    );
  } catch {
    throw new InvalidBlockHistoryCursorError();
  }
}
```

Add the repository method:

```ts
async findPage(query: BlockHistoryQuery): Promise<BlockHistoryPage> {
  try {
    const filter: Filter<ObservedBlockDocument> = {
      network: 'ethereum-mainnet',
      canonical: true,
    };
    let anchorNumber: bigint | null = null;

    if (query.cursor !== undefined) {
      const cursor = decodeBlockCursor(query.cursor);
      if (cursor.limit !== query.limit) throw new InvalidBlockHistoryCursorError();
      anchorNumber = BigInt(cursor.anchorNumber);
      const afterNumber = Long.fromBigInt(BigInt(cursor.afterNumber));
      filter.number = { $lte: Long.fromBigInt(anchorNumber) };
      filter.$or = [
        { number: { $lt: afterNumber } },
        { number: afterNumber, _id: { $lt: new ObjectId(cursor.afterId) } },
      ];
    }

    const documents = await this.collection()
      .find(filter)
      .sort({ number: -1, _id: -1 })
      .limit(query.limit + 1)
      .toArray();
    const hasMore = documents.length > query.limit;
    const pageDocuments = documents.slice(0, query.limit);
    const first = pageDocuments[0];
    const last = pageDocuments.at(-1);
    const effectiveAnchor = anchorNumber ?? first?.number.toBigInt() ?? null;

    return {
      data: pageDocuments.map(deserializeBlock),
      nextCursor:
        hasMore && effectiveAnchor !== null && last?._id
          ? encodeBlockCursor({
              v: 1,
              limit: query.limit,
              anchorNumber: effectiveAnchor.toString(),
              afterNumber: last.number.toBigInt().toString(),
              afterId: last._id.toHexString(),
            })
          : null,
    };
  } catch (error) {
    if (error instanceof InvalidBlockHistoryCursorError) throw error;
    this.fail(error);
  }
}
```

- [ ] **Step 6: Run the focused tests and backend typecheck**

```bash
rtk npm test --workspace @alphractal/api -- --pool=forks --poolOptions.forks.maxForks=2 test/application/block-use-cases.test.ts test/infrastructure/mongo-repositories.test.ts
rtk npm run typecheck --workspace @alphractal/api
```

Expected: focused tests PASS and typecheck exits 0.

- [ ] **Step 7: Commit persistence pagination**

```bash
rtk git add apps/api/src/domain/blocks/models.ts apps/api/src/domain/blocks/ports.ts apps/api/src/application/blocks/get-block-history.ts apps/api/src/infrastructure/mongodb/mongo-observed-block-repository.ts apps/api/test/helpers/fakes.ts apps/api/test/application/block-use-cases.test.ts apps/api/test/infrastructure/mongo-repositories.test.ts
rtk git commit -m "feat(api): paginate observed block history"
```

---

### Task 3: Expose the block-history REST endpoint

**Files:**
- Modify: `apps/api/src/interfaces/http/block-routes.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/runtime.ts`
- Modify: `apps/api/test/interfaces/live-http.test.ts`
- Modify: `apps/api/test/runtime/resilience.test.ts`
- Modify: `apps/web/test/backend-integration.test.ts`

**Interfaces:**
- Consumes: `BlockHistoryQuerySchema` from Task 1 and `GetBlockHistory` from Task 2.
- Produces: `GET /api/v1/blocks/history?limit=10&cursor=...` with `BlockHistoryResponseSchema`.

- [ ] **Step 1: Write failing HTTP tests**

Extend the `dependencies()` fixture with:

```ts
getBlockHistory: {
  execute: vi.fn(async () => ({
    data: [blockSummary(20_000_001n)],
    nextCursor: 'next-block-page',
  })),
},
```

Add:

```ts
it('validates and serializes block-history pagination', async () => {
  const input = dependencies();
  const response = await request(createApp(input))
    .get('/api/v1/blocks/history')
    .query({ limit: '10' });

  expect(response.status).toBe(200);
  expect(BlockHistoryResponseSchema.parse(response.body).page).toEqual({
    nextCursor: 'next-block-page',
    hasMore: true,
  });
  expect(input.getBlockHistory.execute).toHaveBeenCalledWith({ limit: 10 });

  const invalid = await request(createApp(input)).get('/api/v1/blocks/history?limit=51');
  expect(invalid.status).toBe(400);
  expect(ApiErrorSchema.parse(invalid.body).error.code).toBe('INVALID_QUERY');
});
```

- [ ] **Step 2: Run the HTTP test and verify it fails**

```bash
rtk npm test --workspace @alphractal/api -- --pool=forks --poolOptions.forks.maxForks=2 test/interfaces/live-http.test.ts
```

Expected: FAIL because `getBlockHistory` is absent and `/history` is handled as a block identifier.

- [ ] **Step 3: Parse the shared query and mount `/history` before `/:numberOrHash`**

Add to `block-routes.ts`:

```ts
export interface BlockHistoryQueryUseCase {
  execute(query: BlockHistoryQuery): Promise<BlockHistoryPage>;
}

function parseBlockHistoryQuery(query: Record<string, unknown>): BlockHistoryQuery {
  const result = BlockHistoryQuerySchema.safeParse(query);
  if (!result.success) {
    throw new InvalidQueryError(
      result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'query',
        issue: issue.message,
      })),
    );
  }
  return {
    limit: result.data.limit,
    ...(result.data.cursor === undefined ? {} : { cursor: result.data.cursor }),
  };
}
```

Extend router dependencies and insert this route after `/recent` and before the dynamic route:

```ts
router.get('/history', async (request, response) => {
  const page = await dependencies.getBlockHistory.execute(
    parseBlockHistoryQuery(request.query as Record<string, unknown>),
  );
  response.status(200).json({
    data: page.data.map(serializeBlockSummary),
    page: {
      nextCursor: page.nextCursor,
      hasMore: page.nextCursor !== null,
    },
  });
});
```

- [ ] **Step 4: Compose the dependency in `app.ts` and `runtime.ts`**

Add `getBlockHistory: BlockHistoryQueryUseCase` to `ApiDependencies`. In `createRuntime`, import `GetBlockHistory` and pass:

```ts
getBlockHistory: new GetBlockHistory(adapters.blockRepository),
```

Update every typed `createApp` test fixture. In `apps/web/test/backend-integration.test.ts`, add this dependency beside `getRecentBlocks` so later web typechecks remain green:

```ts
getBlockHistory: {
  execute: async () => ({ data: [block], nextCursor: null }),
},
```

In `runtime/resilience.test.ts`, return the existing local block fixture through the same `{ data, nextCursor }` shape.

- [ ] **Step 5: Run HTTP, runtime, and type checks**

```bash
rtk npm test --workspace @alphractal/api -- --pool=forks --poolOptions.forks.maxForks=2 test/interfaces/live-http.test.ts test/runtime/resilience.test.ts
rtk npm run typecheck --workspace @alphractal/api
```

Expected: focused tests PASS and the runtime composes without missing dependencies.

- [ ] **Step 6: Commit the public endpoint**

```bash
rtk git add apps/api/src/interfaces/http/block-routes.ts apps/api/src/app.ts apps/api/src/runtime.ts apps/api/test/interfaces/live-http.test.ts apps/api/test/runtime/resilience.test.ts apps/web/test/backend-integration.test.ts
rtk git commit -m "feat(api): expose paginated block catalog"
```

---

### Task 4: Preserve historical USD values and derive network moment

**Files:**
- Modify: `apps/web/src/types/fees.ts`
- Modify: `apps/web/src/lib/api/view-models.ts`
- Modify: `apps/web/src/lib/api/fetch-fee-history.ts`
- Modify: `apps/web/src/hooks/use-fee-history.ts`
- Create: `apps/web/src/lib/fees/network-moment.ts`
- Modify: `apps/web/src/components/dashboard-filters.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/test/view-models.test.ts`
- Modify: `apps/web/test/fee-history.test.ts`
- Modify: `apps/web/test/use-fee-history.test.tsx`
- Create: `apps/web/test/network-moment.test.ts`

**Interfaces:**
- Produces: `HistoryRangeMinutes`, `FeeHistoryPoint.maxCostUsd`, `useFeeHistory(rangeMinutes)` returning both selected history and `baseline24h`, and `classifyNetworkMoment(currentUsd, baseline)`.
- Consumes: each snapshot's persisted `estimatedTransferCost`, never the latest quote for old points.

- [ ] **Step 1: Write failing mapping, range, and classifier tests**

Add to `view-models.test.ts`:

```ts
it('keeps the USD value recorded by each historical snapshot', () => {
  expect(toHistoryPoint(feeSnapshotFixture)).toMatchObject({
    maxCostUsd: 2.31,
    recommendedMaxFeeGwei: 50,
  });
  expect(
    toHistoryPoint({
      ...feeSnapshotFixture,
      estimatedTransferCost: {
        status: 'unavailable',
        transactionType: 'native-eth-transfer',
        gasUnits: 21000,
        maxCostEth: 0.00105,
      },
    }),
  ).not.toHaveProperty('maxCostUsd');
});
```

Create `network-moment.test.ts` with fixed timestamps:

```ts
const baseline = Array.from({ length: 12 }, (_, index) => ({
  timestamp: new Date(Date.UTC(2026, 7, 31, 0, index)).toISOString(),
  recommendedMaxFeeGwei: 10 + index,
  recommendedPriorityFeeGwei: 1,
  maxCostUsd: index + 1,
}));

it.each([
  [2, 'cheap'],
  [6, 'normal'],
  [11, 'expensive'],
] as const)('classifies %s USD as %s', (currentUsd, expected) => {
  expect(classifyNetworkMoment(currentUsd, baseline).level).toBe(expected);
});

it('waits for a priced five-minute baseline', () => {
  expect(classifyNetworkMoment(undefined, baseline).level).toBe('analyzing');
  expect(classifyNetworkMoment(2, baseline.slice(0, 11)).level).toBe('analyzing');
  expect(
    classifyNetworkMoment(
      2,
      baseline.map((point, index) => ({
        ...point,
        timestamp: new Date(Date.UTC(2026, 7, 31, 0, 0, index)).toISOString(),
      })),
    ).level,
  ).toBe('analyzing');
});
```

Update the hook test to pass minutes and assert the exact `from`/`to` delta for `5`, `15`, `60`, `360`, and `1440`.

- [ ] **Step 2: Run the focused web tests and verify they fail**

```bash
rtk npm test --workspace web -- --pool=forks --poolOptions.forks.maxForks=2 test/view-models.test.ts test/fee-history.test.ts test/use-fee-history.test.tsx test/network-moment.test.ts
```

Expected: FAIL because USD history, minute ranges, baseline output, and the classifier do not exist.

- [ ] **Step 3: Define priced history and minute ranges**

Replace `HistoryRangeHours` with:

```ts
export type HistoryRangeMinutes = 5 | 15 | 60 | 360 | 1440;

export type FeeHistoryPoint = {
  timestamp: string;
  recommendedMaxFeeGwei: number;
  recommendedPriorityFeeGwei: number;
  maxCostUsd?: number;
};
```

Update `toHistoryPoint`:

```ts
export const toHistoryPoint = (snapshot: FeeSnapshotDto): FeeHistoryPoint => ({
  timestamp: snapshot.timestamp,
  recommendedMaxFeeGwei: snapshot.recommendedMaxFeeGwei,
  recommendedPriorityFeeGwei: snapshot.recommendedPriorityFeeGwei,
  ...(snapshot.estimatedTransferCost.status === 'unavailable'
    ? {}
    : { maxCostUsd: snapshot.estimatedTransferCost.maxCostUsd }),
});
```

Update `DashboardFilters` and `page.tsx` in the same step so the workspace never references the removed `HistoryRangeHours` type. Rename props/state to `rangeMinutes`, pass minute values to `useFeeHistory`, and temporarily expose all five values in the existing select (`5`, `15`, `60`, `360`, `1440`). Task 5 will move those choices into the chart's approved segmented controls.

- [ ] **Step 4: Load the exact selected window and a distinct 24-hour baseline**

Keep one hook boundary and return:

```ts
type FeeHistoryResult = {
  history: FeeHistoryPoint[];
  baseline24h: FeeHistoryPoint[];
  loading: boolean;
  error: string | null;
  refresh(): void;
};
```

Inside the effect, capture one `to` instant and request:

```ts
const baselineFrom = new Date(to.getTime() - 1440 * 60_000);
const selectedFrom = new Date(to.getTime() - rangeMinutes * 60_000);
const baselinePromise = fetchAllFeeHistory(baselineFrom, to, controller.signal);
const selectedPromise =
  rangeMinutes === 1440
    ? baselinePromise
    : fetchAllFeeHistory(selectedFrom, to, controller.signal);
const [baseline24h, history] = await Promise.all([
  baselinePromise,
  selectedPromise,
]);
```

Store results under a request key containing `rangeMinutes` and the refresh version. A rejected range must not reuse another range's `history`; a successful baseline may remain only when it belongs to the same request key.

- [ ] **Step 5: Implement the pure network-moment classifier**

Create:

```ts
import type { FeeHistoryPoint } from '@/types/fees';

export type NetworkMomentLevel = 'cheap' | 'normal' | 'expensive' | 'analyzing';

export type NetworkMoment = {
  level: NetworkMomentLevel;
  label: string;
  message: string;
};

const COPY: Record<NetworkMomentLevel, Omit<NetworkMoment, 'level'>> = {
  cheap: { label: 'Barato', message: 'Bom momento para transacionar' },
  normal: { label: 'Normal', message: 'Custo dentro da faixa habitual' },
  expensive: {
    label: 'Caro',
    message: 'Considere aguardar se não for urgente',
  },
  analyzing: {
    label: 'Analisando condições',
    message: 'Construindo uma referência recente confiável',
  },
};

function result(level: NetworkMomentLevel): NetworkMoment {
  return { level, ...COPY[level] };
}

export function classifyNetworkMoment(
  currentUsd: number | undefined,
  history: readonly FeeHistoryPoint[],
): NetworkMoment {
  const priced = history.filter(
    (point): point is FeeHistoryPoint & { maxCostUsd: number } =>
      point.maxCostUsd !== undefined,
  );
  const first = priced[0];
  const last = priced.at(-1);
  const spanMs = first && last ? Date.parse(last.timestamp) - Date.parse(first.timestamp) : 0;
  if (currentUsd === undefined || priced.length < 12 || spanMs < 5 * 60_000) {
    return result('analyzing');
  }

  const values = priced.map((point) => point.maxCostUsd).sort((a, b) => a - b);
  const p33 = values[Math.floor((values.length - 1) * 0.33)]!;
  const p67 = values[Math.floor((values.length - 1) * 0.67)]!;
  if (currentUsd <= p33) return result('cheap');
  if (currentUsd >= p67) return result('expensive');
  return result('normal');
}
```

- [ ] **Step 6: Run the focused tests and web typecheck**

```bash
rtk npm test --workspace web -- --pool=forks --poolOptions.forks.maxForks=2 test/view-models.test.ts test/fee-history.test.ts test/use-fee-history.test.tsx test/network-moment.test.ts
rtk npm run typecheck --workspace web
```

Expected: focused tests PASS and no old `HistoryRangeHours` reference remains.

- [ ] **Step 7: Commit the investor data model**

```bash
rtk git add apps/web/src/types/fees.ts apps/web/src/lib/api/view-models.ts apps/web/src/lib/api/fetch-fee-history.ts apps/web/src/hooks/use-fee-history.ts apps/web/src/lib/fees/network-moment.ts apps/web/src/components/dashboard-filters.tsx apps/web/src/app/page.tsx apps/web/test/view-models.test.ts apps/web/test/fee-history.test.ts apps/web/test/use-fee-history.test.tsx apps/web/test/network-moment.test.ts
rtk git commit -m "feat(web): derive investor fee context"
```

---

### Task 5: Replace technical telemetry with the USD investor dashboard

**Files:**
- Modify: `apps/web/src/components/fee-card.tsx`
- Create: `apps/web/src/components/network-moment-card.tsx`
- Modify: `apps/web/src/components/fee-history-chart.tsx`
- Modify: `apps/web/src/components/dashboard-filters.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/page.module.css`
- Modify: `apps/web/test/dashboard-rendering.test.tsx`
- Create: `apps/web/test/fee-history-chart.test.tsx`

**Interfaces:**
- Consumes: `FeeViewModel`, selected `FeeHistoryPoint[]`, `baseline24h`, `HistoryRangeMinutes`, and `NetworkMoment` from Task 4.
- Produces: USD-first hero, `NetworkMomentCard`, and a USD chart with five explicit range buttons.

- [ ] **Step 1: Write failing investor-facing component tests**

Replace confidence assertions in `dashboard-rendering.test.tsx` with:

```ts
it('prioritizes native-transfer USD and keeps Gwei secondary', () => {
  render(<FeeCard snapshot={feeViewFixture} ageMs={4200} />);
  expect(screen.getByText('Custo estimado para transferir ETH')).toBeVisible();
  expect(screen.getByText(/US\$\s*2,31/)).toBeVisible();
  expect(screen.getByText(/50.*Gwei/i)).toBeVisible();
  expect(screen.queryByText(/confiança/i)).not.toBeInTheDocument();
});

it('renders actionable network context without source tags', () => {
  render(
    <NetworkMomentCard
      moment={{
        level: 'cheap',
        label: 'Barato',
        message: 'Bom momento para transacionar',
      }}
      error={null}
    />,
  );
  expect(screen.getByText('Momento da rede')).toBeVisible();
  expect(screen.getByText('Bom momento para transacionar')).toBeVisible();
  expect(screen.queryByText(/mempool|persistence|amostra robusta/i)).not.toBeInTheDocument();
});
```

Create `fee-history-chart.test.tsx`:

```ts
it('renders USD first and all five ranges', async () => {
  const user = userEvent.setup();
  const onRangeChange = vi.fn();
  render(
    <FeeHistoryChart
      history={[
        {
          timestamp: '2026-08-31T03:00:00.000Z',
          recommendedMaxFeeGwei: 50,
          recommendedPriorityFeeGwei: 1.8,
          maxCostUsd: 2.31,
        },
      ]}
      rangeMinutes={60}
      onRangeChange={onRangeChange}
      loading={false}
      error={null}
      onRefresh={vi.fn()}
    />,
  );
  for (const label of ['5m', '15m', '1h', '6h', '24h']) {
    expect(screen.getByRole('button', { name: label })).toBeVisible();
  }
  expect(screen.getByText(/US\$\s*2,31/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: '15m' }));
  expect(onRangeChange).toHaveBeenCalledWith(15);
});
```

- [ ] **Step 2: Run the focused tests and verify they fail**

```bash
rtk npm test --workspace web -- --pool=forks --poolOptions.forks.maxForks=2 test/dashboard-rendering.test.tsx test/fee-history-chart.test.tsx
```

Expected: FAIL because the investor components and range props are absent.

- [ ] **Step 3: Make the transfer cost the hero value**

Refactor `FeeCard` so its first heading/value is:

```tsx
<div className={styles.transferHero}>
  <span>Custo estimado para transferir ETH</span>
  <strong>{snapshot?.maxCostUsd === undefined ? 'Cotação indisponível' : formatUsd(snapshot.maxCostUsd)}</strong>
  <small>Estimativa para uma transferência simples de 21.000 gas</small>
</div>
```

Render recommended maximum, priority, base fee, quote status, and data age in a secondary grid. Delete confidence labels and the old trend block from this component.

- [ ] **Step 4: Add `NetworkMomentCard`**

Create a focused component:

```tsx
import styles from '@/app/page.module.css';
import type { NetworkMoment } from '@/lib/fees/network-moment';

export function NetworkMomentCard({
  moment,
  error,
}: {
  moment: NetworkMoment;
  error: string | null;
}) {
  return (
    <article className={`${styles.panel} ${styles.networkMoment}`}>
      <header>
        <span>Momento da rede</span>
        <strong className={styles[moment.level]}>{moment.label}</strong>
      </header>
      <h2>{moment.message}</h2>
      <p>Comparação com os custos observados nas últimas 24 horas.</p>
      {error && <p className={styles.errorMessage}>{error}</p>}
      <small>O custo pode mudar antes do envio da transação.</small>
    </article>
  );
}
```

- [ ] **Step 5: Convert the chart to USD with explicit gaps**

Build SVG segments only from consecutive priced points. Use `maxCostUsd` for the y-axis, maximum, average, current value, and variation. Keep `recommendedMaxFeeGwei` inside the tooltip as secondary text. The empty state for zero priced points is `Histórico em USD indisponível neste período.`

Add the range group:

```tsx
const RANGE_OPTIONS = [
  [5, '5m'],
  [15, '15m'],
  [60, '1h'],
  [360, '6h'],
  [1440, '24h'],
] as const;

<div className={styles.historyRanges} aria-label="Período do histórico">
  {RANGE_OPTIONS.map(([minutes, label]) => (
    <button
      key={minutes}
      type="button"
      aria-pressed={rangeMinutes === minutes}
      className={rangeMinutes === minutes ? styles.rangeActive : undefined}
      onClick={() => onRangeChange(minutes)}
    >
      {label}
    </button>
  ))}
</div>
```

- [ ] **Step 6: Compose the approved dashboard hierarchy**

In `page.tsx`, keep `rangeMinutes` state, call the updated history hook, derive:

```ts
const moment = classifyNetworkMoment(live.fee?.maxCostUsd, history.baseline24h);
```

Render `FeeCard` and `NetworkMomentCard` in the summary. Remove `DataStatus` from the page and remove the old range select from `DashboardFilters` props and markup. Do not delete the DTO status fields because live connection derivation still uses them.

- [ ] **Step 7: Apply semantic-token-only styles and responsive behavior**

Add `transferHero`, `networkMoment`, moment-level, `historyRanges`, USD chart, and focus styles using only `var(--color-*)`. Keep segmented controls horizontally scrollable below 640px and disable nonessential transitions under `prefers-reduced-motion`.

- [ ] **Step 8: Run focused tests, lint, and typecheck**

```bash
rtk npm test --workspace web -- --pool=forks --poolOptions.forks.maxForks=2 test/dashboard-rendering.test.tsx test/fee-history-chart.test.tsx test/use-fee-history.test.tsx
rtk npm run lint --workspace web
rtk npm run typecheck --workspace web
```

Expected: focused tests PASS, no confidence/source tags remain in the rendered dashboard tests, lint and typecheck exit 0.

- [ ] **Step 9: Commit the investor dashboard**

```bash
rtk git add apps/web/src/components/fee-card.tsx apps/web/src/components/network-moment-card.tsx apps/web/src/components/fee-history-chart.tsx apps/web/src/components/dashboard-filters.tsx apps/web/src/app/page.tsx apps/web/src/app/page.module.css apps/web/test/dashboard-rendering.test.tsx apps/web/test/fee-history-chart.test.tsx
rtk git commit -m "feat(web): prioritize investor fee insights"
```

---

### Task 6: Use the official Solar block icon and bound recent blocks

**Files:**
- Create: `apps/web/src/components/block-icon.tsx`
- Modify: `apps/web/src/components/recent-blocks.tsx`
- Modify: `apps/web/src/app/page.module.css`
- Modify: `apps/web/package.json`
- Modify: `package-lock.json`
- Modify: `apps/web/test/recent-blocks.test.tsx`

**Interfaces:**
- Produces: `BlockIcon({ selected?, size? })` and a `RecentBlocks` view that renders at most ten rows.
- Consumes: existing `BlockViewModel[]` and the semantic color tokens.

- [ ] **Step 1: Write failing icon, row-cap, and history-link tests**

Add:

```ts
it('renders at most ten blocks with the official icon and history link', () => {
  const blocks = Array.from({ length: 12 }, (_, index) => ({
    ...blockViewFixture,
    number: String(23_548_192 - index),
    hash: `0x${String(index).padStart(64, '0')}`,
  }));

  render(
    <RecentBlocks
      blocks={blocks}
      searchedBlock={null}
      onBackToLive={vi.fn()}
    />,
  );

  expect(screen.getAllByRole('button', { name: /#23548/i })).toHaveLength(10);
  expect(screen.getAllByTestId('block-icon')).toHaveLength(11);
  expect(screen.getByRole('link', { name: /histórico completo/i })).toHaveAttribute(
    'href',
    '/blocos',
  );
  expect(document.querySelector('img[src*="avatar"]')).toBeNull();
});
```

The eleven icons are ten rows plus the selected detail header.

- [ ] **Step 2: Run the recent-block test and verify it fails**

```bash
rtk npm test --workspace web -- --pool=forks --poolOptions.forks.maxForks=2 test/recent-blocks.test.tsx
```

Expected: FAIL because twelve rows and avatar images are rendered and no `/blocos` link exists.

- [ ] **Step 3: Install locally bundled Iconify packages**

```bash
rtk npm install --workspace web @iconify/react @iconify-icons/solar
```

Expected: `apps/web/package.json` and root `package-lock.json` record both packages.

- [ ] **Step 4: Create the reusable icon wrapper**

```tsx
import { Icon } from '@iconify/react';
import boxMinimalisticBoldDuotone from '@iconify-icons/solar/box-minimalistic-bold-duotone';
import styles from '@/app/page.module.css';

export function BlockIcon({
  selected = false,
  size = 'row',
}: {
  selected?: boolean;
  size?: 'row' | 'detail';
}) {
  return (
    <span
      className={`${styles.blockIcon} ${selected ? styles.blockIconSelected : ''} ${size === 'detail' ? styles.blockIconDetail : ''}`}
      data-testid="block-icon"
      aria-hidden="true"
    >
      <Icon icon={boxMinimalisticBoldDuotone} />
    </span>
  );
}
```

- [ ] **Step 5: Bound and restyle the recent-block component**

Inside `RecentBlocks`, derive:

```ts
const visibleBlocks = blocks.slice(0, 10);
```

Map `visibleBlocks`, replace each avatar with `<BlockIcon selected={isSelected} />`, replace the detail avatar with `<BlockIcon selected size="detail" />`, and add:

```tsx
<Link href="/blocos" className={styles.blockHistoryLink}>
  Ver histórico completo
</Link>
```

Set `.blocksPanel { align-items: start; }` and `.details { align-self: start; }`. Remove avatar hue filters. Style the icon wrapper with currentColor, raised/deep surfaces, and primary/focus semantic tokens only.

- [ ] **Step 6: Run recent-block tests, lint, and typecheck**

```bash
rtk npm test --workspace web -- --pool=forks --poolOptions.forks.maxForks=2 test/recent-blocks.test.tsx
rtk npm run lint --workspace web
rtk npm run typecheck --workspace web
```

Expected: ten rows render, the detail panel does not stretch in CSS, all icons come from the wrapper, and checks pass.

- [ ] **Step 7: Commit the block presentation**

```bash
rtk git add apps/web/src/components/block-icon.tsx apps/web/src/components/recent-blocks.tsx apps/web/src/app/page.module.css apps/web/package.json package-lock.json apps/web/test/recent-blocks.test.tsx
rtk git commit -m "feat(web): refine recent block presentation"
```

---

### Task 7: Build the paginated `/blocos` catalog

**Files:**
- Modify: `apps/web/src/lib/api/config.ts`
- Create: `apps/web/src/lib/api/fetch-block-history.ts`
- Create: `apps/web/src/hooks/use-block-catalog.ts`
- Create: `apps/web/src/components/block-catalog.tsx`
- Modify: `apps/web/src/components/dashboard-header.tsx`
- Create: `apps/web/src/app/blocos/page.tsx`
- Modify: `apps/web/src/app/page.module.css`
- Modify: `apps/web/test/api-config.test.ts`
- Create: `apps/web/test/use-block-catalog.test.tsx`
- Create: `apps/web/test/block-catalog.test.tsx`
- Modify: `apps/web/test/backend-integration.test.ts`

**Interfaces:**
- Consumes: `BlockHistoryResponseSchema`, `BlockViewModel`, `BlockIcon`, `fetchBlock`, and Task 3's endpoint.
- Produces: `fetchBlockHistory({ limit, cursor, signal, url? })`, `useBlockCatalog()`, and the `/blocos` route.

- [ ] **Step 1: Write failing API and hook tests**

Add to `api-config.test.ts`:

```ts
expect(apiConfig.blockHistoryUrl).toBe('/api/v1/blocks/history');
```

Create `use-block-catalog.test.tsx` with a mocked `fetchBlockHistory`:

```ts
it('moves through cached cursor pages and preserves the current page on failure', async () => {
  fetchBlockHistoryMock
    .mockResolvedValueOnce({ blocks: firstBlocks, nextCursor: 'page-2' })
    .mockResolvedValueOnce({ blocks: secondBlocks, nextCursor: null });
  const { result } = renderHook(() => useBlockCatalog());
  await waitFor(() => expect(result.current.blocks).toEqual(firstBlocks));
  expect(result.current.pageNumber).toBe(1);

  await act(() => result.current.next());
  expect(result.current.pageNumber).toBe(2);
  expect(result.current.itemRange).toEqual({ from: 11, to: 20 });

  act(() => result.current.previous());
  expect(result.current.pageNumber).toBe(1);
  expect(fetchBlockHistoryMock).toHaveBeenCalledTimes(2);

  fetchBlockHistoryMock.mockRejectedValueOnce(new Error('catalog unavailable'));
  await act(() => result.current.refresh());
  expect(result.current.pageNumber).toBe(1);
  expect(result.current.blocks).toEqual(firstBlocks);
  expect(result.current.error).toBe('catalog unavailable');
});
```

- [ ] **Step 2: Run the new focused tests and verify they fail**

```bash
rtk npm test --workspace web -- --pool=forks --poolOptions.forks.maxForks=2 test/api-config.test.ts test/use-block-catalog.test.tsx
```

Expected: FAIL because the API function and hook do not exist.

- [ ] **Step 3: Implement the validated client**

Add `blockHistoryUrl` to `apiConfig` and create:

```ts
import { BlockHistoryResponseSchema } from '@alphractal/contracts';
import { apiConfig } from '@/lib/api/config';
import { fetchJson } from '@/lib/api/fetch-json';
import { toBlockViewModel } from '@/lib/api/view-models';

export async function fetchBlockHistory(input: {
  limit: number;
  cursor?: string;
  signal?: AbortSignal;
  url?: string;
}) {
  const query = new URLSearchParams({ limit: String(input.limit) });
  if (input.cursor !== undefined) query.set('cursor', input.cursor);
  const endpoint = input.url ?? apiConfig.blockHistoryUrl;
  const response = await fetchJson(
    `${endpoint}?${query.toString()}`,
    BlockHistoryResponseSchema,
    input.signal,
  );
  return {
    blocks: response.data.map(toBlockViewModel),
    nextCursor: response.page.nextCursor,
  };
}
```

- [ ] **Step 4: Implement the cached sequential page hook**

Use this public shape:

```ts
export type BlockCatalogState = {
  blocks: BlockViewModel[];
  pageNumber: number;
  itemRange: { from: number; to: number };
  canPrevious: boolean;
  canNext: boolean;
  loading: boolean;
  error: string | null;
  next(): Promise<void>;
  previous(): void;
  refresh(): Promise<void>;
};
```

Maintain `pages: Array<{ blocks; nextCursor }>` and `pageIndex`. `next()` reuses `pages[pageIndex + 1]` when cached; otherwise it fetches the current page's `nextCursor`. Do not change `pageIndex` until a fetch succeeds. `previous()` decrements only when positive. `refresh()` fetches page one and replaces the stack only on success; on failure it keeps the visible page and sets `error`.

- [ ] **Step 5: Write and run failing catalog component tests**

Create `block-catalog.test.tsx`:

```ts
it('shows page position and uses sequential controls', async () => {
  const user = userEvent.setup();
  const next = vi.fn(async () => undefined);
  render(
    <BlockCatalogView
      blocks={[blockViewFixture]}
      pageNumber={3}
      itemRange={{ from: 21, to: 21 }}
      canPrevious
      canNext={false}
      loading={false}
      error={null}
      onNext={next}
      onPrevious={vi.fn()}
      onRefresh={vi.fn(async () => undefined)}
    />,
  );
  expect(screen.getByText('Página 3 · itens 21–21')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: /#23548192/ }));
  expect(screen.getByText('Detalhes do bloco')).toBeVisible();
});
```

Run:

```bash
rtk npm test --workspace web -- --pool=forks --poolOptions.forks.maxForks=2 test/block-catalog.test.tsx
```

Expected: FAIL because the catalog view is absent.

- [ ] **Step 6: Build the catalog component and page route**

Create a presentational `BlockCatalogView` with controlled props for tests and an exported `BlockCatalog` container that calls `useBlockCatalog` and the existing block-search hook. Render ten rows, selected details, refresh, `Anterior`, `Próxima`, and the exact label `Página N · itens X–Y`.

Create the App Router page as a Server Component that delegates interactivity:

```tsx
import { BlockCatalog } from '@/components/block-catalog';

export default function BlocksPage() {
  return <BlockCatalog />;
}
```

- [ ] **Step 7: Update navigation with Next `Link`**

Replace route-changing anchors with `Link`:

```tsx
<Link href="/">Visão geral</Link>
<Link href="/#history">Histórico</Link>
<Link href="/blocos">Blocos</Link>
```

Keep hash-only dashboard scrolling client-side, expose an `activePage?: 'dashboard' | 'blocks'` prop, and render the connection pill only when `status` is provided. The catalog passes `activePage="blocks"` and does not open a second SSE connection.

- [ ] **Step 8: Extend the real Express integration test**

Add `getBlockHistory` to the `createApp` fixture and assert:

```ts
await expect(
  fetchBlockHistory({
    limit: 10,
    signal: undefined,
    url: `${origin}/api/v1/blocks/history`,
  }),
).resolves.toMatchObject({
  blocks: [expect.objectContaining({ number: '23548192' })],
  nextCursor: null,
});
```

The helper already accepts the optional `url` parameter solely for this integration test, matching the pattern used by current fee and recent-block clients.

- [ ] **Step 9: Run catalog, integration, lint, typecheck, and build checks**

```bash
rtk npm test --workspace web -- --pool=forks --poolOptions.forks.maxForks=2 test/api-config.test.ts test/use-block-catalog.test.tsx test/block-catalog.test.tsx test/backend-integration.test.ts
rtk npm run lint --workspace web
rtk npm run typecheck --workspace web
rtk npm run build --workspace web
```

Expected: focused tests PASS, `/blocos` is emitted by the build, and all checks exit 0.

- [ ] **Step 10: Commit the historical catalog**

```bash
rtk git add apps/web/src/lib/api/config.ts apps/web/src/lib/api/fetch-block-history.ts apps/web/src/hooks/use-block-catalog.ts apps/web/src/components/block-catalog.tsx apps/web/src/components/dashboard-header.tsx apps/web/src/app/blocos/page.tsx apps/web/src/app/page.module.css apps/web/test/api-config.test.ts apps/web/test/use-block-catalog.test.tsx apps/web/test/block-catalog.test.tsx apps/web/test/backend-integration.test.ts
rtk git commit -m "feat(web): add paginated block catalog"
```

---

### Task 8: Run integrated quality and real-data verification

**Files:**
- Modify only if a failing gate reveals an in-scope defect.
- Verify: `.env` and `apps/web/.env.local` remain ignored and uncommitted.

**Interfaces:**
- Consumes: all previous task deliverables.
- Produces: verified real Alchemy/Coinbase/MongoDB behavior and a clean branch ready for review.

- [ ] **Step 1: Check memory before broad suites**

```bash
rtk free -h
```

Expected: enough available memory to run one capped suite at a time. If available memory is below 3 GiB, stop development servers before continuing.

- [ ] **Step 2: Run complete contract tests**

```bash
rtk npm test --workspace @alphractal/contracts -- --pool=forks --poolOptions.forks.maxForks=2
```

Expected: all contract tests PASS with zero failures.

- [ ] **Step 3: Run complete API tests**

```bash
rtk npm test --workspace @alphractal/api -- --pool=forks --poolOptions.forks.maxForks=2
```

Expected: all API tests, including real MongoDB repository tests, PASS with zero failures.

- [ ] **Step 4: Run complete web tests**

```bash
rtk npm test --workspace web -- --pool=forks --poolOptions.forks.maxForks=2
```

Expected: all web tests PASS with zero failures.

- [ ] **Step 5: Run static and production gates sequentially**

```bash
rtk npm run lint
rtk npm run typecheck
rtk npm run build
rtk npm run format:check
```

Expected: every command exits 0. If formatting fails, run `rtk npx prettier --write` only on files changed by this plan, then rerun all four commands.

- [ ] **Step 6: Start the real backend and frontend**

Use the ignored local environments already configured from `alchemy-example`:

```bash
rtk npm run start --workspace @alphractal/api
rtk npm run dev:web
```

Run them in separate long-lived terminal sessions, not concurrently with broad tests.

- [ ] **Step 7: Verify real REST and SSE data**

```bash
rtk curl -sS http://127.0.0.1:3001/api/v1/fees/current | rtk jq '{usd:.data.estimatedTransferCost.maxCostUsd,source:.data.sources.ethereum,network:.data.metadata.network}'
rtk curl -sS 'http://127.0.0.1:3001/api/v1/blocks/history?limit=10' | rtk jq '{count:(.data|length),page:.page,first:.data[0].number}'
```

Expected: USD is numeric when Coinbase is fresh, source is `alchemy`, network is `ethereum-mainnet`, catalog count is at most ten, and `page` is contract-valid. Verify `/api/v1/live/stream` emits a named `fee-snapshot` event through the frontend proxy.

- [ ] **Step 8: Perform responsive visual and interaction checks**

At desktop (1440px), tablet (1024px), and phone (390px), verify:

- USD is the visually dominant hero value;
- no recommendation-quality, confidence-reason, source, or persistence tag is visible;
- all five history ranges are usable and update real data;
- network moment shows Portuguese decision-oriented copy;
- exactly ten recent block buttons render;
- every block uses the Solar duotone box icon in Alphractal blue;
- the detail card keeps content height instead of stretching;
- `/blocos` navigates forward/back, reports page/item position, keeps the page on errors, and refreshes to a new page-one session;
- keyboard focus is visible and reduced-motion behavior remains usable.

- [ ] **Step 9: Confirm no environment secret is staged**

```bash
rtk git check-ignore -v .env apps/web/.env.local
rtk git status --short
rtk git diff --check
```

Expected: both environment files are ignored, no secret file is staged, and the worktree contains only intentional changes.

- [ ] **Step 10: Commit any final in-scope verification fixes**

If Step 2 through Step 9 required code fixes, stage only those explicit files and commit:

```bash
rtk git commit -m "fix: complete investor dashboard verification"
```

If no fixes were required, do not create an empty commit.
