import type {
  BlockIdentifier,
  BlockSummary,
  FinalityChange,
  FinalityHeads,
  NormalizedBlock,
  BlockHash,
} from './models.js';

export interface EthereumBlockSource {
  getBlock(identifier: BlockIdentifier): Promise<NormalizedBlock | null>;
  getLatestBlockNumber(): Promise<bigint>;
  getFinalityHeads(): Promise<FinalityHeads>;
}

export interface ObservedBlockRepository {
  saveCanonical(block: BlockSummary): Promise<void>;
  markNoncanonical(
    network: 'ethereum-mainnet',
    number: bigint,
    exceptHash: BlockHash,
  ): Promise<void>;
  findRecent(limit: number): Promise<BlockSummary[]>;
  findCanonicalBefore(timestamp: Date, from: Date): Promise<BlockSummary[]>;
  updateFinality(changes: FinalityChange[]): Promise<void>;
  isAvailable(): boolean;
}
