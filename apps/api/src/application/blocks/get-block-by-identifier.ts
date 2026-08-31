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

/**
 * Camada: aplicação de blocos.
 *
 * Resolve pesquisa por número ou hash diretamente no provedor, calcula a
 * apresentação do resultado sem inseri-lo na janela e prepara a abertura no
 * explorador sem misturar esse fluxo com monitoramento contínuo.
 */
/** Primeiro bloco com base fee EIP-1559, limite do escopo de análise de taxa. */
const FIRST_EIP1559_BLOCK = 12_965_000n;
/** Duração do histórico canônico usado para classificação de uma busca pontual. */
const CONTEXT_WINDOW_MS = 60 * 60 * 1_000;

/**
 * Normaliza número decimal ou hash e rejeita blocos pré-EIP-1559 antes do RPC.
 */
export function parseBlockIdentifier(value: string): BlockIdentifier {
  if (/^(0|[1-9]\d*)$/.test(value)) {
    const number = BigInt(value);
    if (number < FIRST_EIP1559_BLOCK) throw new PreEip1559BlockUnsupportedError();
    return number;
  }
  if (/^0x[a-fA-F0-9]{64}$/.test(value)) return value as `0x${string}`;
  throw new InvalidBlockIdentifierError();
}

/** Fonte de dados e histórico opcional necessários para a consulta independente. */
export interface GetBlockByIdentifierDependencies {
  repository: ObservedBlockRepository;
  source: EthereumBlockSource;
}

/** Caso de uso de busca que não publica SSE nem altera a janela de recentes. */
export class GetBlockByIdentifier {
  /** Recebe dependências mínimas para buscar, classificar e resolver finality. */
  constructor(private readonly dependencies: GetBlockByIdentifierDependencies) {}

  /** Busca e resume o bloco solicitado, convertendo limitação pré-EIP-1559 em erro público. */
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

  /** Recupera referência canônica quando o banco está disponível; sem ela classifica unavailable. */
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
