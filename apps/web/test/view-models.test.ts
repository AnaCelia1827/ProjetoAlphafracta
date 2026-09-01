import { describe, expect, it } from 'vitest';
import { toBlockViewModel, toFeeViewModel, toHistoryPoint } from '@/lib/api/view-models';
import { blockFixture, feeSnapshotFixture } from './fixtures';

describe('API view models', () => {
  it('derives transfer cost and confidence from the shared fee DTO', () => {
    const view = toFeeViewModel(feeSnapshotFixture);

    expect(view.maxCostUsd).toBe(2.31);
    expect(view.confidence).toEqual({
      level: 'high',
      reasons: ['fresh-data'],
    });
  });

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

  it('preserves decimal block identity and canonical actions', () => {
    const view = toBlockViewModel(blockFixture);

    expect(view.number).toBe('23548192');
    expect(view.priorityFeeGwei).toBe(1.8);
    expect(view.etherscanUrl).toBe('https://etherscan.io/block/23548192');
  });
});
