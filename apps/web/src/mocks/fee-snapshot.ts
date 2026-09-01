import { FeeSnapshotSchema } from '@alphractal/contracts';
import type { FeeHistoryPoint } from '@/types/fees';

export const mockFeeSnapshot = FeeSnapshotSchema.parse({
  timestamp: '2026-08-31T03:00:00.000Z',
  metadata: { network: 'ethereum-mainnet' },
  recommendationState: 'current',
  recommendedMaxFeeGwei: 32.4,
  recommendedPriorityFeeGwei: 1.8,
  baseFeeGwei: 30.6,
  effectiveGasPriceGwei: 32.4,
  estimatedTransferCost: {
    status: 'fresh',
    transactionType: 'native-eth-transfer',
    gasUnits: 21000,
    maxCostEth: 0.0006804,
    ethUsd: 2745.63,
    maxCostUsd: 1.87,
    priceUpdatedAt: '2026-08-31T02:59:55.000Z',
  },
  trend24h: {
    status: 'available',
    windowMinutes: 5,
    percentChange: 4.2,
    currentMedianMaxFeeGwei: 32.4,
    previousMedianMaxFeeGwei: 31.09,
  },
  confidence: {
    level: 'high',
    reasons: ['fresh-data', 'strong-sample'],
  },
  sampleSize: 1284,
  dataAgeMs: 4200,
  sources: {
    mempool: 'alchemy',
    ethereum: 'alchemy',
    price: 'coinbase',
  },
  sourceUpdatedAt: {
    mempool: '2026-08-31T02:59:58.000Z',
    ethereum: '2026-08-31T02:59:59.000Z',
    price: '2026-08-31T02:59:55.000Z',
  },
  status: {
    mempool: 'fresh',
    ethereum: 'fresh',
    price: 'fresh',
    persistence: 'available',
  },
});

export const mockFeeHistory: FeeHistoryPoint[] = [
  ['2026-08-31T00:00:00.000Z', 24.2, 1.2],
  ['2026-08-31T00:15:00.000Z', 25.8, 1.3],
  ['2026-08-31T00:30:00.000Z', 25.1, 1.4],
  ['2026-08-31T00:45:00.000Z', 29.6, 1.5],
  ['2026-08-31T01:00:00.000Z', 34.2, 1.7],
  ['2026-08-31T01:15:00.000Z', 35.7, 1.6],
  ['2026-08-31T01:30:00.000Z', 38.4, 1.9],
  ['2026-08-31T01:45:00.000Z', 42.1, 2.1],
  ['2026-08-31T02:00:00.000Z', 39.8, 1.8],
  ['2026-08-31T02:20:00.000Z', 37.6, 1.7],
  ['2026-08-31T02:40:00.000Z', 40.3, 1.8],
  ['2026-08-31T03:00:00.000Z', 32.4, 1.8],
].map(([timestamp, recommendedMaxFeeGwei, recommendedPriorityFeeGwei]) => ({
  timestamp: String(timestamp),
  recommendedMaxFeeGwei: Number(recommendedMaxFeeGwei),
  recommendedPriorityFeeGwei: Number(recommendedPriorityFeeGwei),
}));
