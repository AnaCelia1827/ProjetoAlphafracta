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
