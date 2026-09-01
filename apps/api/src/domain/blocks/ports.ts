import type {
  BlockHistoryPage,
  BlockHistoryQuery,
  BlockIdentifier,
  BlockSummary,
  FinalityChange,
  FinalityHeads,
  NormalizedBlock,
  BlockHash,
} from './models.js';

/**
 * Camada: domínio de blocos.
 *
 * Delimita leitura Ethereum e memória de observações para que análise, reorg e
 * finality permaneçam regras puras e substituíveis nos testes.
 */
/** Fonte de blocos e cabeças de finality independentemente do cliente RPC usado. */
export interface EthereumBlockSource {
  getBlock(identifier: BlockIdentifier): Promise<NormalizedBlock | null>;
  getLatestBlockNumber(): Promise<bigint>;
  getFinalityHeads(): Promise<FinalityHeads>;
}

/** Memória persistente de blocos canônicos, histórico e promoções de finality. */
export interface ObservedBlockRepository {
  saveCanonical(block: BlockSummary): Promise<void>;
  markNoncanonical(
    network: 'ethereum-mainnet',
    number: bigint,
    exceptHash: BlockHash,
  ): Promise<void>;
  findRecent(limit: number): Promise<BlockSummary[]>;
  findPage(query: BlockHistoryQuery): Promise<BlockHistoryPage>;
  findCanonicalBefore(timestamp: Date, from: Date): Promise<BlockSummary[]>;
  updateFinality(changes: FinalityChange[]): Promise<void>;
  isAvailable(): boolean;
}
