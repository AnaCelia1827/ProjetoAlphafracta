import { FeeHistoryQuerySchema } from '@alphractal/contracts';
import { Router } from 'express';

import { InvalidQueryError, InvalidTimeRangeError } from '../../application/common/errors.js';
import type { FeeSnapshot, FeeHistoryPage, FeeHistoryQuery } from '../../domain/fees/models.js';
import { serializeFeeSnapshot } from './live-serializers.js';

/**
 * Camada: interface HTTP.
 *
 * Conecta endpoints de taxas aos casos de uso e valida consulta no contrato
 * compartilhado. A rota apenas converte dados de requisição e serializa saída;
 * decisões de cache, cálculo e persistência pertencem à aplicação.
 */
/** Capacidade necessária para servir o snapshot atual. */
export interface CurrentFeeSnapshotQuery {
  /** Busca snapshot atual ou lança indisponibilidade já descrita pela aplicação. */
  execute(): Promise<FeeSnapshot>;
}

/** Capacidade necessária para consultar página normalizada de histórico. */
export interface FeeHistoryQueryUseCase {
  /** Busca página temporal após a rota validar e converter os parâmetros. */
  execute(query: FeeHistoryQuery): Promise<FeeHistoryPage>;
}

/**
 * Valida query com schema público e converte datas para domínio. Intervalo
 * invertido recebe erro específico para uma mensagem mais útil ao consumidor.
 */
function parseHistoryQuery(query: Record<string, unknown>): FeeHistoryQuery {
  const result = FeeHistoryQuerySchema.safeParse(query);
  if (!result.success) {
    if (
      typeof query.from === 'string' &&
      typeof query.to === 'string' &&
      Number.isFinite(Date.parse(query.from)) &&
      Number.isFinite(Date.parse(query.to)) &&
      Date.parse(query.from) >= Date.parse(query.to)
    ) {
      throw new InvalidTimeRangeError();
    }
    throw new InvalidQueryError(
      result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'query',
        issue: issue.message,
      })),
    );
  }
  return {
    from: new Date(result.data.from),
    to: new Date(result.data.to),
    limit: result.data.limit,
    ...(result.data.cursor === undefined ? {} : { cursor: result.data.cursor }),
  };
}

/** Cria endpoints current e history com envelopes compatíveis com os contratos Zod. */
export function createFeeRouter(dependencies: {
  getCurrentFeeSnapshot: CurrentFeeSnapshotQuery;
  getFeeHistory: FeeHistoryQueryUseCase;
}): Router {
  const router = Router();
  router.get('/current', async (_request, response) => {
    const snapshot = await dependencies.getCurrentFeeSnapshot.execute();
    response.status(200).json({ data: serializeFeeSnapshot(snapshot) });
  });
  router.get('/history', async (request, response) => {
    const page = await dependencies.getFeeHistory.execute(
      parseHistoryQuery(request.query as Record<string, unknown>),
    );
    response.status(200).json({
      data: page.data.map(serializeFeeSnapshot),
      page: { nextCursor: page.nextCursor, hasMore: page.nextCursor !== null },
    });
  });
  return router;
}
