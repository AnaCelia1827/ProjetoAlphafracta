import { BlockNotFoundError, PersistenceUnavailableError } from '../common/errors.js';
import type { LiveEventPublisher } from '../common/live-event-publisher.js';
import { analyzeBlock } from '../../domain/blocks/block-analyzer.js';
import { classifyBlockFeeLevel } from '../../domain/blocks/block-fee-level.js';
import type { BlockIdentifier, BlockSummary } from '../../domain/blocks/models.js';
import type { EthereumBlockSource, ObservedBlockRepository } from '../../domain/blocks/ports.js';
import type { RecentBlockWindow } from '../../domain/blocks/recent-block-window.js';

const CONTEXT_WINDOW_MS = 60 * 60 * 1_000;

export interface FeeMonitorTrigger {
  trigger(): Promise<void>;
}

export interface ObserveBlockDependencies {
  repository: ObservedBlockRepository;
  window: RecentBlockWindow;
  source: EthereumBlockSource;
  publisher: LiveEventPublisher;
  feeMonitor: FeeMonitorTrigger;
}

export class ObserveBlock {
  constructor(private readonly dependencies: ObserveBlockDependencies) {}

  async execute(
    identifier: BlockIdentifier,
    options: { triggerFeeMonitor?: boolean } = {},
  ): Promise<BlockSummary> {
    const block = await this.dependencies.source.getBlock(identifier);
    if (block === null) throw new BlockNotFoundError();

    const provisional = analyzeBlock(block, { finality: 'latest', feeLevel: 'unavailable' });
    const comparisonBlocks = await this.comparisonBlocks(block.timestamp);
    const summary = analyzeBlock(block, {
      finality: 'latest',
      feeLevel: classifyBlockFeeLevel(provisional.effectiveGasPriceWei, comparisonBlocks),
    });
    const { replaced } = this.dependencies.window.upsert(summary);

    if (this.dependencies.repository.isAvailable()) {
      try {
        if (replaced !== null) {
          await this.dependencies.repository.markNoncanonical(
            'ethereum-mainnet',
            summary.number,
            summary.hash,
          );
        }
        await this.dependencies.repository.saveCanonical(summary);
      } catch (error) {
        if (!(error instanceof PersistenceUnavailableError)) throw error;
      }
    }

    this.dependencies.publisher.publish({ type: 'block-added', block: summary });
    if (options.triggerFeeMonitor !== false) await this.dependencies.feeMonitor.trigger();
    return summary;
  }

  private async comparisonBlocks(timestamp: Date): Promise<BlockSummary[]> {
    const from = new Date(timestamp.getTime() - CONTEXT_WINDOW_MS);
    if (this.dependencies.repository.isAvailable()) {
      try {
        return await this.dependencies.repository.findCanonicalBefore(timestamp, from);
      } catch (error) {
        if (!(error instanceof PersistenceUnavailableError)) throw error;
      }
    }

    return this.dependencies.window
      .values()
      .filter((block) => block.timestamp >= from && block.timestamp < timestamp);
  }
}
