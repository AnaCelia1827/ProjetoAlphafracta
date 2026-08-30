import { SnapshotUnavailableError } from '../common/errors.js';
import { FeeHistoryUnavailableError } from '../../domain/fees/fee-trend.js';
import type { FeeSnapshot } from '../../domain/fees/models.js';
import type { FeeSnapshotRepository } from '../../domain/fees/ports.js';
import type { FeeSnapshotCache } from './calculate-fee-snapshot.js';

export class GetCurrentFeeSnapshot {
  constructor(
    private readonly cache: FeeSnapshotCache,
    private readonly repository: Pick<FeeSnapshotRepository, 'findLatest'>,
  ) {}

  async bootstrap(): Promise<void> {
    if (this.cache.get() !== null) return;
    try {
      const persisted = await this.repository.findLatest();
      if (persisted !== null) this.cache.set(persisted);
    } catch (error) {
      if (!(error instanceof FeeHistoryUnavailableError)) throw error;
    }
  }

  async execute(): Promise<FeeSnapshot> {
    const snapshot = this.cache.get();
    if (snapshot === null) throw new SnapshotUnavailableError();
    return snapshot;
  }
}
