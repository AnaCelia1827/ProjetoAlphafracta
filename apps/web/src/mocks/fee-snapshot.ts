import type { FeeSnapshot } from "@/types/fees";

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

export const mockFeeHistory = [
  { time: "09:00", maxFeeGwei: 24.2, priorityFeeGwei: 1.2 },
  { time: "09:30", maxFeeGwei: 25.8, priorityFeeGwei: 1.3 },
  { time: "10:00", maxFeeGwei: 25.1, priorityFeeGwei: 1.4 },
  { time: "10:30", maxFeeGwei: 29.6, priorityFeeGwei: 1.5 },
  { time: "11:00", maxFeeGwei: 34.2, priorityFeeGwei: 1.7 },
  { time: "11:30", maxFeeGwei: 35.7, priorityFeeGwei: 1.6 },
  { time: "12:00", maxFeeGwei: 38.4, priorityFeeGwei: 1.9 },
  { time: "12:30", maxFeeGwei: 42.1, priorityFeeGwei: 2.1 },
  { time: "13:00", maxFeeGwei: 39.8, priorityFeeGwei: 1.8 },
  { time: "13:30", maxFeeGwei: 37.6, priorityFeeGwei: 1.7 },
  { time: "14:00", maxFeeGwei: 40.3, priorityFeeGwei: 1.8 },
  { time: "14:30", maxFeeGwei: 32.4, priorityFeeGwei: 1.8 },
];
