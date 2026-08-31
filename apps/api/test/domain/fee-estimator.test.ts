/**
 * Testes do estimador de taxas: fixam P60, mediana, margem EIP-1559 e descarte
 * de lances inválidos para que alterações futuras não mudem a política implícita.
 */
import { describe, expect, it } from 'vitest';

import * as estimator from '../../src/domain/fees/fee-estimator.js';

const now = new Date('2026-08-30T18:42:15.000Z');
const hash = '0x7d9452dca37be2e88b85f074f8142ab746d9f58b90d63d1d7ba2ea5ecbf10a4e';

type Callable = (...arguments_: unknown[]) => unknown;

interface Estimate {
  recommendedPriorityFeeWei: bigint;
  recommendedMaxFeeWei: bigint;
  effectiveGasPriceWei: bigint;
  pendingEffectiveTipsWei: bigint[];
}

/** Invoca o estimador exportado mantendo o fixture independente da assinatura interna. */
function estimate(input: object): Estimate | null {
  expect(estimator).toHaveProperty('estimateFees');
  const callable = (estimator as Record<string, Callable>).estimateFees!;
  return callable(input) as Estimate | null;
}

/** Cria um lance pendente EIP-1559 ou legacy com hash determinístico por cenário. */
function bid(
  suffix: number,
  values: {
    maxFeePerGasWei?: bigint;
    maxPriorityFeePerGasWei?: bigint;
    gasPriceWei?: bigint;
    kind?: 'eip1559' | 'legacy';
    observedAt?: Date;
  },
) {
  return {
    hash: `${hash.slice(0, -2)}${suffix.toString(16).padStart(2, '0')}`,
    observedAt: values.observedAt ?? now,
    kind: values.kind ?? 'eip1559',
    maxFeePerGasWei: values.maxFeePerGasWei,
    maxPriorityFeePerGasWei: values.maxPriorityFeePerGasWei,
    gasPriceWei: values.gasPriceWei,
  };
}

describe('estimateFees', () => {
  it('combines pending P60, historical median and projected base fee', () => {
    const result = estimate({
      evidence: {
        latestBaseFeeWei: 100n,
        projectedNextBaseFeeWei: 120n,
        historicalRewardP60Wei: [5n, 7n, 9n],
        ethereumUpdatedAt: now,
      },
      pendingBids: [2n, 10n, 20n, 30n, 40n].map((tip, index) =>
        bid(index, { maxFeePerGasWei: 200n, maxPriorityFeePerGasWei: tip }),
      ),
      now,
    });

    expect(result).toMatchObject({
      recommendedPriorityFeeWei: 20n,
      recommendedMaxFeeWei: 155n,
      effectiveGasPriceWei: 120n,
      pendingEffectiveTipsWei: [2n, 10n, 20n, 30n, 40n],
    });
  });

  it('caps EIP-1559 priority capacity at max fee minus base fee', () => {
    const result = estimate({
      evidence: {
        latestBaseFeeWei: 100n,
        projectedNextBaseFeeWei: 100n,
        historicalRewardP60Wei: [],
        ethereumUpdatedAt: now,
      },
      pendingBids: [bid(1, { maxFeePerGasWei: 103n, maxPriorityFeePerGasWei: 20n })],
      now,
    });

    expect(result?.recommendedPriorityFeeWei).toBe(3n);
  });

  it('normalizes a legacy gas price into priority capacity', () => {
    const result = estimate({
      evidence: {
        latestBaseFeeWei: 100n,
        projectedNextBaseFeeWei: 90n,
        historicalRewardP60Wei: [],
        ethereumUpdatedAt: now,
      },
      pendingBids: [bid(1, { kind: 'legacy', gasPriceWei: 112n })],
      now,
    });

    expect(result).toMatchObject({
      recommendedPriorityFeeWei: 12n,
      recommendedMaxFeeWei: 125n,
      effectiveGasPriceWei: 112n,
    });
  });

  it('rounds an exact historical half-wei median upward', () => {
    const result = estimate({
      evidence: {
        latestBaseFeeWei: 8n,
        projectedNextBaseFeeWei: 8n,
        historicalRewardP60Wei: [1n, 2n],
        ethereumUpdatedAt: now,
      },
      pendingBids: [bid(1, { maxFeePerGasWei: 20n, maxPriorityFeePerGasWei: 1n })],
      now,
    });

    expect(result?.recommendedPriorityFeeWei).toBe(2n);
    expect(result?.recommendedMaxFeeWei).toBe(11n);
  });

  it('discards stale, future, negative, incomplete and infeasible samples', () => {
    const result = estimate({
      evidence: {
        latestBaseFeeWei: 100n,
        projectedNextBaseFeeWei: 100n,
        historicalRewardP60Wei: [-1n, 4n],
        ethereumUpdatedAt: now,
      },
      pendingBids: [
        bid(1, { maxFeePerGasWei: 120n, maxPriorityFeePerGasWei: 5n }),
        bid(2, {
          maxFeePerGasWei: 120n,
          maxPriorityFeePerGasWei: 99n,
          observedAt: new Date(now.getTime() - 30_001),
        }),
        bid(3, {
          maxFeePerGasWei: 120n,
          maxPriorityFeePerGasWei: 99n,
          observedAt: new Date(now.getTime() + 1),
        }),
        bid(4, { maxFeePerGasWei: 90n, maxPriorityFeePerGasWei: 5n }),
        bid(5, { maxFeePerGasWei: 120n, maxPriorityFeePerGasWei: -1n }),
        bid(6, { maxFeePerGasWei: 120n }),
        bid(7, { kind: 'legacy', gasPriceWei: 99n }),
      ],
      now,
    });

    expect(result?.pendingEffectiveTipsWei).toEqual([5n]);
    expect(result?.recommendedPriorityFeeWei).toBe(5n);
  });

  it('requires a valid current base fee and at least one pending sample', () => {
    const evidence = {
      latestBaseFeeWei: 100n,
      projectedNextBaseFeeWei: 100n,
      historicalRewardP60Wei: [10n],
      ethereumUpdatedAt: now,
    };

    expect(estimate({ evidence, pendingBids: [], now })).toBeNull();
    expect(
      estimate({
        evidence: { ...evidence, latestBaseFeeWei: -1n },
        pendingBids: [bid(1, { maxFeePerGasWei: 120n, maxPriorityFeePerGasWei: 5n })],
        now,
      }),
    ).toBeNull();
  });
});
