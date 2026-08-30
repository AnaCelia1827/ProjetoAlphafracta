import type {
  BlockStatusChangedDto,
  BlockSummaryDto,
  EstimatedTransferCostDto,
  FeeSnapshotDto,
  FeeTrendDto,
  LiveEventDto,
} from '@alphractal/contracts';

import type { LiveEvent } from '../../application/common/live-event-publisher.js';
import type { BlockSummary, FinalityChange } from '../../domain/blocks/models.js';
import type { EstimatedTransferCost, FeeSnapshot, FeeTrend } from '../../domain/fees/models.js';
import { rational, type Rational } from '../../domain/shared/units.js';

const WEI_PER_GWEI = 1_000_000_000n;

export function roundRational(value: Rational, decimalPlaces: number): number {
  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0) {
    throw new RangeError('Decimal places must be a non-negative integer');
  }
  const scale = 10n ** BigInt(decimalPlaces);
  const normalized = rational(value.numerator, value.denominator);
  const scaledNumerator = normalized.numerator * scale;
  let rounded = scaledNumerator / normalized.denominator;
  const remainder = scaledNumerator % normalized.denominator;
  const absoluteRemainder = remainder < 0n ? -remainder : remainder;
  if (absoluteRemainder * 2n >= normalized.denominator) {
    rounded += scaledNumerator < 0n ? -1n : 1n;
  }
  return Number(rounded) / 10 ** decimalPlaces;
}

function weiToGwei(value: bigint | Rational): number {
  const amount = typeof value === 'bigint' ? rational(value) : value;
  return roundRational(rational(amount.numerator, amount.denominator * WEI_PER_GWEI), 9);
}

function serializeTransferCost(value: EstimatedTransferCost): EstimatedTransferCostDto {
  const base = {
    transactionType: value.transactionType,
    gasUnits: 21000 as const,
    maxCostEth: roundRational(value.maxCostEth, 18),
  };
  if (value.status === 'unavailable') return { status: value.status, ...base };
  return {
    status: value.status,
    ...base,
    ethUsd: roundRational(value.ethUsd, 6),
    maxCostUsd: roundRational(value.maxCostUsd, 6),
    priceUpdatedAt: value.priceUpdatedAt.toISOString(),
  };
}

function serializeTrend(value: FeeTrend): FeeTrendDto {
  if (value.status !== 'available') return { ...value };
  return {
    status: value.status,
    windowMinutes: value.windowMinutes,
    percentChange: roundRational(value.percentChange, 2),
    currentMedianMaxFeeGwei: weiToGwei(value.currentMedianMaxFeeWei),
    previousMedianMaxFeeGwei: weiToGwei(value.previousMedianMaxFeeWei),
  };
}

export function serializeFeeSnapshot(snapshot: FeeSnapshot): FeeSnapshotDto {
  return {
    timestamp: snapshot.timestamp.toISOString(),
    metadata: { network: snapshot.network },
    recommendationState: snapshot.recommendationState,
    recommendedMaxFeeGwei: weiToGwei(snapshot.recommendedMaxFeeWei),
    recommendedPriorityFeeGwei: weiToGwei(snapshot.recommendedPriorityFeeWei),
    baseFeeGwei: weiToGwei(snapshot.baseFeeWei),
    effectiveGasPriceGwei: weiToGwei(snapshot.effectiveGasPriceWei),
    estimatedTransferCost: serializeTransferCost(snapshot.estimatedTransferCost),
    trend24h: serializeTrend(snapshot.trend24h),
    confidence: snapshot.confidence,
    sampleSize: snapshot.sampleSize,
    dataAgeMs: snapshot.dataAgeMs,
    sources: { mempool: 'alchemy', ethereum: 'alchemy', price: 'coinbase' },
    sourceUpdatedAt: {
      ...(snapshot.sourceUpdatedAt.mempool === undefined
        ? {}
        : { mempool: snapshot.sourceUpdatedAt.mempool.toISOString() }),
      ...(snapshot.sourceUpdatedAt.ethereum === undefined
        ? {}
        : { ethereum: snapshot.sourceUpdatedAt.ethereum.toISOString() }),
      ...(snapshot.sourceUpdatedAt.price === undefined
        ? {}
        : { price: snapshot.sourceUpdatedAt.price.toISOString() }),
    },
    status: snapshot.status,
  };
}

export function serializeBlockSummary(block: BlockSummary): BlockSummaryDto {
  const number = block.number.toString();
  return {
    number,
    hash: block.hash,
    timestamp: block.timestamp.toISOString(),
    finality: block.finality,
    feeLevel: block.feeLevel,
    baseFeeGwei: weiToGwei(block.baseFeeWei),
    medianPriorityFeeGwei: weiToGwei(block.medianPriorityFeeWei),
    effectiveGasPriceGwei: weiToGwei(block.effectiveGasPriceWei),
    gasUsed: block.gasUsed.toString(),
    gasLimit: block.gasLimit.toString(),
    utilizationPercent: roundRational(block.utilization, 2),
    transactionCount: block.transactionCount,
    provider: block.provider,
    etherscanUrl: `https://etherscan.io/block/${number}`,
  };
}

export function serializeBlockStatusChange(change: FinalityChange): BlockStatusChangedDto {
  return {
    number: change.number.toString(),
    hash: change.hash,
    finality: change.finality,
  };
}

export function serializeLiveEvent(event: LiveEvent): LiveEventDto {
  if (event.type === 'fee-snapshot') {
    const data = serializeFeeSnapshot(event.snapshot);
    return {
      id: `fee:${data.timestamp}`,
      event: event.type,
      data: { data },
    };
  }
  if (event.type === 'block-added') {
    const data = serializeBlockSummary(event.block);
    return {
      id: `block:${data.number}:${data.hash}`,
      event: event.type,
      data: { data },
    };
  }
  const data = serializeBlockStatusChange(event.change);
  return {
    id: `block-status:${data.number}:${data.finality}`,
    event: event.type,
    data: { data },
  };
}
