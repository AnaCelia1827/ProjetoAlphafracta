import { z } from 'zod';

import {
  blockHashSchema,
  decimalIntegerStringSchema,
  nonNegativeFiniteSchema,
  percentageSchema,
  utcDateTimeSchema,
} from './common.js';

export const BlockIdentifierSchema = z.union([decimalIntegerStringSchema, blockHashSchema]);

export const BlockFinalitySchema = z.enum(['latest', 'safe', 'finalized']);

export const BlockSummarySchema = z.object({
  number: decimalIntegerStringSchema,
  hash: blockHashSchema,
  timestamp: utcDateTimeSchema,
  finality: BlockFinalitySchema,
  feeLevel: z.enum(['low', 'normal', 'elevated', 'high', 'unavailable']),
  baseFeeGwei: nonNegativeFiniteSchema,
  medianPriorityFeeGwei: nonNegativeFiniteSchema,
  effectiveGasPriceGwei: nonNegativeFiniteSchema,
  gasUsed: decimalIntegerStringSchema,
  gasLimit: decimalIntegerStringSchema,
  utilizationPercent: percentageSchema,
  transactionCount: z.number().int().nonnegative(),
  provider: z.literal('alchemy'),
  etherscanUrl: z
    .string()
    .url()
    .regex(/^https:\/\/etherscan\.io\/block\/(0|[1-9]\d*)$/),
});

export const BlockStatusChangedSchema = z.object({
  number: decimalIntegerStringSchema,
  hash: blockHashSchema,
  finality: BlockFinalitySchema,
});

export const RecentBlocksResponseSchema = z.object({
  data: z.array(BlockSummarySchema).max(20),
});

export const BlockResponseSchema = z.object({
  data: BlockSummarySchema,
});

export type BlockIdentifierDto = z.infer<typeof BlockIdentifierSchema>;
export type BlockFinalityDto = z.infer<typeof BlockFinalitySchema>;
export type BlockSummaryDto = z.infer<typeof BlockSummarySchema>;
export type BlockStatusChangedDto = z.infer<typeof BlockStatusChangedSchema>;
