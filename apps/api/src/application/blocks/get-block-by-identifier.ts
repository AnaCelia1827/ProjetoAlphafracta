import {
  BlockNotFoundError,
  InvalidBlockIdentifierError,
  PersistenceUnavailableError,
  PreEip1559BlockUnsupportedError,
} from '../common/errors.js';
import {
  analyzeBlock,
  UnsupportedPreEip1559BlockError,
} from '../../domain/blocks/block-analyzer.js';
import { classifyBlockFeeLevel } from '../../domain/blocks/block-fee-level.js';
import { resolveBlockFinality } from '../../domain/blocks/block-finality.js';
import type { BlockIdentifier, BlockSummary } from '../../domain/blocks/models.js';
import type { EthereumBlockSource, ObservedBlockRepository } from '../../domain/blocks/ports.js';

const FIRST_EIP1559_BLOCK = 12_965_000n;
const CONTEXT_WINDOW_MS = 60 * 60 * 1_000;

export function parseBlockIdentifier(value: string): BlockIdentifier {
  if (/^(0|[1-9]\d*)$/.test(value)) {
    const number = BigInt(value);
    if (number < FIRST_EIP1559_BLOCK) throw new PreEip1559BlockUnsupportedError();
    return number;
  }
  if (/^0x[a-fA-F0-9]{64}$/.test(value)) return value as `0x${string}`;
  throw new InvalidBlockIdentifierError();
}

export interface GetBlockByIdentifierDependencies {
  repository: ObservedBlockRepository;
  source: EthereumBlockSource;
}

export class GetBlockByIdentifier {
  constructor(private readonly dependencies: GetBlockByIdentifierDependencies) {}

  async execute(value: string): Promise<BlockSummary> {
    const identifier = parseBlockIdentifier(value);
    const block = await this.dependencies.source.getBlock(identifier);
    if (block === null) throw new BlockNotFoundError();
    if (block.number < FIRST_EIP1559_BLOCK) throw new PreEip1559BlockUnsupportedError();

    try {
      const [context, heads] = await Promise.all([
        this.comparisonBlocks(block.timestamp),
        this.dependencies.source.getFinalityHeads(),
      ]);
      const provisional = analyzeBlock(block, { finality: 'latest', feeLevel: 'unavailable' });
      return analyzeBlock(block, {
        finality: resolveBlockFinality(block, heads),
        feeLevel: classifyBlockFeeLevel(provisional.effectiveGasPriceWei, context),
      });
    } catch (error) {
      if (error instanceof UnsupportedPreEip1559BlockError) {
        throw new PreEip1559BlockUnsupportedError();
      }
      throw error;
    }
  }

  private async comparisonBlocks(timestamp: Date): Promise<BlockSummary[]> {
    if (!this.dependencies.repository.isAvailable()) return [];
    try {
      return await this.dependencies.repository.findCanonicalBefore(
        timestamp,
        new Date(timestamp.getTime() - CONTEXT_WINDOW_MS),
      );
    } catch (error) {
      if (error instanceof PersistenceUnavailableError) return [];
      throw error;
    }
  }
}
