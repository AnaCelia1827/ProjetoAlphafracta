import { z } from 'zod';

import {
  networkSchema,
  nonNegativeFiniteSchema,
  signedPercentageSchema,
  utcDateTimeSchema,
} from './common.js';

const transferCostBase = {
  transactionType: z.literal('native-eth-transfer'),
  gasUnits: z.literal(21000),
  maxCostEth: nonNegativeFiniteSchema,
};

const PricedTransferCostSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('fresh'),
    ...transferCostBase,
    ethUsd: nonNegativeFiniteSchema,
    maxCostUsd: nonNegativeFiniteSchema,
    priceUpdatedAt: utcDateTimeSchema,
  }),
  z.object({
    status: z.literal('stale'),
    ...transferCostBase,
    ethUsd: nonNegativeFiniteSchema,
    maxCostUsd: nonNegativeFiniteSchema,
    priceUpdatedAt: utcDateTimeSchema,
  }),
]);

export const EstimatedTransferCostSchema = z.union([
  PricedTransferCostSchema,
  z.object({
    status: z.literal('unavailable'),
    ...transferCostBase,
  }),
]);

export const FeeTrendSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('available'),
    windowMinutes: z.literal(5),
    percentChange: signedPercentageSchema,
    currentMedianMaxFeeGwei: nonNegativeFiniteSchema,
    previousMedianMaxFeeGwei: nonNegativeFiniteSchema,
  }),
  z.object({
    status: z.literal('insufficient-history'),
    windowMinutes: z.literal(5),
  }),
  z.object({
    status: z.literal('unavailable'),
    windowMinutes: z.literal(5),
    reason: z.literal('history-unavailable'),
  }),
]);

export const FeeConfidenceReasonSchema = z.enum([
  'fresh-data',
  'stable-fees',
  'strong-sample',
  'aging-data',
  'volatile-fees',
  'weak-sample',
  'missing-data',
]);

export const FeeConfidenceSchema = z.object({
  level: z.enum(['high', 'medium', 'low', 'unavailable']),
  reasons: z.array(FeeConfidenceReasonSchema).min(1),
});

export const FeeSnapshotSchema = z
  .object({
    timestamp: utcDateTimeSchema,
    metadata: z.object({ network: networkSchema }),
    recommendationState: z.enum(['current', 'last-known']),
    recommendedMaxFeeGwei: nonNegativeFiniteSchema,
    recommendedPriorityFeeGwei: nonNegativeFiniteSchema,
    baseFeeGwei: nonNegativeFiniteSchema,
    effectiveGasPriceGwei: nonNegativeFiniteSchema,
    estimatedTransferCost: EstimatedTransferCostSchema,
    trend24h: FeeTrendSchema,
    confidence: FeeConfidenceSchema,
    sampleSize: z.number().int().nonnegative(),
    dataAgeMs: z.number().int().nonnegative(),
    sources: z.object({
      mempool: z.literal('alchemy'),
      ethereum: z.literal('alchemy'),
      price: z.literal('coinbase'),
    }),
    sourceUpdatedAt: z.object({
      mempool: utcDateTimeSchema.optional(),
      ethereum: utcDateTimeSchema.optional(),
      price: utcDateTimeSchema.optional(),
    }),
    status: z.object({
      mempool: z.enum(['fresh', 'stale', 'unavailable']),
      ethereum: z.enum(['fresh', 'stale', 'unavailable']),
      price: z.enum(['fresh', 'stale', 'unavailable']),
      persistence: z.enum(['available', 'degraded']),
    }),
  })
  .superRefine((snapshot, context) => {
    if (
      snapshot.recommendationState === 'last-known' &&
      snapshot.confidence.level !== 'unavailable'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['confidence', 'level'],
        message: 'Last-known recommendations require unavailable confidence',
      });
    }
  });

export const FeeCurrentResponseSchema = z.object({
  data: FeeSnapshotSchema,
});

export const FeeHistoryQuerySchema = z
  .object({
    from: utcDateTimeSchema,
    to: utcDateTimeSchema,
    limit: z.coerce.number().int().min(1).max(5000).default(1000),
    cursor: z.string().min(1).optional(),
  })
  .superRefine((query, context) => {
    if (Date.parse(query.from) >= Date.parse(query.to)) {
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'to must be after from',
      });
    }
  });

export const FeeHistoryResponseSchema = z
  .object({
    data: z.array(FeeSnapshotSchema),
    page: z.object({
      nextCursor: z.string().min(1).nullable(),
      hasMore: z.boolean(),
    }),
  })
  .superRefine((response, context) => {
    if (response.page.hasMore !== (response.page.nextCursor !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['page'],
        message: 'hasMore must match nextCursor presence',
      });
    }
  });

export type EstimatedTransferCostDto = z.infer<typeof EstimatedTransferCostSchema>;
export type FeeTrendDto = z.infer<typeof FeeTrendSchema>;
export type FeeConfidenceDto = z.infer<typeof FeeConfidenceSchema>;
export type FeeSnapshotDto = z.infer<typeof FeeSnapshotSchema>;
export type FeeHistoryQueryDto = z.infer<typeof FeeHistoryQuerySchema>;
export type FeeHistoryResponseDto = z.infer<typeof FeeHistoryResponseSchema>;
