import { BlockHistoryQuerySchema, BlockIdentifierSchema } from '@alphractal/contracts';
import { Router } from 'express';

import { InvalidBlockIdentifierError, InvalidQueryError } from '../../application/common/errors.js';
import type {
  BlockHistoryPage,
  BlockHistoryQuery,
  BlockSummary,
} from '../../domain/blocks/models.js';
import { serializeBlockSummary } from './live-serializers.js';

/**
 * Camada: interface HTTP.
 *
 * Oferece janela observada e busca pontual de bloco sem permitir que a camada
 * web altere a memória do monitor. Identificadores são filtrados no contrato
 * antes de alcançar casos de uso ou um provedor Ethereum.
 */
/** Capacidade de ler a janela monitorada de blocos recentes. */
export interface RecentBlocksQuery {
  /** Retorna a janela local ou indisponibilidade enquanto ela estiver vazia. */
  execute(): Promise<BlockSummary[]>;
}

/** Capacidade de resolver uma busca independente por número ou hash. */
export interface BlockByIdentifierQuery {
  /** Retorna um bloco analisado sem publicá-lo no stream ao vivo. */
  execute(identifier: string): Promise<BlockSummary>;
}

/** Capacidade de consultar uma página estável do catálogo canônico de blocos. */
export interface BlockHistoryQueryUseCase {
  /** Retorna blocos e cursor opaco depois da validação da query na borda HTTP. */
  execute(query: BlockHistoryQuery): Promise<BlockHistoryPage>;
}

/** Valida a paginação compartilhada e remove parâmetros desconhecidos do domínio. */
function parseBlockHistoryQuery(query: Record<string, unknown>): BlockHistoryQuery {
  const result = BlockHistoryQuerySchema.safeParse(query);
  if (!result.success) {
    throw new InvalidQueryError(
      result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'query',
        issue: issue.message,
      })),
    );
  }
  return {
    limit: result.data.limit,
    ...(result.data.cursor === undefined ? {} : { cursor: result.data.cursor }),
  };
}

/** Cria endpoints de janela recente e de busca pontual com DTOs consistentes. */
export function createBlockRouter(dependencies: {
  getRecentBlocks: RecentBlocksQuery;
  getBlockHistory: BlockHistoryQueryUseCase;
  getBlockByIdentifier: BlockByIdentifierQuery;
}): Router {
  const router = Router();
  router.get('/recent', async (_request, response) => {
    const blocks = await dependencies.getRecentBlocks.execute();
    response.status(200).json({ data: blocks.map(serializeBlockSummary) });
  });
  router.get('/history', async (request, response) => {
    const page = await dependencies.getBlockHistory.execute(
      parseBlockHistoryQuery(request.query as Record<string, unknown>),
    );
    response.status(200).json({
      data: page.data.map(serializeBlockSummary),
      page: {
        nextCursor: page.nextCursor,
        hasMore: page.nextCursor !== null,
      },
    });
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
