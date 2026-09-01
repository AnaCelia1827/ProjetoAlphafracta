import { describe, expect, it } from 'vitest';
import { classifyNetworkMoment } from '@/lib/fees/network-moment';

const baseline = Array.from({ length: 12 }, (_, index) => ({
  timestamp: new Date(Date.UTC(2026, 7, 31, 0, index)).toISOString(),
  recommendedMaxFeeGwei: 10 + index,
  recommendedPriorityFeeGwei: 1,
  maxCostUsd: index + 1,
}));

describe('classifyNetworkMoment', () => {
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
});
