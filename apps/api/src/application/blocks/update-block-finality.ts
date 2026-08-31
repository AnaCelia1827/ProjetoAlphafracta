import { EthereumProviderUnavailableError, PersistenceUnavailableError } from '../common/errors.js';
import type { LiveEventPublisher } from '../common/live-event-publisher.js';
import { resolveBlockFinality } from '../../domain/blocks/block-finality.js';
import type { BlockFinality, FinalityChange } from '../../domain/blocks/models.js';
import type { EthereumBlockSource, ObservedBlockRepository } from '../../domain/blocks/ports.js';
import type { RecentBlockWindow } from '../../domain/blocks/recent-block-window.js';

/**
 * Camada: aplicação de blocos.
 *
 * Promove finality de blocos já observados com base nas cabeças da rede. Nunca
 * rebaixa um status: isso preserva o contrato monotônico mesmo diante de atrasos.
 */
/** Ordem usada para impedir que uma atualização reduza finality já publicada. */
const FINALITY_RANK: Record<BlockFinality, number> = {
  latest: 0,
  safe: 1,
  finalized: 2,
};

/** Colaboradores para consultar cabeças, persistir promoções e avisar assinantes. */
export interface UpdateBlockFinalityDependencies {
  source: EthereumBlockSource;
  repository: ObservedBlockRepository;
  window: RecentBlockWindow;
  publisher: LiveEventPublisher;
}

/** Caso de uso que aplica em lote apenas promoções de finality à janela atual. */
export class UpdateBlockFinality {
  /** Recebe dependências que mantêm estado e divulgam mudanças observadas. */
  constructor(private readonly dependencies: UpdateBlockFinalityDependencies) {}

  /**
   * Consulta cabeças, calcula promoções e persiste quando possível. Falha do
   * provedor conhecida gera lista vazia para que o monitor se recupere depois.
   */
  async execute(): Promise<FinalityChange[]> {
    let heads;
    try {
      heads = await this.dependencies.source.getFinalityHeads();
    } catch (error) {
      if (error instanceof EthereumProviderUnavailableError) return [];
      throw error;
    }

    const changes: FinalityChange[] = [];
    for (const block of this.dependencies.window.values()) {
      const finality = resolveBlockFinality(block, heads);
      if (FINALITY_RANK[finality] <= FINALITY_RANK[block.finality]) continue;
      const change = { number: block.number, hash: block.hash, finality };
      changes.push(change);
      this.dependencies.window.upsert({ ...block, finality });
    }

    if (changes.length === 0) return changes;
    if (this.dependencies.repository.isAvailable()) {
      try {
        await this.dependencies.repository.updateFinality(changes);
      } catch (error) {
        if (!(error instanceof PersistenceUnavailableError)) throw error;
      }
    }
    for (const change of changes) {
      this.dependencies.publisher.publish({ type: 'block-status-changed', change });
    }
    return changes;
  }
}
