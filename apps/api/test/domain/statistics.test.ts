/**
 * Testes de utilitários numéricos: impedem perda de precisão nos cálculos de
 * mediana, percentil e frações que sustentam todas as recomendações de taxa.
 */
import { describe, expect, it } from 'vitest';

import * as statistics from '../../src/domain/shared/statistics.js';
import * as units from '../../src/domain/shared/units.js';

type Callable = (...arguments_: unknown[]) => unknown;

/** Obtém helper exportado e falha cedo se o contrato do módulo for removido. */
function functionFrom(module: object, name: string): Callable {
  expect(module).toHaveProperty(name);
  return (module as Record<string, Callable>)[name]!;
}

describe('statistics', () => {
  it('returns null for an empty median', () => {
    expect(functionFrom(statistics, 'medianBigInt')([])).toBeNull();
  });

  it('returns the central value for an odd median', () => {
    expect(functionFrom(statistics, 'medianBigInt')([9n, 1n, 5n])).toEqual({
      numerator: 5n,
      denominator: 1n,
    });
  });

  it('preserves an exact rational for an even median', () => {
    expect(functionFrom(statistics, 'medianBigInt')([4n, 1n])).toEqual({
      numerator: 5n,
      denominator: 2n,
    });
  });

  it.each([
    [0.25, 2n],
    [0.6, 3n],
    [0.75, 4n],
    [0.9, 5n],
  ])('uses nearest-rank for percentile %s', (percentile, expected) => {
    expect(functionFrom(statistics, 'nearestRankBigInt')([5n, 1n, 4n, 2n, 3n], percentile)).toBe(
      expected,
    );
  });

  it('rejects a percentile outside the interval (0, 1]', () => {
    expect(() => functionFrom(statistics, 'nearestRankBigInt')([1n], 0)).toThrow(RangeError);
    expect(() => functionFrom(statistics, 'nearestRankBigInt')([1n], 1.01)).toThrow(RangeError);
  });

  it('normalizes rationals and rounds their ceiling exactly', () => {
    expect(functionFrom(units, 'rational')(10n, 4n)).toEqual({
      numerator: 5n,
      denominator: 2n,
    });
    expect(functionFrom(units, 'ceilRational')({ numerator: 5n, denominator: 2n })).toBe(3n);
  });
});
