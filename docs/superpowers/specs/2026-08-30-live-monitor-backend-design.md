# Live Monitor Backend Design

**Date:** 2026-08-30  
**Status:** Approved
**Authority:** `docs/architecture.md` and `docs/api/fees-contract.md`

## Goal

Design the production-facing backend behavior for the Alphractal Live Monitor
MVP. The design extends the initial Fees-only concept with explainable
confidence, a 24-hour trend, a fixed native ETH transfer cost estimate, recent
block observation, block lookup, finality tracking and one unified SSE channel.

The implementation remains a read-only TypeScript/Express modular monolith.

## Scope

The backend must:

- ingest pending Ethereum transactions through Alchemy;
- read current fee data and blocks through Alchemy RPC;
- ingest ETH/USD through Coinbase;
- calculate and publish one fee recommendation every five seconds and on each
  new block;
- retain valid fee snapshots and observed blocks for 30 days;
- serve current and historical fee data;
- serve the 20 most recent blocks;
- look up a post-EIP-1559 block by number or hash;
- publish fee and block events through one SSE connection;
- degrade without stopping live delivery when Coinbase or MongoDB fails.

## Non-goals

- Multiple networks
- Pre-EIP-1559 block analysis
- Token transfer or smart-contract gas estimation
- Internal block-analysis page
- Authentication or transaction submission
- Redis, queues or microservices
- Second Ethereum provider or price fallback
- Functional Dashboard, History or advanced-filter pages

## Product decisions

| Topic           | Decision                                                                        |
| --------------- | ------------------------------------------------------------------------------- |
| Network         | Fixed Ethereum Mainnet                                                          |
| Transfer cost   | Maximum cost for a native ETH transfer using 21,000 gas                         |
| Trend           | Median of the latest five minutes versus the equivalent window 24 hours earlier |
| Confidence      | Qualitative `high`, `medium`, `low` or `unavailable` with reasons               |
| Fee graph       | Recommended Max Fee; default range one hour                                     |
| Fee composition | Base Fee + Priority Fee; Max Fee is a separate ceiling                          |
| Block list      | Latest 20, newest first; frontend shows three with scrolling                    |
| Block fee level | Percentiles of Effective Gas Price over the prior hour                          |
| Block finality  | `latest`, `safe` and `finalized`                                                |
| Block search    | Number or hash; search result does not alter the recent list                    |
| Analyze Block   | Open canonical Etherscan URL                                                    |
| Refresh         | Automatic SSE only; no manual refresh button                                    |

## Chosen architecture

Fees and blocks are separate resources and modules. REST preserves those
boundaries, while a single `/api/v1/live/stream` carries named events for both.

```text
Alchemy pending tx ──────────────> MempoolCollector ───────┐
Alchemy fee RPC ─────────────────> EthereumFeeSource ─────┼─> FeeMonitor
Coinbase ticker ─────────────────> PriceSource ───────────┘      │
                                                                  ├─> FeeSnapshotRepository
Alchemy new heads/full blocks ──> BlockObserver ─> BlockAnalyzer ┤
                                                    │             └─> LiveEventPublisher
                                                    └─> ObservedBlockRepository

REST controllers <──────────── application use cases ───────────> SSE hub
```

This approach avoids embedding 20 blocks in every five-second fee event and
avoids maintaining two EventSource connections.

## Source layout

```text
apps/api/src/
  domain/
    fees/
      fee-estimator.ts
      fee-confidence.ts
      fee-trend.ts
      transfer-cost.ts
      models.ts
      ports.ts
    blocks/
      block-analyzer.ts
      block-fee-level.ts
      block-finality.ts
      models.ts
      ports.ts
  application/
    fees/
      calculate-fee-snapshot.ts
      get-current-fee-snapshot.ts
      get-fee-history.ts
    blocks/
      observe-block.ts
      get-recent-blocks.ts
      get-block-by-identifier.ts
      update-block-finality.ts
  infrastructure/
    alchemy/
      alchemy-mempool-client.ts
      alchemy-fee-client.ts
      alchemy-block-client.ts
    coinbase/
      coinbase-price-client.ts
    mongodb/
      mongo-fee-snapshot-repository.ts
      mongo-observed-block-repository.ts
  interfaces/
    http/
      fee-routes.ts
      block-routes.ts
      error-middleware.ts
    sse/
      live-sse-hub.ts
  config/
    env.ts
  app.ts
  server.ts
```

Files may be grouped further when an implementation is genuinely small, but
the domain boundaries and dependency direction must remain intact.

## Domain and application boundaries

### Fees

`FeeEstimator` consumes normalized mempool bids, current/next Base Fee and
`eth_feeHistory` rewards. It returns Gwei values without knowing `viem` or RPC.

`FeeConfidenceEvaluator` evaluates only the evidence behind the fee
recommendation. Coinbase and MongoDB states are excluded.

`FeeTrendCalculator` reads historical Max Fee values through a repository port
and returns a discriminated available/insufficient result.

`TransferCostCalculator` applies the fixed 21,000-gas native-transfer rule.

`CalculateFeeSnapshot` coordinates those pure services, publishes live state
and persists only newly calculated current snapshots.

### Blocks

`BlockAnalyzer` converts a normalized full block into `BlockSummary`. It
calculates effective transaction tips, their median, Effective Gas Price and
utilization.

`BlockFeeLevelClassifier` compares the block against a contextual one-hour
window. It does not call MongoDB directly.

`BlockFinalityResolver` compares a canonical block with `safe` and `finalized`
heads.

`ObserveBlock` updates the in-memory recent window, persists the canonical
summary and emits events. `GetBlockByIdentifier` performs an on-demand RPC
lookup and never inserts the result into the recent window solely because it
was searched.

## Fee calculation inputs

The estimator receives normalized values in wei:

- latest Base Fee;
- next Base Fee projection from the final `baseFeePerGas` entry returned by
  `eth_feeHistory`;
- recent reward percentiles from `eth_feeHistory`;
- pending EIP-1559 and legacy transactions from a rolling 30-second window.

Pending EIP-1559 priority capacity at Base Fee `B` is:

```text
max(0, min(maxPriorityFeePerGas, maxFeePerGas - B))
```

Legacy priority capacity is:

```text
max(0, gasPrice - B)
```

Malformed, negative or infeasible samples are discarded. The initial estimator
uses these named parameters:

- mempool window: 30 seconds;
- `eth_feeHistory` depth: 10 canonical blocks;
- reward percentile requested from each historical block: P60;
- pending priority statistic: P60;
- Base Fee headroom: 12.5% over the greater of the latest and projected Base
  Fee.

The historical priority candidate is the median of the P60 rewards returned for
the 10 blocks. The recommendation is:

```text
recommendedPriorityFee =
  max(P60(pending effective tips), median(historical P60 rewards))

baseFeeReference = max(latestBaseFee, projectedNextBaseFee)

recommendedMaxFee =
  baseFeeReference × 1.125 + recommendedPriorityFee

effectiveGasPrice =
  latestBaseFee + recommendedPriorityFee
```

The 12.5% headroom corresponds to the maximum Base Fee increase from one block
to the next under EIP-1559. The estimator targets inclusion within the next two
blocks under ordinary proposer selection; it is a recommendation, not a
guarantee.

All parameters live in one typed domain policy object and receive focused
boundary tests. Controllers and adapters cannot reproduce or override the
policy.

All non-median percentiles use the nearest-rank method over values sorted in
ascending order: index `ceil(percentile × count) - 1`. Missing historical
rewards are discarded. At least one pending candidate and one current Base Fee
are required; otherwise the application preserves the last-known result.

This design does not claim that a mempool sample is global. Every snapshot
identifies Alchemy as its observed source.

## Snapshot cadence and state

`CalculateFeeSnapshot` runs:

- every five seconds;
- immediately after a canonical block is observed.

Concurrent triggers coalesce so only one calculation runs at a time. If a block
arrives during a calculation, one additional calculation runs afterward.

A successful calculation produces `recommendationState: current` and is
eligible for persistence. When required Alchemy evidence becomes unusable, the
application republishes the last valid numbers as `last-known` with increasing
`dataAgeMs` and `confidence.level: unavailable`. Repeated last-known states are
not inserted into `fee_snapshots`.

## Transfer cost

The backend, not the frontend, owns the calculation:

```text
maxCostEth = recommendedMaxFeeGwei × 10^-9 × 21000
maxCostUsd = maxCostEth × ethUsd
```

The response includes `transactionType: native-eth-transfer` and
`gasUnits: 21000`. Values are calculated with full internal precision and
rounded only for JSON serialization according to one shared decimal policy.

Price states:

- `fresh`: current Coinbase quote;
- `stale`: last quote retained with its timestamp;
- `unavailable`: no quote has ever been received; ETH cost remains available,
  USD fields are absent.

Price state does not change fee confidence.

Serialization rounds half away from zero: Gwei to at most 9 decimal places,
ETH to 18, USD to 6, and percentages to 2.

## 24-hour trend

The current window is `[now - 5m, now]`. The comparison window is
`[now - 24h - 5m, now - 24h]`. Only persisted `current` snapshots participate.

The calculation is:

```text
percentChange = ((currentMedian - previousMedian) / previousMedian) × 100
```

If either window is empty, or if `previousMedian` is zero, the result is
`insufficient-history`. If the historical repository is unavailable, the
result is `unavailable` with reason `history-unavailable`. The API never
substitutes zero percent.

## Confidence policy

Confidence uses three dimensions:

1. age of the last successful mempool and Ethereum updates;
2. normalized pending-sample size;
3. relative interquartile range of effective priority bids.

Initial configurable thresholds:

| Level         | Required source age                                       | Sample size | Relative IQR |
| ------------- | --------------------------------------------------------- | ----------- | ------------ |
| `high`        | both <= 10s                                               | >= 500      | <= 0.50      |
| `medium`      | both <= 20s                                               | >= 100      | <= 1.00      |
| `low`         | usable but misses a medium threshold                      | > 0         | finite       |
| `unavailable` | a required source > 30s old/missing, or no usable samples | 0 allowed   | any          |

Relative IQR is `(P75 - P25) / median`. If the median is zero, stability cannot
qualify as high or medium. The worst dimension determines the final level.

Mempool and Ethereum source status is `fresh` through 10 seconds, `stale` above
10 through 30 seconds, and `unavailable` when older than 30 seconds or never
received. Coinbase price status is `fresh` through 30 seconds, `stale` after 30
seconds when a prior quote exists, and `unavailable` before the first quote.

Reason codes are selected from:

- `fresh-data` / `aging-data` / `missing-data`;
- `stable-fees` / `volatile-fees`;
- `strong-sample` / `weak-sample`.

Thresholds are configuration, not environment-specific business logic spread
through the code. These initial values must later be calibrated against
observed inclusion outcomes.

## Block analysis

### Priority Fee

For every valid transaction:

- EIP-1559 effective tip:
  `max(0, min(maxPriorityFeePerGas, maxFeePerGas - baseFeePerGas))`;
- legacy effective tip: `max(0, gasPrice - baseFeePerGas)`.

`medianPriorityFeeGwei` is the median of valid effective tips. For an even
sample, it is the arithmetic mean of the two central values.
`effectiveGasPriceGwei` is Base Fee plus that median.

An empty valid-tip set yields median zero, not an error.

### Utilization

```text
utilizationPercent = gasUsed / gasLimit × 100
```

Zero `gasLimit` is rejected as malformed provider data.

### Fee level

The comparison set contains canonical observed blocks from the one-hour period
ending immediately before the target block. Searched blocks use persisted
context when available; the backend does not issue hundreds of RPC calls to
reconstruct missing historical context.

At least 20 comparison blocks are required. Otherwise `feeLevel` is
`unavailable`.

With sufficient context:

- below P25: `low`;
- P25 to below P75: `normal`;
- P75 to below P90: `elevated`;
- P90 or above: `high`.

### Finality and reorgs

The observer resolves `safe` and `finalized` heads on each new canonical head.
A block is:

- `finalized` when its canonical number/hash is at or behind the finalized head;
- otherwise `safe` when at or behind the safe head;
- otherwise `latest`.

If a new canonical hash appears for an existing recent number, it replaces the
old item. `block-added` with the same number and a new hash means replacement.
The former database document is marked noncanonical and excluded from windows.

## REST interface

The normative payloads and errors live in `docs/api/fees-contract.md`.

| Endpoint                           | Use case                                 |
| ---------------------------------- | ---------------------------------------- |
| `GET /api/v1/fees/current`         | Last current or last-known fee state     |
| `GET /api/v1/fees/history`         | Cursor-paginated snapshots for the graph |
| `GET /api/v1/blocks/recent`        | Up to 20 canonical blocks, newest first  |
| `GET /api/v1/blocks/:numberOrHash` | On-demand post-EIP-1559 block lookup     |

Block identifiers are parsed before provider access. Mainnet block 12965000 is
the minimum supported number; a hash is rejected after retrieval when its block
lacks `baseFeePerGas`. Search results neither alter nor reorder the recent list.

## SSE interface

`GET /api/v1/live/stream` is the only EventSource connection. It publishes:

- `fee-snapshot` with a complete `FeeSnapshot`;
- `block-added` with a complete `BlockSummary`;
- `block-status-changed` with number, hash and finality.

It sends `retry: 3000` and a heartbeat comment every 15 seconds. There is no
event replay in the MVP. On reconnection, the frontend reloads
`/fees/current` and `/blocks/recent`.

Slow clients have a bounded outbound buffer. A client that cannot consume
within that bound is disconnected and relies on EventSource reconnection plus
REST resynchronization.

## Persistence

### `fee_snapshots`

MongoDB time-series collection:

- `timeField: timestamp`;
- `metaField: metadata`;
- TTL: 30 days;
- only valid `current` calculations are inserted.

### `observed_blocks`

Normal collection:

- numeric internal block number suitable for sorting;
- external serialization as a decimal string;
- partial unique index by network and number where `canonical: true`;
- unique index by network and hash;
- timestamp index for one-hour windows;
- canonical flag for reorg handling;
- expiration after 30 days.

The application keeps enough in-memory state for live operation when MongoDB
is down. History returns 503 while current fees, recent in-memory blocks, block
lookup and SSE continue when their providers are healthy.

## Bootstrap and reconnection flow

The frontend:

1. requests `/fees/current`;
2. requests `/blocks/recent`;
3. opens `/live/stream`;
4. selects the newest recent block initially;
5. applies live events by resource identity.

When a new block arrives while the user inspects an older block, the selection
does not change. The UI presents `New block available`. A searched block
replaces only the detail view and presents `Back to Live`.

Header status is frontend-derived:

- `Live`: EventSource open and all reported services healthy;
- `Degraded`: EventSource open with stale/unavailable/degraded status;
- `Offline`: EventSource closed or reconnecting.

## Error handling

REST uses the shared error envelope and never exposes provider messages, stack
traces or credentials.

Provider failures map to stable domain errors. Timeouts are bounded. A block
lookup is never retried indefinitely inside a request. WebSocket clients use
heartbeat and exponential backoff with jitter.

SSE remains open during recoverable source failures. The five-second live state
communicates staleness. MongoDB failure never blocks calculation or publishing.

## Security

- Alchemy credentials exist only in backend environment variables.
- CORS uses an explicit allowlist.
- Helmet and JSON body limits remain enabled.
- Block identifiers are validated before RPC use.
- User input is never interpolated into MongoDB operators or RPC methods.
- Logs redact credentials and do not record full raw mempool transactions.
- Etherscan URLs are constructed from validated chain and block identifiers.

## Testing

### Contract tests

- Every documented success/error fixture parses with `packages/contracts`.
- Malformed dates, numbers, hashes, enums and discriminated unions fail.
- API integration responses parse through the shared schemas.

### Domain tests

- native transfer cost at 21,000 gas;
- trend medians, negative variation and insufficient history;
- every confidence boundary and reason;
- EIP-1559 and legacy effective-tip calculations;
- median with odd/even/empty samples;
- utilization and zero-limit rejection;
- percentile boundaries and insufficient context;
- latest/safe/finalized transitions;
- canonical replacement during a reorg.

### Application tests

- five-second and new-block triggers coalesce;
- last-known values are not persisted repeatedly;
- Coinbase failure leaves fee confidence unchanged;
- MongoDB failure leaves current/SSE paths alive;
- searched blocks do not enter the recent list;
- pre-EIP-1559 lookup returns the documented error.

### Interface tests

- all REST endpoints and error mappings;
- SSE named events, heartbeat and retry;
- reconnect bootstrap without replay;
- slow-client disconnection behavior;
- request ID, CORS, caching and content types.

All Vitest runs use at most two workers/forks.

## Delivery sequence

The implementation plan should decompose this design into independently
verifiable stages:

1. executable contracts;
2. pure fee-domain additions;
3. block-domain rules;
4. Alchemy and Coinbase adapters;
5. MongoDB repositories;
6. application orchestration;
7. REST endpoints;
8. unified SSE;
9. resilience and integrated verification.

No implementation begins until this written design is reviewed and approved.
