import type {
  FeeEvidence,
  FeeHistoryPage,
  FeeHistoryQuery,
  FeeSnapshot,
  PendingBid,
  PriceQuote,
} from './models.js';

/**
 * Camada: domínio de taxas.
 *
 * Declara dependências por capacidade, mantendo regras de taxa testáveis com
 * fakes e sem conhecimento de Alchemy, Coinbase ou MongoDB.
 */
/** Fonte de lances pendentes e do instante em que sua amostra foi atualizada. */
export interface MempoolSource {
  getPendingBids(since: Date): PendingBid[];
  updatedAt(): Date | null;
}

/** Fonte assíncrona da evidência Ethereum necessária ao cálculo de taxa. */
export interface EthereumFeeSource {
  getFeeEvidence(): Promise<FeeEvidence>;
}

/** Fonte opcional da última cotação, que pode estar ausente sem invalidar taxa. */
export interface PriceSource {
  latestQuote(): PriceQuote | null;
}

/** Repositório de snapshots com leitura paginada e sinal explícito de disponibilidade. */
export interface FeeSnapshotRepository {
  insert(snapshot: FeeSnapshot): Promise<void>;
  findLatest(): Promise<FeeSnapshot | null>;
  findWindow(from: Date, to: Date): Promise<FeeSnapshot[]>;
  findPage(query: FeeHistoryQuery): Promise<FeeHistoryPage>;
  isAvailable(): boolean;
}
