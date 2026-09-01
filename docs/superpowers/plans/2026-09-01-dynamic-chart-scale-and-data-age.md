# Dynamic USD Chart Scale and Data-Age Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scale the USD chart from zero to 110% of the selected window's observed maximum and place snapshot freshness directly below the dashboard's primary USD value.

**Architecture:** A small pure domain helper owns the USD axis calculation so zero, sub-dollar, and missing-price cases can be tested without SVG coupling. `FeeHistoryChart` consumes that domain for labels and coordinates, while `FeeCard` keeps freshness presentation beside the hero value and removes its duplicated secondary metric.

**Tech Stack:** React 19, Next.js 16 App Router, TypeScript 5, CSS Modules, Vitest 3, Testing Library.

## Global Constraints

- The y-axis monetary floor is always `US$ 0`.
- The y-axis ceiling is exactly 110% of the greatest priced `maxCostUsd` value in the selected window.
- Snapshots without `maxCostUsd` do not affect the domain and remain visible gaps.
- The axis labels are the calculated ceiling, half of that ceiling, and `US$ 0`.
- No fixed minimum ceiling may remain.
- A zero-only priced window labels a zero ceiling but uses a nonzero internal denominator to avoid invalid SVG coordinates.
- The current snapshot age renders immediately after the primary USD value as `Atualizado há Ns` and is removed from the secondary metric grid.
- The existing five ranges, gap segmentation, tooltips, current-cost semantics, backend contracts, and block catalog remain unchanged.
- New styling uses only existing semantic `var(--color-*)` tokens.
- Follow `apps/web/AGENTS.md`: Next.js 16 App Router conventions and focused Client Components.
- Cap every Vitest command at two forks: `--pool=forks --poolOptions.forks.maxForks=2`.
- Do not touch `.env`, `apps/web/.env.local`, or the 29 inherited files currently outside this plan's formatting scope.

---

## File Structure

- Create `apps/web/src/lib/fees/usd-chart-domain.ts`: pure priced-domain calculation and zero-denominator defense.
- Create `apps/web/test/usd-chart-domain.test.ts`: unit coverage for ordinary, sub-dollar, missing-price, empty, and zero-only windows.
- Modify `apps/web/src/components/fee-history-chart.tsx`: consume the pure domain for y coordinates and labels.
- Modify `apps/web/test/fee-history-chart.test.tsx`: prove the rendered sub-dollar ceiling and plotted headroom.
- Modify `apps/web/src/components/fee-card.tsx`: format freshness and place it directly below the USD hero.
- Modify `apps/web/test/dashboard-rendering.test.tsx`: lock the freshness location and removal of the secondary metric.
- Modify `apps/web/src/app/page.module.css`: style the freshness line with existing semantic tokens.

---

### Task 1: Calculate and render the dynamic USD ceiling

**Files:**

- Create: `apps/web/src/lib/fees/usd-chart-domain.ts`
- Create: `apps/web/test/usd-chart-domain.test.ts`
- Modify: `apps/web/src/components/fee-history-chart.tsx`
- Modify: `apps/web/test/fee-history-chart.test.tsx`

**Interfaces:**

- Consumes: `readonly { maxCostUsd?: number }[]` from the selected fee-history window.
- Produces: `calculateUsdChartDomain(history): UsdChartDomain | null`, where `UsdChartDomain` contains `ceiling`, `midpoint`, and `scaleDenominator`.

- [ ] **Step 1: Write the failing pure-domain and rendered-axis tests**

Create `apps/web/test/usd-chart-domain.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { calculateUsdChartDomain } from '@/lib/fees/usd-chart-domain';

describe('calculateUsdChartDomain', () => {
  it('uses ten percent headroom above the observed maximum', () => {
    const domain = calculateUsdChartDomain([
      { maxCostUsd: 1.2 },
      { maxCostUsd: 2 },
    ]);

    expect(domain?.ceiling).toBeCloseTo(2.2);
    expect(domain?.midpoint).toBeCloseTo(1.1);
    expect(domain?.scaleDenominator).toBeCloseTo(2.2);
  });

  it('keeps sub-dollar windows proportional and ignores unpriced snapshots', () => {
    const domain = calculateUsdChartDomain([
      { maxCostUsd: 0.1 },
      {},
      { maxCostUsd: 0.2 },
    ]);

    expect(domain?.ceiling).toBeCloseTo(0.22);
    expect(domain?.midpoint).toBeCloseTo(0.11);
  });

  it('returns no domain without priced points and safely handles zero-only prices', () => {
    expect(calculateUsdChartDomain([{}, {}])).toBeNull();
    expect(calculateUsdChartDomain([{ maxCostUsd: 0 }])).toEqual({
      ceiling: 0,
      midpoint: 0,
      scaleDenominator: 1,
    });
  });
});
```

Append this case to `apps/web/test/fee-history-chart.test.tsx`:

```tsx
it('renders a proportional sub-dollar y-axis without the old fixed ceiling', () => {
  const { container } = render(
    <FeeHistoryChart
      {...baseProps}
      history={[
        {
          timestamp: '2026-09-01T03:00:00.000Z',
          recommendedMaxFeeGwei: 4,
          recommendedPriorityFeeGwei: 1,
          maxCostUsd: 0.1,
        },
        {
          timestamp: '2026-09-01T03:01:00.000Z',
          recommendedMaxFeeGwei: 8,
          recommendedPriorityFeeGwei: 1.2,
        },
        {
          timestamp: '2026-09-01T03:02:00.000Z',
          recommendedMaxFeeGwei: 7,
          recommendedPriorityFeeGwei: 1.1,
          maxCostUsd: 0.2,
        },
      ]}
    />,
  );

  expect(screen.getByText(/US\$\s*0,22/)).toBeVisible();
  expect(screen.getByText(/US\$\s*0,11/)).toBeVisible();
  expect(screen.getByText(/US\$\s*0,00/)).toBeVisible();
  expect(screen.queryByText(/US\$\s*1,10/)).not.toBeInTheDocument();

  const pricedCircles = container.querySelectorAll('svg circle');
  expect(Number(pricedCircles[1]?.getAttribute('cy'))).toBeCloseTo(260 / 11);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
rtk npm test --workspace web -- --pool=forks --poolOptions.forks.maxForks=2 test/usd-chart-domain.test.ts test/fee-history-chart.test.tsx
```

Expected: FAIL because `@/lib/fees/usd-chart-domain` does not exist and the current rendered axis retains the fixed `US$ 1.10` ceiling for sub-dollar data.

- [ ] **Step 3: Implement the pure domain helper**

Create `apps/web/src/lib/fees/usd-chart-domain.ts`:

```ts
export type UsdChartDomain = {
  ceiling: number;
  midpoint: number;
  scaleDenominator: number;
};

export function calculateUsdChartDomain(
  history: readonly { maxCostUsd?: number }[],
): UsdChartDomain | null {
  const pricedValues = history
    .map((point) => point.maxCostUsd)
    .filter((value): value is number => value !== undefined);

  if (pricedValues.length === 0) return null;

  const observedMaximum = Math.max(...pricedValues);
  const ceiling = observedMaximum * 1.1;

  return {
    ceiling,
    midpoint: ceiling / 2,
    scaleDenominator: ceiling === 0 ? 1 : ceiling,
  };
}
```

- [ ] **Step 4: Wire the chart coordinates and labels to the helper**

Import the helper in `apps/web/src/components/fee-history-chart.tsx`:

```ts
import { calculateUsdChartDomain } from '@/lib/fees/usd-chart-domain';
```

Replace the fixed-domain calculation:

```ts
const chartDomain = calculateUsdChartDomain(history);
const scaleDenominator = chartDomain?.scaleDenominator ?? 1;
```

Use the new denominator in each priced point:

```ts
y: height - (item.maxCostUsd / scaleDenominator) * height,
```

Replace the three y-axis labels with:

```tsx
<div className={styles.yAxis}>
  <span>{formatUsd(chartDomain?.ceiling ?? 0)}</span>
  <span>{formatUsd(chartDomain?.midpoint ?? 0)}</span>
  <span>{formatUsd(0)}</span>
</div>
```

Do not alter x coordinates, gap segmentation, current values, variations, tooltips, or the empty state.

- [ ] **Step 5: Run RED-to-GREEN verification**

```bash
rtk npm test --workspace web -- --pool=forks --poolOptions.forks.maxForks=2 test/usd-chart-domain.test.ts test/fee-history-chart.test.tsx
rtk npm run lint --workspace web -- src/lib/fees/usd-chart-domain.ts src/components/fee-history-chart.tsx test/usd-chart-domain.test.ts test/fee-history-chart.test.tsx
rtk npm run typecheck --workspace web
```

Expected: all domain and chart tests PASS; lint and typecheck exit 0.

- [ ] **Step 6: Commit the dynamic domain**

```bash
rtk git add apps/web/src/lib/fees/usd-chart-domain.ts apps/web/test/usd-chart-domain.test.ts apps/web/src/components/fee-history-chart.tsx apps/web/test/fee-history-chart.test.tsx
rtk git commit -m "fix(web): scale USD chart to observed values"
```

---

### Task 2: Move snapshot freshness beneath the USD hero

**Files:**

- Modify: `apps/web/src/components/fee-card.tsx`
- Modify: `apps/web/test/dashboard-rendering.test.tsx`
- Modify: `apps/web/src/app/page.module.css`

**Interfaces:**

- Consumes: the existing `ageMs: number | null` prop from `useDataAge`.
- Produces: the visible copy `Atualizado há Ns` immediately after the primary USD value, with no secondary `Idade do dado` metric.

- [ ] **Step 1: Write the failing freshness-placement tests**

Update the first `FeeCard` case in `apps/web/test/dashboard-rendering.test.tsx`:

```tsx
it('places snapshot freshness directly below the primary USD value', () => {
  render(<FeeCard snapshot={feeViewFixture} ageMs={4200} />);

  const heroLabel = screen.getByText('Custo estimado para transferir ETH');
  const hero = heroLabel.parentElement!;
  const usdValue = within(hero).getByText(/US\$\s*2,31/);
  const freshness = within(hero).getByText('Atualizado há 4s');

  expect(freshness.previousElementSibling).toBe(usdValue);
  expect(screen.queryByText('Idade do dado')).not.toBeInTheDocument();
  expect(screen.getByText(/50.*Gwei/i)).toBeVisible();
});
```

Add `within` to the Testing Library import:

```ts
import { render, screen, within } from '@testing-library/react';
```

Extend the unavailable-quote case:

```tsx
const hero = screen.getByText('Custo estimado para transferir ETH').parentElement!;
expect(within(hero).getByText('Atualizado há 20s')).toBeVisible();
```

- [ ] **Step 2: Run the dashboard test and verify RED**

```bash
rtk npm test --workspace web -- --pool=forks --poolOptions.forks.maxForks=2 test/dashboard-rendering.test.tsx
```

Expected: FAIL because `Atualizado há 4s` is absent and `Idade do dado` still renders in the secondary grid.

- [ ] **Step 3: Format the freshness copy and move it into the hero**

Add this helper in `apps/web/src/components/fee-card.tsx`:

```ts
function formatDataAge(ageMs: number | null) {
  if (ageMs === null) return 'Aguardando atualização';
  return `Atualizado há ${Math.max(0, Math.round(ageMs / 1000))}s`;
}
```

Render the freshness immediately after the primary `<strong>` and before the transfer-estimate note:

```tsx
<strong>
  {snapshot?.maxCostUsd === undefined
    ? 'Cotação indisponível'
    : formatUsd(snapshot.maxCostUsd)}
</strong>
<small className={styles.transferFreshness}>{formatDataAge(ageMs)}</small>
<small>Estimativa para uma transferência simples de 21.000 gas</small>
```

Delete this entire secondary metric:

```tsx
<p>
  <span>Idade do dado</span>
  <strong>{ageMs === null ? '—' : `${Math.round(ageMs / 1000)} segundos`}</strong>
</p>
```

- [ ] **Step 4: Add the semantic-token freshness style**

Add beside `.transferHero small` in `apps/web/src/app/page.module.css`:

```css
.transferHero .transferFreshness {
  color: var(--color-primary-text);
  font-weight: 650;
  letter-spacing: 0.01em;
}
```

- [ ] **Step 5: Run dashboard and full web verification**

```bash
rtk npm test --workspace web -- --pool=forks --poolOptions.forks.maxForks=2 test/dashboard-rendering.test.tsx test/fee-history-chart.test.tsx test/usd-chart-domain.test.ts
rtk npm test --workspace web -- --pool=forks --poolOptions.forks.maxForks=2
rtk npm run lint --workspace web
rtk npm run typecheck --workspace web
```

Expected: focused and full web suites PASS; lint and typecheck exit 0.

- [ ] **Step 6: Format only this incremental change and verify production build**

```bash
rtk npx prettier --write apps/web/src/lib/fees/usd-chart-domain.ts apps/web/src/components/fee-history-chart.tsx apps/web/src/components/fee-card.tsx apps/web/src/app/page.module.css apps/web/test/usd-chart-domain.test.ts apps/web/test/fee-history-chart.test.tsx apps/web/test/dashboard-rendering.test.tsx
rtk npx prettier --check apps/web/src/lib/fees/usd-chart-domain.ts apps/web/src/components/fee-history-chart.tsx apps/web/src/components/fee-card.tsx apps/web/src/app/page.module.css apps/web/test/usd-chart-domain.test.ts apps/web/test/fee-history-chart.test.tsx apps/web/test/dashboard-rendering.test.tsx
rtk npm run build --workspace web
rtk git diff --check
```

Expected: changed-file Prettier check, web build, and diff check exit 0. The separate inherited 29-file global formatting decision remains unchanged.

- [ ] **Step 7: Commit the freshness placement**

```bash
rtk git add apps/web/src/components/fee-card.tsx apps/web/test/dashboard-rendering.test.tsx apps/web/src/app/page.module.css
rtk git commit -m "fix(web): place fee freshness below USD value"
```

---

### Task 3: Verify the incremental behavior with real data

**Files:**

- Modify only if a failing gate reveals an in-scope defect.
- Verify the existing ignored `.env` files remain untouched.

**Interfaces:**

- Consumes: Task 1's dynamic domain and Task 2's hero freshness placement.
- Produces: browser and command evidence that the approved behavior works with real selected ranges.

- [ ] **Step 1: Run all affected quality gates sequentially**

```bash
rtk npm test --workspace web -- --pool=forks --poolOptions.forks.maxForks=2
rtk npm run lint --workspace web
rtk npm run typecheck --workspace web
rtk npm run build --workspace web
```

Expected: all web tests, lint, typecheck, and production build PASS.

- [ ] **Step 2: Verify real chart behavior in the local browser**

At `http://localhost:3000`, verify at desktop and phone widths:

- the top y-axis label equals 110% of the largest priced point in the currently selected range;
- switching among `5m`, `15m`, `1h`, `6h`, and `24h` recalculates the ceiling;
- the bottom label remains `US$ 0,00`;
- a sub-dollar window is not forced to `US$ 1,10`;
- `Atualizado há Ns` appears immediately below the primary USD value and updates without duplicating `Idade do dado` in the metric grid;
- gaps, tooltip navigation, focus, mobile layout, and reduced-motion CSS remain intact.

- [ ] **Step 3: Confirm environment and Git hygiene**

```bash
rtk git check-ignore -v .env apps/web/.env.local
rtk git ls-files --stage -- .env apps/web/.env.local
rtk git status --short
rtk git diff --check
```

Expected: both environment files are ignored and absent from the index; no secret file or unintended change is staged.

- [ ] **Step 4: Commit only if verification required an in-scope fix**

If Steps 1–3 required a code correction, write a failing regression test first, implement the minimum fix, rerun the covering test and affected gates, then commit only those explicit files:

```bash
rtk git commit -m "fix(web): complete dynamic chart verification"
```

If no fix was required, do not create an empty commit.
