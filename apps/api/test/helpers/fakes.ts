/**
 * Fakes de teste: implementam portas de persistência em memória e expõem
 * observações de chamada para validar orquestração sem iniciar MongoDB.
 */
import type { FeeSnapshot, FeeHistoryPage, FeeHistoryQuery } from '../../src/domain/fees/models.js';
import type { FeeSnapshotRepository } from '../../src/domain/fees/ports.js';

/** Repositório de taxas controlável que simula escrita, leitura e falhas distintas. */
export class FakeFeeSnapshotRepository implements FeeSnapshotRepository {
  readonly inserted: FeeSnapshot[] = [];
  latest: FeeSnapshot | null = null;
  windows: FeeSnapshot[][] = [[], []];
  page: FeeHistoryPage = { data: [], nextCursor: null };
  available = true;
  insertError: Error | null = null;
  historyError: Error | null = null;

  /** Registra snapshot ou reproduz erro de escrita configurado pelo cenário. */
  async insert(snapshot: FeeSnapshot): Promise<void> {
    if (this.insertError !== null) throw this.insertError;
    this.inserted.push(snapshot);
    this.latest = snapshot;
  }

  /** Devolve último snapshot controlado ou reproduz falha de histórico. */
  async findLatest(): Promise<FeeSnapshot | null> {
    if (this.historyError !== null) throw this.historyError;
    return this.latest;
  }

  /** Consome a próxima janela preparada para testar comparação temporal. */
  async findWindow(): Promise<FeeSnapshot[]> {
    if (this.historyError !== null) throw this.historyError;
    return this.windows.shift() ?? [];
  }

  /** Retorna página pronta; query é ignorada porque a validação é responsabilidade da rota. */
  async findPage(query: FeeHistoryQuery): Promise<FeeHistoryPage> {
    void query;
    if (this.historyError !== null) throw this.historyError;
    return this.page;
  }

  /** Expõe disponibilidade manipulável pelo teste para selecionar fallback. */
  isAvailable(): boolean {
    return this.available;
  }
}

/** Repositório de blocos controlável que captura persistência, reorg e finality. */
export class FakeObservedBlockRepository implements ObservedBlockRepository {
  recent: BlockSummary[] = [];
  context: BlockSummary[] = [];
  available = true;
  error: Error | null = null;
  readonly saved: BlockSummary[] = [];
  readonly marked: Array<{ number: bigint; exceptHash: `0x${string}` }> = [];
  readonly finalityChanges: FinalityChange[][] = [];
  readonly contextQueries: Array<{ timestamp: Date; from: Date }> = [];

  /** Registra bloco canônico salvo ou reproduz falha de persistência. */
  async saveCanonical(block: BlockSummary): Promise<void> {
    if (this.error !== null) throw this.error;
    this.saved.push(block);
  }

  /** Registra a versão substituída que um reorg deve tornar não canônica. */
  async markNoncanonical(
    _network: 'ethereum-mainnet',
    number: bigint,
    exceptHash: `0x${string}`,
  ): Promise<void> {
    if (this.error !== null) throw this.error;
    this.marked.push({ number, exceptHash });
  }

  /** Entrega quantidade limitada da janela restaurada preparada pelo cenário. */
  async findRecent(limit: number): Promise<BlockSummary[]> {
    if (this.error !== null) throw this.error;
    return this.recent.slice(0, limit);
  }

  /** Registra intervalo consultado e devolve o contexto histórico configurado. */
  async findCanonicalBefore(timestamp: Date, from: Date): Promise<BlockSummary[]> {
    if (this.error !== null) throw this.error;
    this.contextQueries.push({ timestamp, from });
    return this.context;
  }

  /** Captura lote de promoções de finality para asserções de monotonicidade. */
  async updateFinality(changes: FinalityChange[]): Promise<void> {
    if (this.error !== null) throw this.error;
    this.finalityChanges.push(changes);
  }

  /** Expõe disponibilidade manipulável para testar continuidade sem MongoDB. */
  isAvailable(): boolean {
    return this.available;
  }
}
import type { BlockSummary, FinalityChange } from '../../src/domain/blocks/models.js';
import type { ObservedBlockRepository } from '../../src/domain/blocks/ports.js';
