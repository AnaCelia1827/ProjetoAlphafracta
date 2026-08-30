import {
  EthereumProviderUnavailableError,
  PersistenceUnavailableError,
  SnapshotUnavailableError,
} from '../common/errors.js';
import type { LiveEventPublisher } from '../common/live-event-publisher.js';
import { evaluateFeeConfidence } from '../../domain/fees/fee-confidence.js';
import { estimateFees } from '../../domain/fees/fee-estimator.js';
import { calculateTrend24h } from '../../domain/fees/fee-trend.js';
import { calculateTransferCost } from '../../domain/fees/transfer-cost.js';
import type { FeeSnapshot, PriceQuote } from '../../domain/fees/models.js';
import type {
  EthereumFeeSource,
  FeeSnapshotRepository,
  MempoolSource,
  PriceSource,
} from '../../domain/fees/ports.js';
import type { Clock } from '../../domain/shared/clock.js';

const MEMPOOL_WINDOW_MS = 30_000;
const FRESH_REQUIRED_SOURCE_MS = 10_000;
const UNAVAILABLE_REQUIRED_SOURCE_MS = 30_000;
const FRESH_PRICE_MS = 30_000;

type SourceStatus = 'fresh' | 'stale' | 'unavailable';

export class FeeSnapshotCache {
  private snapshot: FeeSnapshot | null = null;

  get(): FeeSnapshot | null {
    return this.snapshot;
  }

  set(snapshot: FeeSnapshot): void {
    this.snapshot = snapshot;
  }
}

export interface CalculateFeeSnapshotDependencies {
  clock: Clock;
  ethereumFeeSource: EthereumFeeSource;
  mempoolSource: MempoolSource;
  priceSource: PriceSource;
  repository: FeeSnapshotRepository;
  cache: FeeSnapshotCache;
  publisher: LiveEventPublisher;
}

function ageMs(updatedAt: Date, now: Date): number {
  return Math.max(0, now.getTime() - updatedAt.getTime());
}

function requiredSourceStatus(updatedAt: Date | undefined, now: Date): SourceStatus {
  if (updatedAt === undefined) return 'unavailable';
  const age = ageMs(updatedAt, now);
  if (age <= FRESH_REQUIRED_SOURCE_MS) return 'fresh';
  if (age <= UNAVAILABLE_REQUIRED_SOURCE_MS) return 'stale';
  return 'unavailable';
}

function priceStatus(quote: PriceQuote | null, now: Date): SourceStatus {
  if (quote === null) return 'unavailable';
  return ageMs(quote.updatedAt, now) <= FRESH_PRICE_MS ? 'fresh' : 'stale';
}

function recommendationAge(
  mempoolUpdatedAt: Date | undefined,
  ethereumUpdatedAt: Date | undefined,
  now: Date,
): number {
  const timestamps = [mempoolUpdatedAt, ethereumUpdatedAt].filter(
    (value): value is Date => value !== undefined,
  );
  if (timestamps.length !== 2) return UNAVAILABLE_REQUIRED_SOURCE_MS + 1;
  return Math.max(...timestamps.map((value) => ageMs(value, now)));
}

export class CalculateFeeSnapshot {
  constructor(private readonly dependencies: CalculateFeeSnapshotDependencies) {}

  async execute(): Promise<FeeSnapshot> {
    let evidence;
    try {
      evidence = await this.dependencies.ethereumFeeSource.getFeeEvidence();
    } catch (error) {
      if (error instanceof EthereumProviderUnavailableError) {
        return this.publishLastKnown(this.dependencies.clock.now());
      }
      throw error;
    }

    const now = this.dependencies.clock.now();
    const mempoolUpdatedAt = this.dependencies.mempoolSource.updatedAt() ?? undefined;
    const pendingBids = this.dependencies.mempoolSource.getPendingBids(
      new Date(now.getTime() - MEMPOOL_WINDOW_MS),
    );
    const estimate = estimateFees({ evidence, pendingBids, now });
    if (mempoolUpdatedAt === undefined || estimate === null) {
      return this.publishLastKnown(now);
    }

    const quote = this.dependencies.priceSource.latestQuote();
    const trend24h = await calculateTrend24h({
      now,
      repository: this.dependencies.repository,
    });
    const estimatedTransferCost = calculateTransferCost({
      recommendedMaxFeeWei: estimate.recommendedMaxFeeWei,
      quote,
      now,
    });
    let snapshot: FeeSnapshot = {
      timestamp: now,
      network: 'ethereum-mainnet',
      recommendationState: 'current',
      recommendedMaxFeeWei: estimate.recommendedMaxFeeWei,
      recommendedPriorityFeeWei: estimate.recommendedPriorityFeeWei,
      baseFeeWei: estimate.latestBaseFeeWei,
      effectiveGasPriceWei: estimate.effectiveGasPriceWei,
      estimatedTransferCost,
      trend24h,
      confidence: evaluateFeeConfidence({
        now,
        mempoolUpdatedAt,
        ethereumUpdatedAt: evidence.ethereumUpdatedAt,
        effectiveTipsWei: estimate.pendingEffectiveTipsWei,
      }),
      sampleSize: estimate.pendingEffectiveTipsWei.length,
      dataAgeMs: recommendationAge(mempoolUpdatedAt, evidence.ethereumUpdatedAt, now),
      sourceUpdatedAt: {
        mempool: mempoolUpdatedAt,
        ethereum: evidence.ethereumUpdatedAt,
        ...(quote === null ? {} : { price: quote.updatedAt }),
      },
      status: {
        mempool: requiredSourceStatus(mempoolUpdatedAt, now),
        ethereum: requiredSourceStatus(evidence.ethereumUpdatedAt, now),
        price: priceStatus(quote, now),
        persistence: this.dependencies.repository.isAvailable() ? 'available' : 'degraded',
      },
    };

    if (this.dependencies.repository.isAvailable()) {
      try {
        await this.dependencies.repository.insert(snapshot);
      } catch (error) {
        if (!(error instanceof PersistenceUnavailableError)) throw error;
        snapshot = {
          ...snapshot,
          status: { ...snapshot.status, persistence: 'degraded' },
        };
      }
    }

    this.dependencies.cache.set(snapshot);
    this.dependencies.publisher.publish({ type: 'fee-snapshot', snapshot });
    return snapshot;
  }

  private publishLastKnown(now: Date): FeeSnapshot {
    const previous = this.dependencies.cache.get();
    if (previous === null) throw new SnapshotUnavailableError();

    const quote = this.dependencies.priceSource.latestQuote();
    const elapsedSincePrevious = Math.max(0, now.getTime() - previous.timestamp.getTime());
    const dataAgeMs = Math.max(
      previous.dataAgeMs + elapsedSincePrevious,
      recommendationAge(previous.sourceUpdatedAt.mempool, previous.sourceUpdatedAt.ethereum, now),
    );
    const snapshot: FeeSnapshot = {
      ...previous,
      timestamp: now,
      recommendationState: 'last-known',
      estimatedTransferCost: calculateTransferCost({
        recommendedMaxFeeWei: previous.recommendedMaxFeeWei,
        quote,
        now,
      }),
      confidence: { level: 'unavailable', reasons: ['missing-data'] },
      dataAgeMs,
      sourceUpdatedAt: {
        ...previous.sourceUpdatedAt,
        ...(quote === null ? {} : { price: quote.updatedAt }),
      },
      status: {
        mempool: requiredSourceStatus(previous.sourceUpdatedAt.mempool, now),
        ethereum: requiredSourceStatus(previous.sourceUpdatedAt.ethereum, now),
        price: priceStatus(quote, now),
        persistence: this.dependencies.repository.isAvailable() ? 'available' : 'degraded',
      },
    };

    this.dependencies.cache.set(snapshot);
    this.dependencies.publisher.publish({ type: 'fee-snapshot', snapshot });
    return snapshot;
  }
}
