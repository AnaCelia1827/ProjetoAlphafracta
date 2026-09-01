import type { BlockSummaryDto, FeeSnapshotDto } from '@alphractal/contracts';
import type { BlockViewModel } from '@/types/blocks';
import type { FeeHistoryPoint, FeeViewModel } from '@/types/fees';

export function toFeeViewModel(snapshot: FeeSnapshotDto): FeeViewModel {
  const cost = snapshot.estimatedTransferCost;

  return {
    timestamp: snapshot.timestamp,
    recommendationState: snapshot.recommendationState,
    recommendedMaxFeeGwei: snapshot.recommendedMaxFeeGwei,
    recommendedPriorityFeeGwei: snapshot.recommendedPriorityFeeGwei,
    baseFeeGwei: snapshot.baseFeeGwei,
    effectiveGasPriceGwei: snapshot.effectiveGasPriceGwei,
    maxCostEth: cost.maxCostEth,
    ...(cost.status === 'unavailable' ? {} : { maxCostUsd: cost.maxCostUsd }),
    priceStatus: cost.status,
    trend: snapshot.trend24h,
    confidence: snapshot.confidence,
    sampleSize: snapshot.sampleSize,
    dataAgeMs: snapshot.dataAgeMs,
    status: snapshot.status,
  };
}

export const toHistoryPoint = (snapshot: FeeSnapshotDto): FeeHistoryPoint => ({
  timestamp: snapshot.timestamp,
  recommendedMaxFeeGwei: snapshot.recommendedMaxFeeGwei,
  recommendedPriorityFeeGwei: snapshot.recommendedPriorityFeeGwei,
  ...(snapshot.estimatedTransferCost.status === 'unavailable'
    ? {}
    : { maxCostUsd: snapshot.estimatedTransferCost.maxCostUsd }),
});

export const toBlockViewModel = (block: BlockSummaryDto): BlockViewModel => ({
  number: block.number,
  hash: block.hash,
  timestamp: block.timestamp,
  finality: block.finality,
  feeLevel: block.feeLevel,
  baseFeeGwei: block.baseFeeGwei,
  priorityFeeGwei: block.medianPriorityFeeGwei,
  effectiveGasPriceGwei: block.effectiveGasPriceGwei,
  utilizationPercent: block.utilizationPercent,
  transactionCount: block.transactionCount,
  provider: block.provider,
  etherscanUrl: block.etherscanUrl,
});
