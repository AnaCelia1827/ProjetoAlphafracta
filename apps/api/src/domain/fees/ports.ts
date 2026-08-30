import type {
  FeeEvidence,
  FeeHistoryPage,
  FeeHistoryQuery,
  FeeSnapshot,
  PendingBid,
  PriceQuote,
} from './models.js';

export interface MempoolSource {
  getPendingBids(since: Date): PendingBid[];
  updatedAt(): Date | null;
}

export interface EthereumFeeSource {
  getFeeEvidence(): Promise<FeeEvidence>;
}

export interface PriceSource {
  latestQuote(): PriceQuote | null;
}

export interface FeeSnapshotRepository {
  insert(snapshot: FeeSnapshot): Promise<void>;
  findLatest(): Promise<FeeSnapshot | null>;
  findWindow(from: Date, to: Date): Promise<FeeSnapshot[]>;
  findPage(query: FeeHistoryQuery): Promise<FeeHistoryPage>;
  isAvailable(): boolean;
}
