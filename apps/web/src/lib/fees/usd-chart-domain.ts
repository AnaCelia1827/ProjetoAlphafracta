export type UsdChartDomain = {
  ceiling: number;
  midpoint: number;
  scaleDenominator: number;
};

export function calculateUsdChartDomain(
  history: readonly { maxCostUsd?: number }[],
): UsdChartDomain | null {
  const pricedValues = history
    .map((point) => point.maxCostUsd)
    .filter((value): value is number => value !== undefined);

  if (pricedValues.length === 0) return null;

  const observedMaximum = Math.max(...pricedValues);
  const ceiling = observedMaximum * 1.1;

  return {
    ceiling,
    midpoint: ceiling / 2,
    scaleDenominator: ceiling === 0 ? 1 : ceiling,
  };
}
