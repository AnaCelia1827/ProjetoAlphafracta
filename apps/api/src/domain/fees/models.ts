import type { Rational } from '../shared/units.js';

export type TransactionHash = `0x${string}`;

export interface FeeEvidence {
  latestBaseFeeWei: bigint;
  projectedNextBaseFeeWei: bigint;
  historicalRewardP60Wei: bigint[];
  ethereumUpdatedAt: Date;
}

export interface PendingBid {
  hash: TransactionHash;
  observedAt: Date;
  kind: 'eip1559' | 'legacy';
  maxFeePerGasWei?: bigint;
  maxPriorityFeePerGasWei?: bigint;
  gasPriceWei?: bigint;
}

export interface FeePolicy {
  mempoolWindowMs: number;
  feeHistoryBlockCount: number;
  rewardPercentile: number;
  pendingPercentile: number;
  baseFeeHeadroomBasisPoints: number;
}

export const DEFAULT_FEE_POLICY = {
  mempoolWindowMs: 30_000,
  feeHistoryBlockCount: 10,
  rewardPercentile: 0.6,
  pendingPercentile: 0.6,
  baseFeeHeadroomBasisPoints: 1_125,
} as const satisfies FeePolicy;

export interface FeeEstimate {
  latestBaseFeeWei: bigint;
  projectedNextBaseFeeWei: bigint;
  recommendedPriorityFeeWei: bigint;
  recommendedMaxFeeWei: bigint;
  effectiveGasPriceWei: bigint;
  pendingEffectiveTipsWei: bigint[];
}

export interface PriceQuote {
  ethUsd: Rational;
  updatedAt: Date;
}

interface TransferCostBase {
  transactionType: 'native-eth-transfer';
  gasUnits: 21_000n;
  maxCostEth: Rational;
}

export type EstimatedTransferCost =
  | (TransferCostBase & {
      status: 'fresh' | 'stale';
      ethUsd: Rational;
      maxCostUsd: Rational;
      priceUpdatedAt: Date;
    })
  | (TransferCostBase & {
      status: 'unavailable';
    });

export type FeeTrend =
  | {
      status: 'available';
      windowMinutes: 5;
      percentChange: Rational;
      currentMedianMaxFeeWei: Rational;
      previousMedianMaxFeeWei: Rational;
    }
  | {
      status: 'insufficient-history';
      windowMinutes: 5;
    }
  | {
      status: 'unavailable';
      windowMinutes: 5;
      reason: 'history-unavailable';
    };

export type FeeConfidenceReason =
  | 'fresh-data'
  | 'stable-fees'
  | 'strong-sample'
  | 'aging-data'
  | 'volatile-fees'
  | 'weak-sample'
  | 'missing-data';

export interface FeeConfidence {
  level: 'high' | 'medium' | 'low' | 'unavailable';
  reasons: FeeConfidenceReason[];
}

export interface FeeSnapshot {
  timestamp: Date;
  network: 'ethereum-mainnet';
  recommendationState: 'current' | 'last-known';
  recommendedMaxFeeWei: bigint;
  recommendedPriorityFeeWei: bigint;
  baseFeeWei: bigint;
  effectiveGasPriceWei: bigint;
  estimatedTransferCost: EstimatedTransferCost;
  trend24h: FeeTrend;
  confidence: FeeConfidence;
  sampleSize: number;
  dataAgeMs: number;
  sourceUpdatedAt: {
    mempool?: Date;
    ethereum?: Date;
    price?: Date;
  };
  status: {
    mempool: 'fresh' | 'stale' | 'unavailable';
    ethereum: 'fresh' | 'stale' | 'unavailable';
    price: 'fresh' | 'stale' | 'unavailable';
    persistence: 'available' | 'degraded';
  };
}

export interface FeeHistoryQuery {
  from: Date;
  to: Date;
  limit: number;
  cursor?: string;
}

export interface FeeHistoryPage {
  data: FeeSnapshot[];
  nextCursor: string | null;
}

export interface ConfidencePolicy {
  freshSourceAgeMs: number;
  mediumSourceAgeMs: number;
  unavailableSourceAgeMs: number;
  highSampleSize: number;
  mediumSampleSize: number;
  highRelativeIqr: Rational;
  mediumRelativeIqr: Rational;
}

export const DEFAULT_CONFIDENCE_POLICY = {
  freshSourceAgeMs: 10_000,
  mediumSourceAgeMs: 20_000,
  unavailableSourceAgeMs: 30_000,
  highSampleSize: 500,
  mediumSampleSize: 100,
  highRelativeIqr: { numerator: 1n, denominator: 2n },
  mediumRelativeIqr: { numerator: 1n, denominator: 1n },
} as const satisfies ConfidencePolicy;
