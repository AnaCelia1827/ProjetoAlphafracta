# Dynamic USD Chart Scale and Data-Age Placement Design

**Date:** 2026-09-01  
**Status:** Approved in conversation

## Context

The investor dashboard currently forces the USD chart to a minimum ceiling of approximately `US$ 1.10`. This can flatten meaningful movement when every observed transfer cost is below that threshold. The dashboard also presents the age of the current fee snapshot inside the secondary technical metrics, even though it describes the freshness of the primary USD value.

## Goal

Make the chart scale reflect the selected time window without exaggerating the lower bound, and place data freshness next to the value it qualifies.

## Chart Domain

- The vertical domain always starts at `US$ 0`.
- The upper bound is exactly 110% of the greatest priced `maxCostUsd` value in the currently selected window.
- Snapshots without `maxCostUsd` remain explicit gaps and do not participate in the upper-bound calculation.
- The y-axis renders three labels: the calculated ceiling, half of that ceiling, and `US$ 0`.
- There is no fixed minimum ceiling. For example, if the highest observed value is `US$ 2.00`, the chart ceiling is `US$ 2.20`; if it is `US$ 0.20`, the ceiling is `US$ 0.22`.
- When the window has no priced points, the existing unavailable-history state remains unchanged and no domain is calculated.
- When all priced values are zero, the chart uses a nonzero internal SVG denominator only to avoid division by zero while continuing to label the visible monetary ceiling as `US$ 0`. This defensive case must not fabricate a positive observed cost.

The x-axis, gap segmentation, selected ranges (`5m`, `15m`, `1h`, `6h`, `24h`), tooltip behavior, and current/variation semantics remain unchanged.

## Data-Age Placement

- The current snapshot age moves directly below the primary USD transfer-cost value inside `FeeCard`.
- It uses subdued small text and the existing live age value, for example `Atualizado há 8s`.
- The age is removed from the secondary metric grid to avoid duplication.
- The quote status remains in the secondary grid because it communicates price availability rather than freshness.
- When the primary USD value is unavailable, the age remains visible below the unavailable-state copy whenever a snapshot timestamp exists.

## Accessibility and Visual Identity

- Axis labels continue using the existing Brazilian Portuguese USD formatter.
- The freshness line uses existing semantic color and typography tokens only.
- The change must preserve keyboard chart interaction, tooltip announcements, mobile overflow behavior, focus visibility, and reduced-motion rules.

## Testing

Automated coverage must prove:

1. A window whose maximum is `US$ 2.00` renders a `US$ 2.20` ceiling, `US$ 1.10` midpoint, and `US$ 0.00` floor.
2. A sub-dollar maximum does not inherit the old fixed minimum ceiling.
3. Unpriced snapshots do not affect the ceiling and continue splitting SVG segments.
4. The data-age copy renders immediately below the primary USD value and no longer appears in the secondary grid.
5. Existing range, gap, current-cost, variation, accessibility, lint, typecheck, and build gates remain green.

## Scope

This adjustment is limited to the chart-domain calculation, its tests, the `FeeCard` data-age placement, and related styling/rendering tests. It does not change backend contracts, persisted values, the block catalog, fee calculations, or the five approved time ranges.
