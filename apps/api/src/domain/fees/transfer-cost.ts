import { multiplyRationals, rational } from '../shared/units.js';
import type { EstimatedTransferCost, PriceQuote } from './models.js';

export const NATIVE_TRANSFER_GAS_UNITS = 21_000n;
const WEI_PER_ETH = 1_000_000_000_000_000_000n;
const FRESH_PRICE_AGE_MS = 30_000;

export function calculateTransferCost(input: {
  recommendedMaxFeeWei: bigint;
  quote: PriceQuote | null;
  now: Date;
}): EstimatedTransferCost {
  const maxCostEth = rational(input.recommendedMaxFeeWei * NATIVE_TRANSFER_GAS_UNITS, WEI_PER_ETH);
  const base = {
    transactionType: 'native-eth-transfer' as const,
    gasUnits: 21_000n as const,
    maxCostEth,
  };

  if (input.quote === null) {
    return { status: 'unavailable', ...base };
  }

  const ageMs = input.now.getTime() - input.quote.updatedAt.getTime();
  return {
    status: ageMs >= 0 && ageMs <= FRESH_PRICE_AGE_MS ? 'fresh' : 'stale',
    ...base,
    ethUsd: input.quote.ethUsd,
    maxCostUsd: multiplyRationals(maxCostEth, input.quote.ethUsd),
    priceUpdatedAt: input.quote.updatedAt,
  };
}
