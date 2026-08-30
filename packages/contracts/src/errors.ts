import { z } from 'zod';

export const ApiErrorCodeSchema = z.enum([
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
]);

export const ApiErrorDetailSchema = z.object({
  field: z.string().min(1),
  issue: z.string().min(1),
});

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string().min(1),
    details: z.array(ApiErrorDetailSchema).min(1).optional(),
    requestId: z.string().min(1),
  }),
});

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export type ApiErrorDto = z.infer<typeof ApiErrorSchema>;
