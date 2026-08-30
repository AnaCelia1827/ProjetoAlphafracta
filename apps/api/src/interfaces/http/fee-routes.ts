import { FeeHistoryQuerySchema } from '@alphractal/contracts';
import { Router } from 'express';

import { InvalidQueryError, InvalidTimeRangeError } from '../../application/common/errors.js';
import type { FeeSnapshot, FeeHistoryPage, FeeHistoryQuery } from '../../domain/fees/models.js';
import { serializeFeeSnapshot } from './live-serializers.js';

export interface CurrentFeeSnapshotQuery {
  execute(): Promise<FeeSnapshot>;
}

export interface FeeHistoryQueryUseCase {
  execute(query: FeeHistoryQuery): Promise<FeeHistoryPage>;
}

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
