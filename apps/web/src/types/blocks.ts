export type RecentBlock = {
  number: number;
  hash: string;
  timestamp: string;
  transactionCount: number;
  baseFeeGwei: number;
};

export type RecentBlocksResponse = {
  items: RecentBlock[];
};
