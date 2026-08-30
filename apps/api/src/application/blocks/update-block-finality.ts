import { EthereumProviderUnavailableError, PersistenceUnavailableError } from '../common/errors.js';
import type { LiveEventPublisher } from '../common/live-event-publisher.js';
import { resolveBlockFinality } from '../../domain/blocks/block-finality.js';
import type { BlockFinality, FinalityChange } from '../../domain/blocks/models.js';
import type { EthereumBlockSource, ObservedBlockRepository } from '../../domain/blocks/ports.js';
import type { RecentBlockWindow } from '../../domain/blocks/recent-block-window.js';

const FINALITY_RANK: Record<BlockFinality, number> = {
  latest: 0,
  safe: 1,
  finalized: 2,
};

export interface UpdateBlockFinalityDependencies {
  source: EthereumBlockSource;
  repository: ObservedBlockRepository;
  window: RecentBlockWindow;
  publisher: LiveEventPublisher;
}

export class UpdateBlockFinality {
  constructor(private readonly dependencies: UpdateBlockFinalityDependencies) {}

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
