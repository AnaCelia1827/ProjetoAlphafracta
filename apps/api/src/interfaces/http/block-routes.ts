import { BlockIdentifierSchema } from '@alphractal/contracts';
import { Router } from 'express';

import { InvalidBlockIdentifierError } from '../../application/common/errors.js';
import type { BlockSummary } from '../../domain/blocks/models.js';
import { serializeBlockSummary } from './live-serializers.js';

export interface RecentBlocksQuery {
  execute(): Promise<BlockSummary[]>;
}

export interface BlockByIdentifierQuery {
  execute(identifier: string): Promise<BlockSummary>;
}

export function createBlockRouter(dependencies: {
  getRecentBlocks: RecentBlocksQuery;
  getBlockByIdentifier: BlockByIdentifierQuery;
}): Router {
  const router = Router();
  router.get('/recent', async (_request, response) => {
    const blocks = await dependencies.getRecentBlocks.execute();
    response.status(200).json({ data: blocks.map(serializeBlockSummary) });
  });
  router.get('/:numberOrHash', async (request, response) => {
    const identifier = request.params.numberOrHash;
    if (identifier === undefined || !BlockIdentifierSchema.safeParse(identifier).success) {
      throw new InvalidBlockIdentifierError();
    }
    const block = await dependencies.getBlockByIdentifier.execute(identifier);
    response.status(200).json({ data: serializeBlockSummary(block) });
  });
  return router;
}
