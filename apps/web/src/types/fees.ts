export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export type DataStatus = "fresh" | "stale" | "unavailable";

export type ServiceStatus =
  | "connected"
  | "reconnecting"
  | "stale"
  | "unavailable";

export type ServiceHealth = {
  mempool: ServiceStatus;
  price: ServiceStatus;
  persistence: ServiceStatus;
};

export type FeeSnapshot = {
  timestamp: string;
  metadata: { network: "ethereum-mainnet" };
  recommendedMaxFeeGwei: number;
  recommendedPriorityFeeGwei: number;
  ethUsd: number;
  sampleSize: number;
  dataAgeMs: number;
  sources: { mempool: "alchemy"; price: "coinbase" };
  health?: ServiceHealth;
};

export type FeeHistoryPoint = Pick<
  FeeSnapshot,
  | "timestamp"
  | "recommendedMaxFeeGwei"
  | "recommendedPriorityFeeGwei"
>;

export type FeeHistoryResponse = {
  items: FeeHistoryPoint[];
};
