import { EthereumProviderUnavailableError, PersistenceUnavailableError } from '../common/errors.js';
import type { EthereumBlockSource, ObservedBlockRepository } from '../../domain/blocks/ports.js';
import type { RecentBlockWindow } from '../../domain/blocks/recent-block-window.js';
import type { ObserveBlock } from './observe-block.js';

const RECENT_BLOCK_LIMIT = 20;

export interface PrimeRecentBlocksDependencies {
  repository: ObservedBlockRepository;
  window: RecentBlockWindow;
  source: EthereumBlockSource;
  observe: ObserveBlock;
}

export class PrimeRecentBlocks {
  constructor(private readonly dependencies: PrimeRecentBlocksDependencies) {}

  async execute(): Promise<void> {
    if (this.dependencies.repository.isAvailable()) {
      try {
        const persisted = await this.dependencies.repository.findRecent(RECENT_BLOCK_LIMIT);
        for (const block of persisted) this.dependencies.window.upsert(block);
      } catch (error) {
        if (!(error instanceof PersistenceUnavailableError)) throw error;
      }
    }

    if (this.dependencies.window.values().length >= RECENT_BLOCK_LIMIT) return;

    let head: bigint;
    try {
      head = await this.dependencies.source.getLatestBlockNumber();
    } catch (error) {
      if (error instanceof EthereumProviderUnavailableError) return;
      throw error;
    }

    const oldest =
      head >= BigInt(RECENT_BLOCK_LIMIT - 1) ? head - BigInt(RECENT_BLOCK_LIMIT - 1) : 0n;
    for (let number = oldest; number <= head; number += 1n) {
      if (this.dependencies.window.find(number) !== null) continue;
      try {
        await this.dependencies.observe.execute(number, { triggerFeeMonitor: false });
      } catch (error) {
        if (error instanceof EthereumProviderUnavailableError) return;
        throw error;
      }
    }
  }
}
