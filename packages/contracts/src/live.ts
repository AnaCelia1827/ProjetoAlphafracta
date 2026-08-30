import { z } from 'zod';

import { BlockStatusChangedSchema, BlockSummarySchema } from './blocks.js';
import { FeeSnapshotSchema } from './fees.js';

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

export const LiveEventSchema = z.union([
  FeeSnapshotEventSchema,
  BlockAddedEventSchema,
  BlockStatusChangedEventSchema,
]);

export type LiveEventDto = z.infer<typeof LiveEventSchema>;
