import type { FeeSnapshot, FeeHistoryPage, FeeHistoryQuery } from '../../src/domain/fees/models.js';
import type { FeeSnapshotRepository } from '../../src/domain/fees/ports.js';

export class FakeFeeSnapshotRepository implements FeeSnapshotRepository {
  readonly inserted: FeeSnapshot[] = [];
  latest: FeeSnapshot | null = null;
  windows: FeeSnapshot[][] = [[], []];
  page: FeeHistoryPage = { data: [], nextCursor: null };
  available = true;
  insertError: Error | null = null;
  historyError: Error | null = null;

  async insert(snapshot: FeeSnapshot): Promise<void> {
    if (this.insertError !== null) throw this.insertError;
    this.inserted.push(snapshot);
    this.latest = snapshot;
  }

  async findLatest(): Promise<FeeSnapshot | null> {
    if (this.historyError !== null) throw this.historyError;
    return this.latest;
  }

  async findWindow(): Promise<FeeSnapshot[]> {
    if (this.historyError !== null) throw this.historyError;
    return this.windows.shift() ?? [];
  }

  async findPage(query: FeeHistoryQuery): Promise<FeeHistoryPage> {
    void query;
    if (this.historyError !== null) throw this.historyError;
    return this.page;
  }

  isAvailable(): boolean {
    return this.available;
  }
}

export class FakeObservedBlockRepository implements ObservedBlockRepository {
  recent: BlockSummary[] = [];
  context: BlockSummary[] = [];
  available = true;
  error: Error | null = null;
  readonly saved: BlockSummary[] = [];
  readonly marked: Array<{ number: bigint; exceptHash: `0x${string}` }> = [];
  readonly finalityChanges: FinalityChange[][] = [];
  readonly contextQueries: Array<{ timestamp: Date; from: Date }> = [];

  async saveCanonical(block: BlockSummary): Promise<void> {
    if (this.error !== null) throw this.error;
    this.saved.push(block);
  }

  async markNoncanonical(
    _network: 'ethereum-mainnet',
    number: bigint,
    exceptHash: `0x${string}`,
  ): Promise<void> {
    if (this.error !== null) throw this.error;
    this.marked.push({ number, exceptHash });
  }

  async findRecent(limit: number): Promise<BlockSummary[]> {
    if (this.error !== null) throw this.error;
    return this.recent.slice(0, limit);
  }

  async findCanonicalBefore(timestamp: Date, from: Date): Promise<BlockSummary[]> {
    if (this.error !== null) throw this.error;
    this.contextQueries.push({ timestamp, from });
    return this.context;
  }

  async updateFinality(changes: FinalityChange[]): Promise<void> {
    if (this.error !== null) throw this.error;
    this.finalityChanges.push(changes);
  }

  isAvailable(): boolean {
    return this.available;
  }
}
import type { BlockSummary, FinalityChange } from '../../src/domain/blocks/models.js';
import type { ObservedBlockRepository } from '../../src/domain/blocks/ports.js';
