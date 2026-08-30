import { describe, expect, it, vi } from 'vitest';

import {
  EthereumProviderUnavailableError,
  HistoryUnavailableError,
  PersistenceUnavailableError,
  SnapshotUnavailableError,
} from '../../src/application/common/errors.js';
import type { LiveEvent } from '../../src/application/common/live-event-publisher.js';
import {
  CalculateFeeSnapshot,
  FeeSnapshotCache,
} from '../../src/application/fees/calculate-fee-snapshot.js';
import { FeeMonitor } from '../../src/application/fees/fee-monitor.js';
import { GetCurrentFeeSnapshot } from '../../src/application/fees/get-current-fee-snapshot.js';
import { GetFeeHistory } from '../../src/application/fees/get-fee-history.js';
import { FeeHistoryUnavailableError } from '../../src/domain/fees/fee-trend.js';
import { rational } from '../../src/domain/shared/units.js';
import { FakeFeeSnapshotRepository } from '../helpers/fakes.js';
import { feeSnapshot, FIXED_NOW, pendingBid } from '../helpers/fixtures.js';

function setup() {
  const repository = new FakeFeeSnapshotRepository();
  const cache = new FeeSnapshotCache();
  const events: LiveEvent[] = [];
  const bids = [pendingBid(1)];
  const ethereumFeeSource = {
    getFeeEvidence: vi.fn().mockResolvedValue({
      latestBaseFeeWei: 30_000_000_000n,
      projectedNextBaseFeeWei: 30_000_000_000n,
      historicalRewardP60Wei: [1_000_000_000n],
      ethereumUpdatedAt: FIXED_NOW,
    }),
  };
  const mempoolSource = {
    getPendingBids: vi.fn(() => bids),
    updatedAt: vi.fn(() => FIXED_NOW),
  };
  const priceSource = {
    latestQuote: vi.fn(() => ({ ethUsd: rational(2_000n), updatedAt: FIXED_NOW })),
  };
  const calculate = new CalculateFeeSnapshot({
    clock: { now: () => FIXED_NOW },
    ethereumFeeSource,
    mempoolSource,
    priceSource,
    repository,
    cache,
    publisher: { publish: (event) => events.push(event) },
  });
  return {
    repository,
    cache,
    events,
    bids,
    ethereumFeeSource,
    mempoolSource,
    priceSource,
    calculate,
  };
}

describe('CalculateFeeSnapshot', () => {
  it('calculates, persists, caches and publishes one current snapshot', async () => {
    const context = setup();

    const result = await context.calculate.execute();

    expect(result).toMatchObject({
      recommendationState: 'current',
      recommendedMaxFeeWei: 35_750_000_000n,
      recommendedPriorityFeeWei: 2_000_000_000n,
      status: { persistence: 'available', price: 'fresh' },
    });
    expect(context.repository.inserted).toEqual([result]);
    expect(context.cache.get()).toBe(result);
    expect(context.events).toEqual([{ type: 'fee-snapshot', snapshot: result }]);
  });

  it('publishes last-known with increasing age and never persists it', async () => {
    const context = setup();
    const previous = feeSnapshot({ timestamp: new Date(FIXED_NOW.getTime() - 5_000) });
    context.cache.set(previous);
    context.ethereumFeeSource.getFeeEvidence.mockRejectedValue(
      new EthereumProviderUnavailableError(),
    );

    const result = await context.calculate.execute();

    expect(result).toMatchObject({
      recommendationState: 'last-known',
      dataAgeMs: 5_000,
      confidence: { level: 'unavailable', reasons: ['missing-data'] },
    });
    expect(context.repository.inserted).toEqual([]);
    expect(context.cache.get()).toBe(result);
    expect(context.events).toEqual([{ type: 'fee-snapshot', snapshot: result }]);
  });

  it('leaves current unavailable when required evidence has never succeeded', async () => {
    const context = setup();
    context.ethereumFeeSource.getFeeEvidence.mockRejectedValue(
      new EthereumProviderUnavailableError(),
    );

    await expect(context.calculate.execute()).rejects.toBeInstanceOf(SnapshotUnavailableError);
    expect(context.events).toEqual([]);
  });

  it('does not mask an unexpected provider defect as last-known', async () => {
    const context = setup();
    context.cache.set(feeSnapshot());
    context.ethereumFeeSource.getFeeEvidence.mockRejectedValue(new TypeError('programming defect'));

    await expect(context.calculate.execute()).rejects.toThrow(TypeError);
  });

  it('keeps fees and confidence when price is unavailable', async () => {
    const context = setup();
    context.priceSource.latestQuote.mockReturnValue(null as never);

    const result = await context.calculate.execute();

    expect(result.recommendationState).toBe('current');
    expect(result.estimatedTransferCost.status).toBe('unavailable');
    expect(result.status.price).toBe('unavailable');
    expect(result.confidence.level).not.toBe('unavailable');
  });

  it('exposes a typed unavailable trend without invalidating the snapshot', async () => {
    const context = setup();
    context.repository.historyError = new FeeHistoryUnavailableError();

    const result = await context.calculate.execute();

    expect(result.trend24h).toEqual({
      status: 'unavailable',
      windowMinutes: 5,
      reason: 'history-unavailable',
    });
    expect(result.recommendationState).toBe('current');
  });

  it('publishes a degraded current snapshot when persistence insert fails', async () => {
    const context = setup();
    context.repository.insertError = new PersistenceUnavailableError();

    const result = await context.calculate.execute();

    expect(result.status.persistence).toBe('degraded');
    expect(context.cache.get()).toBe(result);
    expect(context.events).toEqual([{ type: 'fee-snapshot', snapshot: result }]);
  });
});

describe('FeeMonitor', () => {
  it('coalesces five concurrent triggers into one additional execution', async () => {
    let releaseFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let active = 0;
    let maximumActive = 0;
    const execute = vi.fn(async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      if (execute.mock.calls.length === 1) await first;
      active -= 1;
    });
    const monitor = new FeeMonitor({ execute });

    const initial = monitor.trigger();
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    const overlapping = Array.from({ length: 5 }, () => monitor.trigger());
    releaseFirst();
    await Promise.all([initial, ...overlapping]);

    expect(execute).toHaveBeenCalledTimes(2);
    expect(maximumActive).toBe(1);
  });
});

describe('fee query use cases', () => {
  it('restores the latest persisted snapshot only during bootstrap', async () => {
    const repository = new FakeFeeSnapshotRepository();
    const cache = new FeeSnapshotCache();
    const persisted = feeSnapshot();
    repository.latest = persisted;
    const current = new GetCurrentFeeSnapshot(cache, repository);

    await expect(current.execute()).rejects.toBeInstanceOf(SnapshotUnavailableError);
    await current.bootstrap();
    expect(await current.execute()).toBe(persisted);
  });

  it('maps a typed repository outage to HISTORY_UNAVAILABLE', async () => {
    const repository = new FakeFeeSnapshotRepository();
    repository.historyError = new FeeHistoryUnavailableError();
    const history = new GetFeeHistory(repository);

    await expect(
      history.execute({ from: new Date(0), to: FIXED_NOW, limit: 100 }),
    ).rejects.toBeInstanceOf(HistoryUnavailableError);
  });
});
