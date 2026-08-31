import { rational, type Rational } from './units.js';

/**
 * Camada: domínio compartilhado.
 *
 * Implementa estatísticas de BigInt com razões exatas. Os cálculos evitam
 * conversão prematura para ponto flutuante ao escolher taxas monetárias.
 */
/** Calcula a mediana exata, retornando null para não inventar valor sem amostras. */
export function medianBigInt(values: readonly bigint[]): Rational | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return rational(sorted[middle]!, 1n);
  }

  return rational(sorted[middle - 1]! + sorted[middle]!, 2n);
}

/**
 * Seleciona um percentil pelo método nearest-rank, aceitando somente (0, 1].
 *
 * A validação falha cedo para impedir que uma política incorreta silenciosamente
 * escolha a primeira ou última taxa disponível.
 */
export function nearestRankBigInt(values: readonly bigint[], percentile: number): bigint | null {
  if (!Number.isFinite(percentile) || percentile <= 0 || percentile > 1) {
    throw new RangeError('Percentile must be within (0, 1]');
  }
  if (values.length === 0) return null;

  const sorted = [...values].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const index = Math.ceil(percentile * sorted.length) - 1;
  return sorted[index]!;
}
