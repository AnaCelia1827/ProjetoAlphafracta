import type { FeeEvidence, PendingBid } from './models.js';

export interface MempoolSource {
  getPendingBids(since: Date): PendingBid[];
  updatedAt(): Date | null;
}

export interface EthereumFeeSource {
  getFeeEvidence(): Promise<FeeEvidence>;
}
