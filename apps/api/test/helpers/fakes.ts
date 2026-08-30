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
