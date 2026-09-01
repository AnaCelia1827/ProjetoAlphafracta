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
