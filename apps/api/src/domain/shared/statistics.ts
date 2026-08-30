import { rational, type Rational } from './units.js';

export function medianBigInt(values: readonly bigint[]): Rational | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return rational(sorted[middle]!, 1n);
  }

  return rational(sorted[middle - 1]! + sorted[middle]!, 2n);
}

export function nearestRankBigInt(values: readonly bigint[], percentile: number): bigint | null {
  if (!Number.isFinite(percentile) || percentile <= 0 || percentile > 1) {
    throw new RangeError('Percentile must be within (0, 1]');
  }
  if (values.length === 0) return null;

  const sorted = [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const index = Math.ceil(percentile * sorted.length) - 1;
  return sorted[index]!;
}
