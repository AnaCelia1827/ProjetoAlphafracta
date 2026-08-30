import type { Rational } from '../shared/units.js';

export type BlockHash = `0x${string}`;

export type NormalizedBlockTransaction =
  | {
      kind: 'eip1559';
      maxFeePerGasWei?: bigint;
      maxPriorityFeePerGasWei?: bigint;
    }
  | {
      kind: 'legacy';
      gasPriceWei?: bigint;
    };

export interface NormalizedBlock {
  number: bigint;
  hash: BlockHash;
  timestamp: Date;
  baseFeePerGasWei: bigint | null;
  gasUsed: bigint;
  gasLimit: bigint;
  transactions: NormalizedBlockTransaction[];
}

export type BlockFinality = 'latest' | 'safe' | 'finalized';
export type BlockFeeLevel = 'low' | 'normal' | 'elevated' | 'high' | 'unavailable';

export interface BlockSummary {
  network: 'ethereum-mainnet';
  number: bigint;
  hash: BlockHash;
  timestamp: Date;
  finality: BlockFinality;
  feeLevel: BlockFeeLevel;
  baseFeeWei: bigint;
  medianPriorityFeeWei: Rational;
  effectiveGasPriceWei: Rational;
  gasUsed: bigint;
  gasLimit: bigint;
  utilization: Rational;
  transactionCount: number;
  provider: 'alchemy';
}

export interface FinalityHead {
  number: bigint;
  hash: BlockHash;
}

export interface FinalityHeads {
  safe: FinalityHead;
  finalized: FinalityHead;
}

export interface FinalityChange {
  number: bigint;
  hash: BlockHash;
  finality: BlockFinality;
}

export type BlockIdentifier = bigint | BlockHash;
