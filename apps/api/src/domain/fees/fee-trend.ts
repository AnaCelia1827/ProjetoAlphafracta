import { medianBigInt } from '../shared/statistics.js';
import {
  divideRationals,
  multiplyRationals,
  rational,
  subtractRationals,
} from '../shared/units.js';
import type { FeeTrend } from './models.js';
import type { FeeSnapshotRepository } from './ports.js';

const WINDOW_MS = 5 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

export class FeeHistoryUnavailableError extends Error {
  constructor() {
    super('Fee history is unavailable');
    this.name = 'FeeHistoryUnavailableError';
  }
}

export async function calculateTrend24h(input: {
  now: Date;
  repository: Pick<FeeSnapshotRepository, 'findWindow'>;
}): Promise<FeeTrend> {
  const currentFrom = new Date(input.now.getTime() - WINDOW_MS);
  const previousTo = new Date(input.now.getTime() - DAY_MS);
  const previousFrom = new Date(previousTo.getTime() - WINDOW_MS);

  try {
    const [current, previous] = await Promise.all([
      input.repository.findWindow(currentFrom, input.now),
      input.repository.findWindow(previousFrom, previousTo),
    ]);
    const currentMedian = medianBigInt(current.map((snapshot) => snapshot.recommendedMaxFeeWei));
    const previousMedian = medianBigInt(previous.map((snapshot) => snapshot.recommendedMaxFeeWei));

    if (currentMedian === null || previousMedian === null || previousMedian.numerator === 0n) {
      return { status: 'insufficient-history', windowMinutes: 5 };
    }

    const percentChange = multiplyRationals(
      divideRationals(subtractRationals(currentMedian, previousMedian), previousMedian),
      rational(100n),
    );

    return {
      status: 'available',
      windowMinutes: 5,
      percentChange,
      currentMedianMaxFeeWei: currentMedian,
      previousMedianMaxFeeWei: previousMedian,
    };
  } catch (error) {
    if (error instanceof FeeHistoryUnavailableError) {
      return {
        status: 'unavailable',
        windowMinutes: 5,
        reason: 'history-unavailable',
      };
    }
    throw error;
  }
}
