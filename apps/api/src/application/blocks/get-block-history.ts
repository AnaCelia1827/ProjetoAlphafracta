import {
  BlocksUnavailableError,
  PersistenceUnavailableError,
} from '../common/errors.js';
import type {
  BlockHistoryPage,
  BlockHistoryQuery,
} from '../../domain/blocks/models.js';
import type { ObservedBlockRepository } from '../../domain/blocks/ports.js';

/** Caso de uso que entrega uma página estável do histórico canônico de blocos. */
export class GetBlockHistory {
  /** Recebe somente a capacidade necessária para consultar a página. */
  constructor(private readonly repository: Pick<ObservedBlockRepository, 'findPage'>) {}

  /** Mantém o cursor do repositório e traduz indisponibilidade de persistência. */
  async execute(query: BlockHistoryQuery): Promise<BlockHistoryPage> {
    try {
      return await this.repository.findPage(query);
    } catch (error) {
      if (error instanceof PersistenceUnavailableError) {
        throw new BlocksUnavailableError();
      }
      throw error;
    }
  }
}
