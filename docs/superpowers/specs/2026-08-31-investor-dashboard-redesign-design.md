# Investor-Oriented Dashboard Redesign

## Goal

Refocus the Alphractal dashboard on crypto investors who want to understand
the practical cost of using Ethereum without first interpreting raw gas units.
USD becomes the primary language for transfer-cost decisions, while Gwei
remains available as secondary technical context.

The redesign must preserve the dark Alphractal layout established in Figma and
the blue identity already implemented in the repository. It also fixes the
unbounded recent-block layout, adds a historical block catalog, and replaces
the photographic block thumbnail with the official
`solar:box-minimalistic-bold-duotone` icon.

## Approved Product Direction

The dashboard follows the product-first approach approved during the visual
review:

- the estimated USD cost of a native ETH transfer is the hero metric;
- the current Gwei values remain visible but visually secondary;
- the operational "Recommendation quality" panel is removed;
- a concise "Network moment" insight replaces operational telemetry;
- fee history is plotted in USD and supports `5m`, `15m`, `1h`, `6h`, and
  `24h` ranges;
- the dashboard shows at most ten recent blocks;
- `/blocos` provides the complete persisted catalog with sequential cursor
  pagination and a visible page/position indicator;
- block details no longer stretch to match the list column;
- every block representation uses the official Solar duotone box icon.

## Scope

### Included

- redesigning the fee summary and current-network context;
- using historically recorded USD transfer costs in the fee chart;
- adding the five approved fee-history intervals;
- limiting the live dashboard block list to ten items;
- adding a paginated block-history API backed by MongoDB;
- adding the `/blocos` Next.js route and catalog navigation;
- making block details independently sized;
- adding the Iconify Solar icon as a locally bundled dependency;
- updating shared contracts, view models, API clients, tests, and responsive
  styles needed by these changes.

### Excluded

- configurable transaction types such as ERC-20 transfers or swaps;
- multi-network support;
- forecasts or guarantees about future gas prices;
- authentication, saved watchlists, alerts, or personalized advice;
- numbered random-access pagination or a total page count;
- replacing the current Alphractal blue design tokens with the purple Figma
  exploration palette.

## Visual System

The implementation uses the existing semantic tokens in `globals.css`:

- background `--color-background`;
- surfaces `--color-surface` and `--color-surface-raised`;
- borders `--color-border`;
- primary states `--color-primary`, `--color-primary-hover`, and
  `--color-primary-deep`;
- text `--color-text` and `--color-text-muted`;
- semantic success, warning, danger, and focus tokens.

Components must not introduce new raw brand hex values. This preserves the
approved blue logo direction and keeps a future identity change localized to
the token declarations.

The block icon is imported from Iconify as
`solar:box-minimalistic-bold-duotone`. The icon data is bundled locally so the
dashboard does not depend on the public Iconify API at runtime. Its foreground
uses `currentColor`; the duotone opacity remains intact. The normal state uses
the raised surface and `--color-primary-text`; the selected state uses the
primary-to-deep gradient with the existing focus color. Photographic avatars
and ad-hoc SVG substitutes are removed from block rows and details.

## Dashboard Information Architecture

### Transfer-cost hero

The first and largest value is labeled "Custo estimado para transferir ETH" and
shows the maximum USD cost supplied by `estimatedTransferCost.maxCostUsd` for a
21,000-gas native ETH transfer. The card explicitly identifies the operation
so users do not mistake it for the cost of a token transfer or swap.

Secondary information includes:

- maximum recommended fee in Gwei;
- priority fee in Gwei;
- base fee in Gwei;
- the ETH/USD quote used by the estimate when available;
- the age of the displayed snapshot in compact language.

When the price is stale, the USD value remains visible with a stale-price
label. When price is unavailable, the card displays "Cotação indisponível" and
promotes the Gwei recommendation as the temporary fallback. It never derives a
USD value from an absent or unsafe quote.

### Network moment

The old confidence, evidence tags, provider grid, and persistence status are
removed from the primary dashboard. Operational errors remain available only
when they affect the user's data.

"Network moment" compares the current priced native-transfer cost with the
priced snapshots from the trailing 24 hours. The presentation classifier is a
pure, tested frontend function:

- **Cheap:** current cost is at or below the 33rd percentile;
- **Normal:** current cost is above the 33rd and below the 67th percentile;
- **Expensive:** current cost is at or above the 67th percentile;
- **Analisando condições:** fewer than twelve priced observations exist, the
  observations span less than five minutes, or the current quote is
  unavailable.

The corresponding user copy is:

- Cheap: "Bom momento para transacionar";
- Normal: "Custo dentro da faixa habitual";
- Expensive: "Considere aguardar se não for urgente";
- Analyzing: "Construindo uma referência recente confiável".

This context is a network-cost explanation, not financial advice. A short
disclaimer states that costs can change before a transaction is submitted.

### USD fee history

The history chart uses the `maxCostUsd` recorded inside each historical fee
snapshot. It must not reprice old gas observations using the latest ETH/USD
quote.

Range identifiers are minute-based values `5`, `15`, `60`, `360`, and `1440`.
Each selection creates exact `from` and `to` timestamps for the existing fee
history endpoint. The current cursor traversal remains, and the final series
is downsampled to at most 288 points while preserving its first and last priced
observations.

Snapshots without a USD price do not become zero. They create gaps in the
series. If no priced point exists for the selected range, the chart explains
that USD history is unavailable and offers Gwei only in a compact technical
fallback state. Tooltips show USD first, followed by Gwei and timestamp.

The range controls are visible segmented buttons in this order: `5m`, `15m`,
`1h`, `6h`, `24h`. They use real buttons with an accessible pressed state and
remain horizontally scrollable on narrow screens.

## Recent Blocks on the Dashboard

The live monitor may continue retaining twenty blocks internally for SSE and
reorg reconciliation, but the dashboard renders only `blocks.slice(0, 10)`.
The list header contains a "View complete history" link to `/blocos`.

The two-column block section uses `align-items: start`. The detail panel uses
its content height and never stretches to match the ten-row list. On narrow
screens the columns stack, with the selected block details following the list.

Each row shows:

- the official Solar block icon;
- block number and relative observation time;
- finality or fee-level label in plain Portuguese;
- base fee in Gwei as technical block context.

USD is not reconstructed for old block rows from the current ETH price. The
product-level USD cost remains in the fee snapshot and history areas, where the
quote and gas assumptions are auditable. Block details continue showing base
fee, priority fee, effective gas price, utilization, transaction count,
finality, provider, and the Etherscan action.

## Historical Block Catalog

### Public contract

Add a new endpoint without changing `/api/v1/blocks/recent`:

```text
GET /api/v1/blocks/history?limit=10&cursor=<opaque>
```

The query contract accepts:

- `limit`: integer from 1 to 50, default 10;
- `cursor`: optional non-empty opaque string.

The response follows the existing page convention:

```json
{
  "data": [],
  "page": {
    "nextCursor": null,
    "hasMore": false
  }
}
```

`data` contains the existing `BlockSummaryDto`; no guessed price field is
added. The response schema enforces `hasMore === (nextCursor !== null)` and a
maximum of fifty rows.

### Stable MongoDB pagination

The observed-block repository gains a page query over canonical persisted
blocks ordered by block number descending, with `_id` as a deterministic tie
breaker. It fetches `limit + 1` records to determine `hasMore`.

The cursor contains a version, the first-page anchor, the last block number and
document identity from the returned page, and the requested limit. It is
base64url-encoded and validated before use. The anchor prevents blocks observed
after page one from shifting records into an in-progress catalog session.
Malformed cursors or cursors reused with another limit return the existing safe
invalid-query error envelope.

Only canonical records are returned. A reorg replacement therefore appears in
future catalog sessions without duplicating the replaced block in the current
page sequence.

### `/blocos` behavior

The new page uses ten rows per page. It stores fetched pages and their cursors
in a client-side page stack:

- `Next` fetches the next opaque cursor and increments the visible page number;
- `Previous` displays the cached prior page without refetching it;
- `Previous` is disabled on page one;
- `Next` is disabled when `hasMore` is false;
- the label reads `Página N · itens X–Y`, for example
  `Página 3 · itens 21–30`.

Because the API intentionally does not count the full collection, the UI does
not claim a total page count. A visible refresh action starts a new catalog
session at page one so newly observed blocks can enter the result.

Rows reuse the Solar icon and expose block number, timestamp, finality, base
fee, transaction count, and utilization. Selecting a row opens its details on
the same page using the existing block view model and Etherscan URL. The page
also retains explicit search by block number or hash.

## Components and Boundaries

The redesign keeps transport, presentation logic, and rendering separate:

- API functions validate responses using `@alphractal/contracts`;
- history and block-catalog hooks own requests, cancellation, cursor state,
  and retries;
- pure adapters convert fee snapshots into priced chart points;
- a pure network-moment classifier owns percentile rules and fallback states;
- `TransferCostCard`, `NetworkMomentCard`, `FeeHistoryChart`,
  `RecentBlocks`, and catalog components receive view models only;
- Iconify styling is encapsulated in a reusable `BlockIcon` component.

The current `DataStatus` component is removed from the dashboard. Low-level
source and persistence fields remain in the shared DTO for diagnostics and
connection-state derivation; they are not presented as investor insights.

## Data Flow

1. Dashboard bootstrap requests current fee, trailing 24-hour fee history, and
   recent blocks.
2. The current snapshot renders the hero value; trailing history provides the
   network-moment baseline.
3. The selected chart range reuses the 24-hour data when already complete or
   requests its own exact interval when necessary.
4. SSE continues updating the current fee and the internal twenty-block live
   window.
5. A new fee snapshot recomputes the hero and network-moment classification.
6. The dashboard projects ten blocks from the internal live window.
7. `/blocos` uses only the history endpoint and its own cursor stack; incoming
   SSE events do not mutate an active historical page.

## Error and Empty States

- Current fee failure: keep the last valid snapshot and mark it as outdated;
  if none exists, show a focused retry state.
- Quote unavailable: show Gwei and explain that the USD quote is unavailable.
- Insufficient baseline: show "Analisando condições" rather than a low-quality
  recommendation.
- History range failure: preserve no data from another selected range; show a
  scoped retry action.
- Catalog next-page failure: keep the current page visible, leave its page
  number unchanged, and allow retry.
- Empty catalog: explain that analyzed blocks will appear after monitoring
  begins.
- Block detail failure: keep the catalog rows usable and scope the error to the
  detail region.

## Accessibility and Responsive Behavior

- USD and Gwei labels are text, not color-only distinctions.
- Network-moment labels combine color, wording, and an icon or marker.
- Range and pagination controls have visible focus, correct disabled states,
  and accessible names.
- The selected block uses `aria-pressed` or an equivalent current-item state.
- The decorative Solar icon is hidden from assistive technology when adjacent
  text already identifies the block.
- Chart tooltips are supplemented by textual maximum, average, and current
  values.
- At phone widths, cards become a single column, block details stop using
  sticky positioning, catalog rows collapse to essential fields, and secondary
  fields remain available in the selected detail view.
- Reduced-motion preferences disable nonessential transitions.

## Testing Strategy

Implementation follows test-driven development with focused tests and a
maximum of two test workers on this machine.

### Contracts and API

- history query defaults, bounds, cursor validation, and response refinement;
- repository ordering, canonical filtering, anchor stability, `limit + 1`, and
  no duplicates across pages;
- invalid or mismatched cursors return the expected safe error;
- `/blocks/recent` remains backward compatible.

### Frontend logic

- five range values produce exact time windows;
- priced history uses each snapshot's stored USD value;
- unavailable prices produce gaps rather than zeroes;
- percentile boundaries and insufficient-baseline behavior;
- dashboard renders exactly ten of twenty live blocks;
- cursor stack maintains page number and item positions;
- failed next-page requests do not discard the current page;
- refresh starts a new page-one catalog session.

### Components and integration

- USD hero priority and Gwei fallback;
- removal of confidence/source tags from the investor dashboard;
- network-moment copy for every state;
- Iconify Solar icon in normal and selected block states;
- independently sized block details;
- keyboard operation for range, search, selection, and pagination controls;
- real Express integration for block history and existing dashboard endpoints;
- desktop, tablet, and phone visual checks.

## Migration and Compatibility

The new block-history endpoint is additive. Existing block documents and
`BlockSummaryDto` remain valid, and `/blocks/recent`, point lookup, and SSE
contracts are unchanged. No database migration is required.

The fee snapshot already persists the USD quote and native-transfer estimate,
so the USD chart requires only a frontend view-model change. Existing
snapshots with unavailable prices remain valid and render as gaps.

## Completion Criteria

The redesign is complete when:

- the dashboard's primary metric is the real native ETH transfer cost in USD;
- Gwei remains available without dominating the hierarchy;
- operational confidence/source tags are absent from the investor view;
- network moment is driven by the documented 24-hour percentile rule;
- all five history ranges work with real API data;
- the dashboard never renders more than ten block buttons;
- block details do not stretch with the list;
- `/blocos` paginates stable MongoDB records with page and item-position
  indicators;
- the official Solar duotone icon replaces every block photograph;
- all required tests, lint, typecheck, build, and responsive visual checks pass.
