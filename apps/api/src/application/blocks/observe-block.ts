import { BlockNotFoundError, PersistenceUnavailableError } from '../common/errors.js';
import type { LiveEventPublisher } from '../common/live-event-publisher.js';
import { analyzeBlock } from '../../domain/blocks/block-analyzer.js';
import { classifyBlockFeeLevel } from '../../domain/blocks/block-fee-level.js';
import type { BlockIdentifier, BlockSummary } from '../../domain/blocks/models.js';
import type { EthereumBlockSource, ObservedBlockRepository } from '../../domain/blocks/ports.js';
import type { RecentBlockWindow } from '../../domain/blocks/recent-block-window.js';

/**
 * Camada: aplicação de blocos.
 *
 * Busca, analisa, classifica e publica um bloco observado. Reorg é detectado na
 * janela pela mesma altura com hash novo; persistência falha de modo degradado,
 * mas inconsistência do provedor ainda é propagada.
 */
/** Duração da referência histórica usada para classificar preço do bloco. */
const CONTEXT_WINDOW_MS = 60 * 60 * 1_000;

/** Capacidade de disparar atualização de taxas após chegada de novo bloco. */
export interface FeeMonitorTrigger {
  /** Solicita atualização coalescente do monitor de taxas. */
  trigger(): Promise<void>;
}

/** Colaboradores externos necessários para observar e publicar um bloco. */
export interface ObserveBlockDependencies {
  repository: ObservedBlockRepository;
  window: RecentBlockWindow;
  source: EthereumBlockSource;
  publisher: LiveEventPublisher;
  feeMonitor: FeeMonitorTrigger;
}

/** Caso de uso que incorpora um bloco na janela sem acoplar análise a RPC. */
export class ObserveBlock {
  /** Recebe fonte, memória, persistência, SSE e o gatilho de taxa. */
  constructor(private readonly dependencies: ObserveBlockDependencies) {}

  /**
   * Observa a identidade solicitada, persiste canonicidade quando possível e
   * notifica SSE. Busca pontual pode desligar o gatilho para não gerar cascata.
   */
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

  /**
   * Prefere o histórico canônico persistido; em degradação usa a janela local
   * anterior ao bloco para preservar uma classificação honesta, ainda que menor.
   */
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
