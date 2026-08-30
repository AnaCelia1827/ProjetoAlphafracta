import { describe, expect, it, vi } from 'vitest';

import * as confidence from '../../src/domain/fees/fee-confidence.js';
import * as transferCost from '../../src/domain/fees/transfer-cost.js';
import * as trend from '../../src/domain/fees/fee-trend.js';

const now = new Date('2026-08-30T18:42:15.000Z');

type Callable = (...arguments_: unknown[]) => unknown;

function callable(module: object, name: string): Callable {
  expect(module).toHaveProperty(name);
  return (module as Record<string, Callable>)[name]!;
}

function rational(numerator: bigint, denominator = 1n) {
  return { numerator, denominator };
}

function snapshot(recommendedMaxFeeWei: bigint, timestamp = now) {
  return { recommendedMaxFeeWei, timestamp };
}

describe('calculateTransferCost', () => {
  it('calculates the exact ETH maximum for a 21,000-gas native transfer', () => {
    const result = callable(
      transferCost,
      'calculateTransferCost',
    )({
      recommendedMaxFeeWei: 1_000_000_000n,
      quote: null,
      now,
    });

    expect(result).toEqual({
      status: 'unavailable',
      transactionType: 'native-eth-transfer',
      gasUnits: 21_000n,
      maxCostEth: rational(21n, 1_000_000n),
    });
  });

  it('uses a fresh ETH/USD quote without losing decimal precision', () => {
    const result = callable(
      transferCost,
      'calculateTransferCost',
    )({
      recommendedMaxFeeWei: 1_000_000_000n,
      quote: { ethUsd: rational(2_000n), updatedAt: now },
      now,
    });

    expect(result).toEqual({
      status: 'fresh',
      transactionType: 'native-eth-transfer',
      gasUnits: 21_000n,
      maxCostEth: rational(21n, 1_000_000n),
      ethUsd: rational(2_000n),
      maxCostUsd: rational(21n, 500n),
      priceUpdatedAt: now,
    });
  });

  it('marks a retained quote stale only after 30 seconds', () => {
    const calculate = callable(transferCost, 'calculateTransferCost');

    expect(
      calculate({
        recommendedMaxFeeWei: 1_000_000_000n,
        quote: { ethUsd: rational(2_000n), updatedAt: new Date(now.getTime() - 30_000) },
        now,
      }),
    ).toMatchObject({ status: 'fresh' });
    expect(
      calculate({
        recommendedMaxFeeWei: 1_000_000_000n,
        quote: { ethUsd: rational(2_000n), updatedAt: new Date(now.getTime() - 30_001) },
        now,
      }),
    ).toMatchObject({ status: 'stale' });
  });
});

describe('calculateTrend24h', () => {
  it('compares medians of the exact five-minute windows', async () => {
    const findWindow = vi
      .fn()
      .mockResolvedValueOnce([snapshot(30n), snapshot(10n), snapshot(20n)])
      .mockResolvedValueOnce([snapshot(10n), snapshot(10n), snapshot(10n)]);

    const result = await callable(
      trend,
      'calculateTrend24h',
    )({
      now,
      repository: { findWindow },
    });

    expect(findWindow).toHaveBeenNthCalledWith(1, new Date('2026-08-30T18:37:15.000Z'), now);
    expect(findWindow).toHaveBeenNthCalledWith(
      2,
      new Date('2026-08-29T18:37:15.000Z'),
      new Date('2026-08-29T18:42:15.000Z'),
    );
    expect(result).toEqual({
      status: 'available',
      windowMinutes: 5,
      percentChange: rational(100n),
      currentMedianMaxFeeWei: rational(20n),
      previousMedianMaxFeeWei: rational(10n),
    });
  });

  it('supports a negative percentage', async () => {
    const result = await callable(
      trend,
      'calculateTrend24h',
    )({
      now,
      repository: {
        findWindow: vi
          .fn()
          .mockResolvedValueOnce([snapshot(5n)])
          .mockResolvedValueOnce([snapshot(10n)]),
      },
    });

    expect(result).toMatchObject({ status: 'available', percentChange: rational(-50n) });
  });

  it('returns insufficient history for an empty window or zero previous median', async () => {
    const calculate = callable(trend, 'calculateTrend24h');
    const empty = await calculate({
      now,
      repository: {
        findWindow: vi
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([snapshot(10n)]),
      },
    });
    const zero = await calculate({
      now,
      repository: {
        findWindow: vi
          .fn()
          .mockResolvedValueOnce([snapshot(10n)])
          .mockResolvedValueOnce([snapshot(0n)]),
      },
    });

    expect(empty).toEqual({ status: 'insufficient-history', windowMinutes: 5 });
    expect(zero).toEqual({ status: 'insufficient-history', windowMinutes: 5 });
  });

  it('maps only the typed repository outage to unavailable', async () => {
    expect(trend).toHaveProperty('FeeHistoryUnavailableError');
    const Outage = trend.FeeHistoryUnavailableError;
    const calculate = callable(trend, 'calculateTrend24h');
    const unavailable = await calculate({
      now,
      repository: { findWindow: vi.fn().mockRejectedValue(new Outage()) },
    });

    expect(unavailable).toEqual({
      status: 'unavailable',
      windowMinutes: 5,
      reason: 'history-unavailable',
    });
    await expect(
      calculate({
        now,
        repository: { findWindow: vi.fn().mockRejectedValue(new TypeError('programming defect')) },
      }),
    ).rejects.toThrow(TypeError);
  });
});

describe('evaluateFeeConfidence', () => {
  function evaluate(input: {
    mempoolAgeMs: number | null;
    ethereumAgeMs: number | null;
    tips: bigint[];
    priceAvailable?: boolean;
    persistenceAvailable?: boolean;
  }) {
    return callable(
      confidence,
      'evaluateFeeConfidence',
    )({
      now,
      mempoolUpdatedAt:
        input.mempoolAgeMs === null ? null : new Date(now.getTime() - input.mempoolAgeMs),
      ethereumUpdatedAt:
        input.ethereumAgeMs === null ? null : new Date(now.getTime() - input.ethereumAgeMs),
      effectiveTipsWei: input.tips,
      priceAvailable: input.priceAvailable,
      persistenceAvailable: input.persistenceAvailable,
    });
  }

  it('returns high at the inclusive fresh, sample and IQR boundaries', () => {
    const tips = Array.from({ length: 500 }, (_, index) => BigInt(100 + (index % 51)));

    expect(evaluate({ mempoolAgeMs: 10_000, ethereumAgeMs: 10_000, tips })).toEqual({
      level: 'high',
      reasons: ['fresh-data', 'stable-fees', 'strong-sample'],
    });
  });

  it('returns medium at its inclusive boundaries', () => {
    const tips = Array.from({ length: 100 }, (_, index) => BigInt(index + 1));

    expect(evaluate({ mempoolAgeMs: 20_000, ethereumAgeMs: 20_000, tips })).toEqual({
      level: 'medium',
      reasons: ['aging-data', 'stable-fees', 'strong-sample'],
    });
  });

  it('returns low when usable evidence misses a medium threshold', () => {
    expect(
      evaluate({
        mempoolAgeMs: 20_001,
        ethereumAgeMs: 20_001,
        tips: [1n, 100n, 200n],
      }),
    ).toEqual({
      level: 'low',
      reasons: ['aging-data', 'volatile-fees', 'weak-sample'],
    });
  });

  it.each([
    { mempoolAgeMs: null, ethereumAgeMs: 0, tips: [1n] },
    { mempoolAgeMs: 30_001, ethereumAgeMs: 0, tips: [1n] },
    { mempoolAgeMs: 0, ethereumAgeMs: 0, tips: [] },
  ])('returns unavailable for missing, expired or empty evidence %#', (input) => {
    expect(evaluate(input)).toMatchObject({ level: 'unavailable' });
  });

  it('does not let a zero median qualify as high or medium', () => {
    expect(
      evaluate({
        mempoolAgeMs: 0,
        ethereumAgeMs: 0,
        tips: Array.from({ length: 500 }, () => 0n),
      }),
    ).toEqual({
      level: 'low',
      reasons: ['fresh-data', 'volatile-fees', 'strong-sample'],
    });
  });

  it('ignores Coinbase and persistence when evaluating fee confidence', () => {
    const tips = Array.from({ length: 500 }, () => 100n);
    const healthy = evaluate({
      mempoolAgeMs: 0,
      ethereumAgeMs: 0,
      tips,
      priceAvailable: true,
      persistenceAvailable: true,
    });
    const degraded = evaluate({
      mempoolAgeMs: 0,
      ethereumAgeMs: 0,
      tips,
      priceAvailable: false,
      persistenceAvailable: false,
    });

    expect(degraded).toEqual(healthy);
  });
});
