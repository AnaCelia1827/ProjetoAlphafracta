# Frontend–Backend Integration Design

## Goal

Integrate the Next.js dashboard from PR #4 with the REST and SSE contracts that
already exist on `main`, while preserving the blue Alphractal identity and
making future visual-identity changes inexpensive through semantic design
tokens.

## Scope

This integration covers:

- initial REST bootstrap for current fees, history, and recent blocks;
- the single live SSE connection and all three named event types;
- reconnection reconciliation;
- block search, block selection, Etherscan analysis, and sharing;
- rendering the fee confidence, trend, estimated transfer cost, source status,
  and block finality supplied by the backend;
- production-safe API and mock configuration;
- reusable color tokens;
- frontend contract, hook, component, and integration tests.

The work does not add authentication, multiple networks, configurable metrics,
an internal block-analysis screen, or a new backend endpoint.

## Architecture Decision

The web workspace will depend directly on `@alphractal/contracts`. REST and SSE
payloads will be validated with the same Zod schemas used by the Express API.
Small adapter functions will convert validated DTOs into view models; React
components will not parse transport payloads or duplicate backend types.

This is preferred over generating an OpenAPI client because the monorepo
already contains executable schemas. Keeping hand-written frontend contracts is
explicitly rejected because that duplication caused the current integration
drift.

## API Configuration

The browser uses the same-origin canonical API namespace `/api/v1`. A
server-only `API_SERVER_URL` configures a Next.js rewrite to the Express origin;
it defaults to `http://localhost:3001` only in development and is required in
production. The frontend constructs these resources:

- `/api/v1/fees/current`;
- `/api/v1/fees/history`;
- `/api/v1/blocks/recent`;
- `/api/v1/blocks/:numberOrHash`;
- `/api/v1/live/stream`.

Local development rewrites requests to `http://localhost:3001`. Production
fails configuration when `API_SERVER_URL` is absent and never embeds a
visitor-facing localhost URL. The browser therefore does not need a public API
origin, and deployments retain one place to route REST and the long-lived SSE
response.

Mocks remain available for development and visual testing, but mock mode must
be visibly identified and must not activate in production.

## Bootstrap and Live Data Flow

On mount, the frontend requests the current fee snapshot, recent blocks, and
the selected history interval. The page can render partial success: a history
failure does not hide current fees, and a blocks failure does not close the
live monitor.

After bootstrap, one `EventSource` connects to `/api/v1/live/stream` and
registers explicit listeners for:

- `fee-snapshot`: replace the current validated fee snapshot;
- `block-added`: upsert by block number and hash, replacing a conflicting hash
  for a reorg and keeping at most twenty recent blocks;
- `block-status-changed`: update finality only when both block number and hash
  match.

The SSE message's `lastEventId`, event name, and parsed `data` envelope are
reconstructed into a `LiveEventSchema` input before state changes. Browser
reconnection remains native to `EventSource`. Every successful reconnection
after the first connection refetches current fees and recent blocks because the
MVP does not replay missed events.

The header state is derived as follows:

- `Live`: SSE connected and all required services are current;
- `Degraded`: SSE connected and any source is stale, unavailable, or degraded;
- `Offline`: SSE disconnected.

## Fee History

History requests use `limit=5000` and preserve `from`, `to`, and `limit` while
following opaque `nextCursor` values. The transport retains the complete
validated page contract. After all pages are loaded, the chart adapter keeps at
most 288 evenly spaced chronological points, always preserving the first and
last snapshots, so a 24-hour interval does not render thousands of SVG
vertices.

Changing the time range starts an explicit loading state and prevents data from
the previous range from being presented as current. The network selector is
removed from this MVP because the backend is Ethereum Mainnet-only and no
undocumented `network` query will be sent.

## Block Search and Actions

Recent blocks come from `/blocks/recent` without query parameters. Search is
submitted explicitly by Enter or the search button to
`/blocks/:numberOrHash`, using `BlockIdentifierSchema` before the request. A
searched block temporarily replaces the detail pane without entering the
recent-block window and exposes a `Back to Live` action.

`Analyze Block` opens the backend-provided `etherscanUrl`. `Share` uses
`navigator.share` when available and otherwise copies that canonical URL with
visible success or failure feedback. The non-functional `Add metric` action is
removed until a product requirement exists.

## View Models and Visual Design

The fee view model exposes the exact domain concepts needed by the approved
interface:

- recommended max and priority fee;
- base and effective gas price;
- maximum native-transfer cost in ETH and USD, including unavailable or stale
  price states;
- 24-hour trend, including insufficient-history and unavailable states;
- confidence level and reasons;
- sample size, recommendation state, data age, and source statuses.

Operational source status remains secondary to the confidence card. Block view
models preserve decimal block numbers as strings and expose `finality`,
`feeLevel`, `medianPriorityFeeGwei`, utilization, transaction count, provider,
and Etherscan URL.

The existing Alphractal logo and blue visual direction remain. Raw brand colors
will be replaced by semantic CSS custom properties, including primary,
primary-hover, focus, surface, border, text, success, warning, and danger
tokens. Components consume semantic tokens rather than specific hex values, so
a future identity refresh is localized to the token declarations.

Responsive behavior must preserve readable provider names and controls at the
desktop, tablet, and phone breakpoints. Time-range selection uses a styled
native `select` so keyboard behavior does not depend on a custom listbox.

## Error Handling

REST failures are parsed with `ApiErrorSchema`. Client errors retain `code`,
safe `message`, `details`, and `requestId`, with a safe fallback for invalid or
non-JSON responses. Abort errors remain silent. Permanent bootstrap failures
produce an actionable state instead of an endless `Connecting` label.

The last valid fee snapshot remains visible during temporary SSE failure and is
marked stale according to its age. Reconnection errors do not erase usable
data. Error messages are scoped to the affected panel.

## Testing and Quality Gates

Implementation follows test-driven development. Each behavior is introduced by
a focused failing test, followed by the minimum production change.

Required automated coverage includes:

- URL construction and production configuration;
- REST envelope and API error parsing with shared schemas;
- SSE event validation and reducer behavior for updates, reorgs, and finality;
- bootstrap and reconnection synchronization;
- history cursor traversal and chart point bounding;
- block search and Back to Live behavior;
- Etherscan analysis and share fallback;
- confidence, stale, unavailable, loading, empty, and error rendering;
- keyboard behavior for filters;
- an integration test against the real Express `createApp` composition.

The merge gate requires a clean install, lint, standalone typecheck, all tests,
production build, visual checks at desktop/tablet/phone widths, and an
adversarial review with no open critical or high findings. Push and merge occur
only after these gates pass and the PR is reconfirmed mergeable against the
latest `main`.
