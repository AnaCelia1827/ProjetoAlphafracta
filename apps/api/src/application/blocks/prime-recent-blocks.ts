import { EthereumProviderUnavailableError, PersistenceUnavailableError } from '../common/errors.js';
import type { EthereumBlockSource, ObservedBlockRepository } from '../../domain/blocks/ports.js';
import type { RecentBlockWindow } from '../../domain/blocks/recent-block-window.js';
import type { ObserveBlock } from './observe-block.js';

/**
 * Camada: aplicação de blocos.
 *
 * Preenche a janela de vinte blocos no boot a partir do banco e, se necessário,
 * busca lacunas no provedor. Falha Ethereum temporária deixa a aplicação viva
 * para que o stream posterior possa recuperar o estado.
 */
/** Tamanho de janela prometido pela API de blocos recentes. */
const RECENT_BLOCK_LIMIT = 20;

/** Dependências do backfill inicial de blocos. */
export interface PrimeRecentBlocksDependencies {
  repository: ObservedBlockRepository;
  window: RecentBlockWindow;
  source: EthereumBlockSource;
  observe: ObserveBlock;
}

/** Caso de uso de bootstrap que evita reprocessar blocos já recuperados do banco. */
export class PrimeRecentBlocks {
  /** Recebe repositório, janela, fonte e observador que centraliza a análise. */
  constructor(private readonly dependencies: PrimeRecentBlocksDependencies) {}

  /**
   * Reidrata e completa a janela. Retorna silenciosamente para indisponibilidade
   * conhecida do provedor, pois a ausência inicial não deve encerrar o servidor.
   */
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
