import { z } from 'zod';

import {
  blockHashSchema,
  decimalIntegerStringSchema,
  nonNegativeFiniteSchema,
  percentageSchema,
  utcDateTimeSchema,
} from './common.js';

/**
 * Camada: contrato público.
 *
 * Define os dados de bloco que chegam ao dashboard. A validação conserva a
 * identidade número+hash necessária para distinguir atualizações de finality
 * de uma substituição causada por reorg.
 */
/** Aceita a busca de bloco por altura decimal canônica ou por hash completo. */
export const BlockIdentifierSchema = z.union([decimalIntegerStringSchema, blockHashSchema]);

/** Restringe finality aos marcos monotônicos disponíveis no provedor. */
export const BlockFinalitySchema = z.enum(['latest', 'safe', 'finalized']);

/** Valida o resumo suficiente para renderizar uma linha do monitor de blocos. */
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

/** Transporta apenas a identidade e a nova finality em atualizações SSE leves. */
export const BlockStatusChangedSchema = z.object({
  number: decimalIntegerStringSchema,
  hash: blockHashSchema,
  finality: BlockFinalitySchema,
});

/** Envelopa a janela curta, limitada a vinte blocos para leitura local. */
export const RecentBlocksResponseSchema = z.object({
  data: z.array(BlockSummarySchema).max(20),
});

export const BlockHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  cursor: z.string().min(1).optional(),
});

export const BlockHistoryResponseSchema = z
  .object({
    data: z.array(BlockSummarySchema).max(50),
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

/** Envelopa a consulta pontual de um bloco sem alterar a janela observada. */
export const BlockResponseSchema = z.object({
  data: BlockSummarySchema,
});

/** Tipo do identificador recebido em uma busca de bloco. */
export type BlockIdentifierDto = z.infer<typeof BlockIdentifierSchema>;
/** Tipo do marco de finality publicado ao cliente. */
export type BlockFinalityDto = z.infer<typeof BlockFinalitySchema>;
/** Tipo do resumo serializado de bloco. */
export type BlockSummaryDto = z.infer<typeof BlockSummarySchema>;
/** Tipo da atualização enxuta de status de um bloco. */
export type BlockStatusChangedDto = z.infer<typeof BlockStatusChangedSchema>;
export type BlockHistoryQueryDto = z.infer<typeof BlockHistoryQuerySchema>;
export type BlockHistoryResponseDto = z.infer<typeof BlockHistoryResponseSchema>;
