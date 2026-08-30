import type { BlockSummary, NormalizedBlock } from '../../src/domain/blocks/models.js';
import type { FeeSnapshot, PendingBid } from '../../src/domain/fees/models.js';
import { rational } from '../../src/domain/shared/units.js';

export const FIXED_NOW = new Date('2026-08-30T18:42:15.000Z');

export function pendingBid(
  index: number,
  observedAt = FIXED_NOW,
  tipWei = 2_000_000_000n,
): PendingBid {
  return {
    hash: `0x${index.toString(16).padStart(64, '0')}`,
    observedAt,
    kind: 'eip1559',
    maxFeePerGasWei: 40_000_000_000n,
    maxPriorityFeePerGasWei: tipWei,
  };
}

export function feeSnapshot(overrides: Partial<FeeSnapshot> = {}): FeeSnapshot {
  return {
    timestamp: FIXED_NOW,
    network: 'ethereum-mainnet',
    recommendationState: 'current',
    recommendedMaxFeeWei: 35_750_000_000n,
    recommendedPriorityFeeWei: 2_000_000_000n,
    baseFeeWei: 30_000_000_000n,
    effectiveGasPriceWei: 32_000_000_000n,
    estimatedTransferCost: {
      status: 'unavailable',
      transactionType: 'native-eth-transfer',
      gasUnits: 21_000n,
      maxCostEth: rational(3003n, 4_000_000n),
    },
    trend24h: { status: 'insufficient-history', windowMinutes: 5 },
    confidence: {
      level: 'low',
      reasons: ['fresh-data', 'stable-fees', 'weak-sample'],
    },
    sampleSize: 1,
    dataAgeMs: 0,
    sourceUpdatedAt: { mempool: FIXED_NOW, ethereum: FIXED_NOW },
    status: {
      mempool: 'fresh',
      ethereum: 'fresh',
      price: 'unavailable',
      persistence: 'available',
    },
    ...overrides,
  };
}

export function normalizedBlock(
  number: bigint,
  hash: `0x${string}` = `0x${number.toString(16).padStart(64, '0')}`,
): NormalizedBlock {
  return {
    number,
    hash,
    timestamp: new Date(FIXED_NOW.getTime() + Number(number - 20_000_000n) * 12_000),
    baseFeePerGasWei: 30_000_000_000n,
    gasUsed: 15_000_000n,
    gasLimit: 30_000_000n,
    transactions: [
      {
        kind: 'eip1559',
        maxFeePerGasWei: 40_000_000_000n,
        maxPriorityFeePerGasWei: 2_000_000_000n,
      },
    ],
  };
}

export function blockSummary(number: bigint, overrides: Partial<BlockSummary> = {}): BlockSummary {
  const block = normalizedBlock(number);
  return {
    network: 'ethereum-mainnet',
    number,
    hash: block.hash,
    timestamp: block.timestamp,
    finality: 'latest',
    feeLevel: 'unavailable',
    baseFeeWei: 30_000_000_000n,
    medianPriorityFeeWei: rational(2_000_000_000n),
    effectiveGasPriceWei: rational(32_000_000_000n),
    gasUsed: 15_000_000n,
    gasLimit: 30_000_000n,
    utilization: rational(50n),
    transactionCount: 1,
    provider: 'alchemy',
    ...overrides,
  };
}
