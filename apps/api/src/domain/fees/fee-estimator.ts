import { medianBigInt, nearestRankBigInt } from '../shared/statistics.js';
import { ceilDivide, ceilRational } from '../shared/units.js';
import {
  DEFAULT_FEE_POLICY,
  type FeeEstimate,
  type FeePolicy,
  type PendingBid,
  type FeeEvidence,
} from './models.js';

export interface EstimateFeesInput {
  evidence: FeeEvidence;
  pendingBids: PendingBid[];
  now: Date;
  policy?: FeePolicy;
}

function effectiveTip(bid: PendingBid, baseFeeWei: bigint): bigint | null {
  if (bid.kind === 'eip1559') {
    const maxFee = bid.maxFeePerGasWei;
    const maxPriority = bid.maxPriorityFeePerGasWei;
    if (
      maxFee === undefined ||
      maxPriority === undefined ||
      maxFee < 0n ||
      maxPriority < 0n ||
      maxFee < baseFeeWei
    ) {
      return null;
    }

    const available = maxFee - baseFeeWei;
    return maxPriority < available ? maxPriority : available;
  }

  const gasPrice = bid.gasPriceWei;
  if (gasPrice === undefined || gasPrice < 0n || gasPrice < baseFeeWei) {
    return null;
  }

  return gasPrice - baseFeeWei;
}

function isInsideWindow(observedAt: Date, now: Date, windowMs: number): boolean {
  const ageMs = now.getTime() - observedAt.getTime();
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= windowMs;
}

export function estimateFees(input: EstimateFeesInput): FeeEstimate | null {
  const { evidence, pendingBids, now } = input;
  const policy = input.policy ?? DEFAULT_FEE_POLICY;

  if (evidence.latestBaseFeeWei < 0n || evidence.projectedNextBaseFeeWei < 0n) {
    return null;
  }

  const pendingEffectiveTipsWei = pendingBids
    .filter((bid) => isInsideWindow(bid.observedAt, now, policy.mempoolWindowMs))
    .map((bid) => effectiveTip(bid, evidence.latestBaseFeeWei))
    .filter((tip): tip is bigint => tip !== null)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

  const pendingPriority = nearestRankBigInt(pendingEffectiveTipsWei, policy.pendingPercentile);
  if (pendingPriority === null) return null;

  const historicalMedian = medianBigInt(
    evidence.historicalRewardP60Wei.filter((reward) => reward >= 0n),
  );
  const historicalPriority = historicalMedian === null ? 0n : ceilRational(historicalMedian);
  const recommendedPriorityFeeWei =
    pendingPriority > historicalPriority ? pendingPriority : historicalPriority;
  const baseFeeReference =
    evidence.latestBaseFeeWei > evidence.projectedNextBaseFeeWei
      ? evidence.latestBaseFeeWei
      : evidence.projectedNextBaseFeeWei;
  const baseFeeWithHeadroom = ceilDivide(
    baseFeeReference * BigInt(policy.baseFeeHeadroomBasisPoints),
    1_000n,
  );

  return {
    latestBaseFeeWei: evidence.latestBaseFeeWei,
    projectedNextBaseFeeWei: evidence.projectedNextBaseFeeWei,
    recommendedPriorityFeeWei,
    recommendedMaxFeeWei: baseFeeWithHeadroom + recommendedPriorityFeeWei,
    effectiveGasPriceWei: evidence.latestBaseFeeWei + recommendedPriorityFeeWei,
    pendingEffectiveTipsWei,
  };
}
