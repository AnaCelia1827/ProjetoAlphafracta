import { HistoryUnavailableError } from '../common/errors.js';
import { FeeHistoryUnavailableError } from '../../domain/fees/fee-trend.js';
import type { FeeHistoryPage, FeeHistoryQuery } from '../../domain/fees/models.js';
import type { FeeSnapshotRepository } from '../../domain/fees/ports.js';

export class GetFeeHistory {
  constructor(private readonly repository: Pick<FeeSnapshotRepository, 'findPage'>) {}

  async execute(query: FeeHistoryQuery): Promise<FeeHistoryPage> {
    try {
      return await this.repository.findPage(query);
    } catch (error) {
      if (error instanceof FeeHistoryUnavailableError) throw new HistoryUnavailableError();
      throw error;
    }
  }
}
