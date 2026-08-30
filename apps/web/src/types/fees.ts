export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type FeeSnapshot = {
  timestamp: string;
  metadata: { network: "ethereum-mainnet" };
  recommendedMaxFeeGwei: number;
  recommendedPriorityFeeGwei: number;
  ethUsd: number;
  sampleSize: number;
  dataAgeMs: number;
  sources: { mempool: "alchemy"; price: "coinbase" };
};
