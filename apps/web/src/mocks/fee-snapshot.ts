import type { FeeHistoryPoint, FeeSnapshot } from "@/types/fees";

export const mockFeeSnapshot: FeeSnapshot = {
  timestamp: "2026-08-25T15:42:15-03:00",
  metadata: { network: "ethereum-mainnet" },
  recommendedMaxFeeGwei: 32.4,
  recommendedPriorityFeeGwei: 1.8,
  ethUsd: 2_745.63,
  sampleSize: 1_284,
  dataAgeMs: 4_200,
  sources: { mempool: "alchemy", price: "coinbase" },
};

export const mockFeeHistory: FeeHistoryPoint[] = [
  ["2026-08-25T09:00:00-03:00", 24.2, 1.2],
  ["2026-08-25T09:30:00-03:00", 25.8, 1.3],
  ["2026-08-25T10:00:00-03:00", 25.1, 1.4],
  ["2026-08-25T10:30:00-03:00", 29.6, 1.5],
  ["2026-08-25T11:00:00-03:00", 34.2, 1.7],
  ["2026-08-25T11:30:00-03:00", 35.7, 1.6],
  ["2026-08-25T12:00:00-03:00", 38.4, 1.9],
  ["2026-08-25T12:30:00-03:00", 42.1, 2.1],
  ["2026-08-25T13:00:00-03:00", 39.8, 1.8],
  ["2026-08-25T13:30:00-03:00", 37.6, 1.7],
  ["2026-08-25T14:00:00-03:00", 40.3, 1.8],
  ["2026-08-25T14:30:00-03:00", 32.4, 1.8],
].map(([timestamp, recommendedMaxFeeGwei, recommendedPriorityFeeGwei]) => ({
  timestamp: String(timestamp),
  recommendedMaxFeeGwei: Number(recommendedMaxFeeGwei),
  recommendedPriorityFeeGwei: Number(recommendedPriorityFeeGwei),
}));
