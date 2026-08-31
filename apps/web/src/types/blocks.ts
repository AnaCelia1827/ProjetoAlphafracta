export type RecentBlock = {
  number: number;
  hash: string;
  timestamp: string;
  transactionCount: number;
  baseFeeGwei: number;
  priorityFeeGwei?: number;
  status?: "confirmed" | "pending";
  condition?: "normal" | "elevated";
  provider?: "alchemy";
};

export type RecentBlocksResponse = {
  items: RecentBlock[];
};
