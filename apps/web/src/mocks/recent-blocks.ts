import type { RecentBlock } from "@/types/blocks";

export const mockRecentBlocks: RecentBlock[] = [
  {
    number: 23_118_401,
    hash: "0x94fb…a18c",
    timestamp: "2026-08-25T15:42:00-03:00",
    transactionCount: 184,
    baseFeeGwei: 30.6,
    priorityFeeGwei: 1.8,
    status: "confirmed",
    condition: "normal",
    provider: "alchemy",
  },
  {
    number: 23_118_400,
    hash: "0xb761…82d0",
    timestamp: "2026-08-25T15:41:48-03:00",
    transactionCount: 161,
    baseFeeGwei: 29.9,
    priorityFeeGwei: 2.1,
    status: "confirmed",
    condition: "elevated",
    provider: "alchemy",
  },
  {
    number: 23_118_399,
    hash: "0x18ad…0fc2",
    timestamp: "2026-08-25T15:41:36-03:00",
    transactionCount: 173,
    baseFeeGwei: 28.4,
    priorityFeeGwei: 1.7,
    status: "confirmed",
    condition: "normal",
    provider: "alchemy",
  },
];
