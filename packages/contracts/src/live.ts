import { z } from 'zod';

import { BlockStatusChangedSchema, BlockSummarySchema } from './blocks.js';
import { FeeSnapshotSchema } from './fees.js';

/**
 * Camada: contrato público.
 *
 * Descreve os eventos SSE autorizados. Cada refinamento recalcula o ID
 * determinístico para que reconexões e deduplicação sejam confiáveis.
 */
/** Evento de uma nova recomendação, identificado pelo instante do snapshot. */
const FeeSnapshotEventSchema = z
  .object({
    id: z.string().min(1),
    event: z.literal('fee-snapshot'),
    data: z.object({ data: FeeSnapshotSchema }),
  })
  .superRefine((event, context) => {
    if (event.id !== `fee:${event.data.data.timestamp}`) {
      context.addIssue({ code: 'custom', path: ['id'], message: 'Invalid fee event id' });
    }
  });

/** Evento de chegada de bloco, identificado por número e hash canônicos. */
const BlockAddedEventSchema = z
  .object({
    id: z.string().min(1),
    event: z.literal('block-added'),
    data: z.object({ data: BlockSummarySchema }),
  })
  .superRefine((event, context) => {
    const block = event.data.data;
    if (event.id !== `block:${block.number}:${block.hash}`) {
      context.addIssue({ code: 'custom', path: ['id'], message: 'Invalid block event id' });
    }
  });

/** Evento de promoção de finality, distinto da chegada ou troca de bloco. */
const BlockStatusChangedEventSchema = z
  .object({
    id: z.string().min(1),
    event: z.literal('block-status-changed'),
    data: z.object({ data: BlockStatusChangedSchema }),
  })
  .superRefine((event, context) => {
    const change = event.data.data;
    if (event.id !== `block-status:${change.number}:${change.finality}`) {
      context.addIssue({ code: 'custom', path: ['id'], message: 'Invalid block status event id' });
    }
  });

/** União dos eventos que o cliente SSE precisa tratar de forma discriminada. */
export const LiveEventSchema = z.union([
  FeeSnapshotEventSchema,
  BlockAddedEventSchema,
  BlockStatusChangedEventSchema,
]);

/** Tipo serializado de qualquer evento transmitido no stream ao vivo. */
export type LiveEventDto = z.infer<typeof LiveEventSchema>;
