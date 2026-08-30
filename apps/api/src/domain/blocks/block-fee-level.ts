import { compareRationals, type Rational } from '../shared/units.js';
import type { BlockFeeLevel, BlockSummary } from './models.js';

function nearestRankRational(values: readonly Rational[], percentile: number): Rational {
  const sorted = [...values].sort(compareRationals);
  return sorted[Math.ceil(percentile * sorted.length) - 1]!;
}

export function classifyBlockFeeLevel(
  effectiveGasPriceWei: Rational,
  comparisonBlocks: readonly BlockSummary[],
): BlockFeeLevel {
  if (comparisonBlocks.length < 20) return 'unavailable';

  const prices = comparisonBlocks.map((block) => block.effectiveGasPriceWei);
  const p25 = nearestRankRational(prices, 0.25);
  const p75 = nearestRankRational(prices, 0.75);
  const p90 = nearestRankRational(prices, 0.9);

  if (compareRationals(effectiveGasPriceWei, p25) < 0) return 'low';
  if (compareRationals(effectiveGasPriceWei, p75) < 0) return 'normal';
  if (compareRationals(effectiveGasPriceWei, p90) < 0) return 'elevated';
  return 'high';
}
