import type {
  FeeConfidenceDto,
  FeeTrendDto,
} from "@alphractal/contracts";

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type DataStatus = "fresh" | "stale" | "unavailable";

export type HistoryRangeHours = 1 | 6 | 24;

export type FeeViewModel = {
  timestamp: string;
  recommendationState: "current" | "last-known";
  recommendedMaxFeeGwei: number;
  recommendedPriorityFeeGwei: number;
  baseFeeGwei: number;
  effectiveGasPriceGwei: number;
  maxCostEth: number;
  maxCostUsd?: number;
  priceStatus: "fresh" | "stale" | "unavailable";
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
};
