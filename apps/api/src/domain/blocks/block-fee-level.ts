import { compareRationals, type Rational } from '../shared/units.js';
import type { BlockFeeLevel, BlockSummary } from './models.js';

/**
 * Camada: domínio de blocos.
 *
 * Classifica o preço efetivo de um bloco contra percentis da janela histórica,
 * devolvendo unavailable até que a referência seja estatisticamente suficiente.
 */
/** Seleciona percentil nearest-rank de razões já ordenáveis sem perder precisão. */
function nearestRankRational(values: readonly Rational[], percentile: number): Rational {
  const sorted = [...values].sort(compareRationals);
  return sorted[Math.ceil(percentile * sorted.length) - 1]!;
}

/**
 * Compara preço efetivo com P25, P75 e P90 dos últimos blocos de referência.
 *
 * Exige vinte blocos antes de classificar para não atribuir rótulos relativos a
 * uma amostra muito pequena.
 */
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
