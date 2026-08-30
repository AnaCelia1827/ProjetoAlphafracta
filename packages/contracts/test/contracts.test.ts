import type { ZodType } from 'zod';
import { describe, expect, it } from 'vitest';

import * as contracts from '../src/index.js';

const hash = '0x7d9452dca37be2e88b85f074f8142ab746d9f58b90d63d1d7ba2ea5ecbf10a4e';

const feeSnapshot = {
  timestamp: '2026-08-30T18:42:15.123Z',
  metadata: { network: 'ethereum-mainnet' },
  recommendationState: 'current',
  recommendedMaxFeeGwei: 32.4,
  recommendedPriorityFeeGwei: 1.8,
  baseFeeGwei: 28.7,
  effectiveGasPriceGwei: 30.5,
  estimatedTransferCost: {
    status: 'fresh',
    transactionType: 'native-eth-transfer',
    gasUnits: 21000,
    maxCostEth: 0.0006804,
    ethUsd: 3420.25,
    maxCostUsd: 2.327,
    priceUpdatedAt: '2026-08-30T18:42:15.002Z',
  },
  trend24h: {
    status: 'available',
    windowMinutes: 5,
    percentChange: 8.4,
    currentMedianMaxFeeGwei: 32.1,
    previousMedianMaxFeeGwei: 29.61,
  },
  confidence: {
    level: 'high',
    reasons: ['fresh-data', 'stable-fees', 'strong-sample'],
  },
  sampleSize: 2847,
  dataAgeMs: 320,
  sources: { mempool: 'alchemy', ethereum: 'alchemy', price: 'coinbase' },
  sourceUpdatedAt: {
    mempool: '2026-08-30T18:42:14.810Z',
    ethereum: '2026-08-30T18:42:13.900Z',
    price: '2026-08-30T18:42:15.002Z',
  },
  status: {
    mempool: 'fresh',
    ethereum: 'fresh',
    price: 'fresh',
    persistence: 'available',
  },
} as const;

const blockSummary = {
  number: '23548192',
  hash,
  timestamp: '2026-08-30T18:42:15.000Z',
  finality: 'latest',
  feeLevel: 'normal',
  baseFeeGwei: 28.7,
  medianPriorityFeeGwei: 1.8,
  effectiveGasPriceGwei: 30.5,
  gasUsed: '23400000',
  gasLimit: '30000000',
  utilizationPercent: 78,
  transactionCount: 184,
  provider: 'alchemy',
  etherscanUrl: 'https://etherscan.io/block/23548192',
} as const;

function schema(name: string): ZodType {
  expect(contracts).toHaveProperty(name);
  return (contracts as Record<string, ZodType>)[name]!;
}

describe('FeeSnapshotSchema', () => {
  it('accepts the documented current snapshot', () => {
    expect(schema('FeeSnapshotSchema').safeParse(feeSnapshot).success).toBe(true);
  });

  it.each([
    {
      status: 'stale',
      transactionType: 'native-eth-transfer',
      gasUnits: 21000,
      maxCostEth: 0.0006804,
      ethUsd: 3420.25,
      maxCostUsd: 2.327,
      priceUpdatedAt: '2026-08-30T18:42:15.002Z',
    },
    {
      status: 'unavailable',
      transactionType: 'native-eth-transfer',
      gasUnits: 21000,
      maxCostEth: 0.0006804,
    },
  ])('accepts the $status transfer-cost variant', (estimatedTransferCost) => {
    const result = schema('FeeSnapshotSchema').safeParse({
      ...feeSnapshot,
      estimatedTransferCost,
    });

    expect(result.success).toBe(true);
  });

  it.each([
    { status: 'insufficient-history', windowMinutes: 5 },
    { status: 'unavailable', windowMinutes: 5, reason: 'history-unavailable' },
  ])('accepts the $status trend variant', (trend24h) => {
    expect(schema('FeeSnapshotSchema').safeParse({ ...feeSnapshot, trend24h }).success).toBe(true);
  });

  it('requires unavailable confidence for last-known recommendations', () => {
    const invalid = schema('FeeSnapshotSchema').safeParse({
      ...feeSnapshot,
      recommendationState: 'last-known',
    });
    const valid = schema('FeeSnapshotSchema').safeParse({
      ...feeSnapshot,
      recommendationState: 'last-known',
      confidence: {
        level: 'unavailable',
        reasons: ['missing-data', 'volatile-fees', 'weak-sample'],
      },
    });

    expect(invalid.success).toBe(false);
    expect(valid.success).toBe(true);
  });

  it.each([
    { timestamp: '2026-08-30T18:42:15+00:00' },
    { recommendedMaxFeeGwei: -1 },
    { baseFeeGwei: Number.NaN },
    { effectiveGasPriceGwei: Number.POSITIVE_INFINITY },
    { sampleSize: 1.5 },
    { confidence: { level: 'certain', reasons: ['fresh-data'] } },
    {
      estimatedTransferCost: {
        status: 'fresh',
        transactionType: 'native-eth-transfer',
        gasUnits: 21000,
        maxCostEth: 1,
      },
    },
    { trend24h: { status: 'available', windowMinutes: 5, percentChange: 1 } },
  ])('rejects malformed snapshot data %#', (change) => {
    expect(schema('FeeSnapshotSchema').safeParse({ ...feeSnapshot, ...change }).success).toBe(
      false,
    );
  });
});

describe('BlockSummarySchema', () => {
  it('accepts the documented block summary', () => {
    expect(schema('BlockSummarySchema').safeParse(blockSummary).success).toBe(true);
  });

  it.each([
    { number: '-1' },
    { number: '01' },
    { hash: '0x1234' },
    { gasUsed: '12.5' },
    { utilizationPercent: 100.01 },
    { transactionCount: -1 },
    { finality: 'pending' },
    { feeLevel: 'extreme' },
  ])('rejects malformed block data %#', (change) => {
    expect(schema('BlockSummarySchema').safeParse({ ...blockSummary, ...change }).success).toBe(
      false,
    );
  });

  it('accepts decimal or hash block identifiers and rejects other shapes', () => {
    const blockIdentifierSchema = schema('BlockIdentifierSchema');

    expect(blockIdentifierSchema.safeParse('12965000').success).toBe(true);
    expect(blockIdentifierSchema.safeParse(hash).success).toBe(true);
    expect(blockIdentifierSchema.safeParse('+12965000').success).toBe(false);
    expect(blockIdentifierSchema.safeParse('0x1234').success).toBe(false);
  });
});

describe('REST envelopes and queries', () => {
  it('validates current, recent and single-block envelopes', () => {
    expect(schema('FeeCurrentResponseSchema').safeParse({ data: feeSnapshot }).success).toBe(true);
    expect(schema('RecentBlocksResponseSchema').safeParse({ data: [blockSummary] }).success).toBe(
      true,
    );
    expect(schema('BlockResponseSchema').safeParse({ data: blockSummary }).success).toBe(true);
  });

  it('parses a valid history query and rejects malformed ranges', () => {
    const historyQuerySchema = schema('FeeHistoryQuerySchema');
    const valid = historyQuerySchema.safeParse({
      from: '2026-08-30T17:00:00.000Z',
      to: '2026-08-30T18:00:00.000Z',
      limit: '100',
    });

    expect(valid.success).toBe(true);
    expect(
      historyQuerySchema.safeParse({
        from: '2026-08-30T18:00:00.000Z',
        to: '2026-08-30T17:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(
      historyQuerySchema.safeParse({
        from: '2026-08-30T17:00:00.000Z',
        to: '2026-08-30T18:00:00.000Z',
        limit: '5001',
      }).success,
    ).toBe(false);
  });

  it('keeps history pagination fields coherent', () => {
    const historyResponseSchema = schema('FeeHistoryResponseSchema');

    expect(
      historyResponseSchema.safeParse({
        data: [feeSnapshot],
        page: { nextCursor: 'opaque', hasMore: true },
      }).success,
    ).toBe(true);
    expect(
      historyResponseSchema.safeParse({
        data: [],
        page: { nextCursor: null, hasMore: true },
      }).success,
    ).toBe(false);
  });

  it('accepts every stable API error code', () => {
    const apiErrorSchema = schema('ApiErrorSchema');
    const codes = [
      'INVALID_QUERY',
      'INVALID_TIME_RANGE',
      'INVALID_BLOCK_IDENTIFIER',
      'ROUTE_NOT_FOUND',
      'BLOCK_NOT_FOUND',
      'PRE_EIP1559_BLOCK_UNSUPPORTED',
      'SNAPSHOT_UNAVAILABLE',
      'HISTORY_UNAVAILABLE',
      'BLOCKS_UNAVAILABLE',
      'ETHEREUM_PROVIDER_UNAVAILABLE',
      'INTERNAL_ERROR',
    ];

    for (const code of codes) {
      expect(
        apiErrorSchema.safeParse({
          error: { code, message: 'Safe message', requestId: 'req-1' },
        }).success,
      ).toBe(true);
    }
  });
});

describe('LiveEventSchema', () => {
  it.each([
    {
      id: 'fee:2026-08-30T18:42:15.123Z',
      event: 'fee-snapshot',
      data: { data: feeSnapshot },
    },
    {
      id: `block:23548192:${hash}`,
      event: 'block-added',
      data: { data: blockSummary },
    },
    {
      id: 'block-status:23548192:safe',
      event: 'block-status-changed',
      data: { data: { number: '23548192', hash, finality: 'safe' } },
    },
  ])('accepts the $event event', (event) => {
    expect(schema('LiveEventSchema').safeParse(event).success).toBe(true);
  });

  it('rejects an event with a mismatched payload', () => {
    expect(
      schema('LiveEventSchema').safeParse({
        id: 'block:23548192:bad',
        event: 'block-added',
        data: { data: feeSnapshot },
      }).success,
    ).toBe(false);
  });
});
