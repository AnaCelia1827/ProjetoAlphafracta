import { medianBigInt, nearestRankBigInt } from '../shared/statistics.js';
import { compareRationals, divideRationals, rational, subtractRationals } from '../shared/units.js';
import { DEFAULT_CONFIDENCE_POLICY, type ConfidencePolicy, type FeeConfidence } from './models.js';

type Dimension = 0 | 1 | 2 | 3;

function sourceDimension(updatedAt: Date | null, now: Date, policy: ConfidencePolicy): Dimension {
  if (updatedAt === null) return 0;
  const ageMs = now.getTime() - updatedAt.getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > policy.unavailableSourceAgeMs) {
    return 0;
  }
  if (ageMs <= policy.freshSourceAgeMs) return 3;
  if (ageMs <= policy.mediumSourceAgeMs) return 2;
  return 1;
}

function sampleDimension(sampleSize: number, policy: ConfidencePolicy): Dimension {
  if (sampleSize >= policy.highSampleSize) return 3;
  if (sampleSize >= policy.mediumSampleSize) return 2;
  if (sampleSize > 0) return 1;
  return 0;
}

function stabilityDimension(tips: readonly bigint[], policy: ConfidencePolicy): Dimension {
  const median = medianBigInt(tips);
  if (median === null) return 0;
  if (median.numerator === 0n) return 1;

  const p25 = nearestRankBigInt(tips, 0.25)!;
  const p75 = nearestRankBigInt(tips, 0.75)!;
  const relativeIqr = divideRationals(subtractRationals(rational(p75), rational(p25)), median);

  if (compareRationals(relativeIqr, policy.highRelativeIqr) <= 0) return 3;
  if (compareRationals(relativeIqr, policy.mediumRelativeIqr) <= 0) return 2;
  return 1;
}

function levelFromDimension(dimension: Dimension): FeeConfidence['level'] {
  if (dimension === 3) return 'high';
  if (dimension === 2) return 'medium';
  if (dimension === 1) return 'low';
  return 'unavailable';
}

export function evaluateFeeConfidence(input: {
  now: Date;
  mempoolUpdatedAt: Date | null;
  ethereumUpdatedAt: Date | null;
  effectiveTipsWei: bigint[];
  policy?: ConfidencePolicy;
}): FeeConfidence {
  const policy = input.policy ?? DEFAULT_CONFIDENCE_POLICY;
  const dataDimension = Math.min(
    sourceDimension(input.mempoolUpdatedAt, input.now, policy),
    sourceDimension(input.ethereumUpdatedAt, input.now, policy),
  ) as Dimension;
  const samples = sampleDimension(input.effectiveTipsWei.length, policy);
  const stability = stabilityDimension(input.effectiveTipsWei, policy);
  const worst = Math.min(dataDimension, samples, stability) as Dimension;

  return {
    level: levelFromDimension(worst),
    reasons: [
      dataDimension === 3 ? 'fresh-data' : dataDimension === 0 ? 'missing-data' : 'aging-data',
      stability >= 2 ? 'stable-fees' : 'volatile-fees',
      samples >= 2 ? 'strong-sample' : 'weak-sample',
    ],
  };
}
