import type { FeeConfidenceDto, FeeTrendDto } from '@alphractal/contracts';

export type LiveConnection = 'connecting' | 'live' | 'degraded' | 'offline';

export type DataStatus = 'fresh' | 'stale' | 'unavailable';

export type HistoryRangeMinutes = 5 | 15 | 60 | 360 | 1440;

export type FeeViewModel = {
  timestamp: string;
  recommendationState: 'current' | 'last-known';
  recommendedMaxFeeGwei: number;
  recommendedPriorityFeeGwei: number;
  baseFeeGwei: number;
  effectiveGasPriceGwei: number;
  maxCostEth: number;
  maxCostUsd?: number;
  priceStatus: 'fresh' | 'stale' | 'unavailable';
  trend: FeeTrendDto;
  confidence: FeeConfidenceDto;
  sampleSize: number;
  dataAgeMs: number;
  status: {
    mempool: string;
    ethereum: string;
    price: string;
    persistence: string;
  };
};

export type FeeHistoryPoint = {
  timestamp: string;
  recommendedMaxFeeGwei: number;
  recommendedPriorityFeeGwei: number;
  maxCostUsd?: number;
};
