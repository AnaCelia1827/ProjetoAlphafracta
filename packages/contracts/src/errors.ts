import { z } from 'zod';

/**
 * Camada: contrato público.
 *
 * Define o envelope uniforme de falhas HTTP. Rotas e middlewares o usam para
 * expor mensagens seguras e correlacionáveis sem vazar detalhes internos.
 */
/** Enumera códigos estáveis que o cliente pode tratar sem analisar mensagens. */
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

/** Descreve o campo e a regra que causaram uma falha de validação recuperável. */
export const ApiErrorDetailSchema = z.object({
  field: z.string().min(1),
  issue: z.string().min(1),
});

/** Valida a resposta de erro com request ID para rastreio entre cliente e servidor. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string().min(1),
    details: z.array(ApiErrorDetailSchema).min(1).optional(),
    requestId: z.string().min(1),
  }),
});

/** Tipo inferido para os códigos que integram o contrato de erro. */
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
/** Tipo inferido para o envelope serializado de uma resposta de erro. */
export type ApiErrorDto = z.infer<typeof ApiErrorSchema>;
