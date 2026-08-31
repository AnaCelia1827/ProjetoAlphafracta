import { multiplyRationals, rational } from '../shared/units.js';
import type { EstimatedTransferCost, PriceQuote } from './models.js';

/**
 * Camada: domínio de taxas.
 *
 * Deriva o teto de custo de uma transferência ETH simples a partir da taxa
 * recomendada e anexa USD somente quando há uma cotação disponível.
 */
/** Unidades fixas de gas de uma transferência nativa, conforme o contrato público. */
export const NATIVE_TRANSFER_GAS_UNITS = 21_000n;
/** Fator de conversão exato entre wei e ether. */
const WEI_PER_ETH = 1_000_000_000_000_000_000n;
/** Idade máxima para apresentar uma cotação como atual no snapshot. */
const FRESH_PRICE_AGE_MS = 30_000;

/**
 * Calcula custo máximo em ETH e, quando possível, USD sem perder precisão.
 *
 * A recomendação continua útil sem preço: o status unavailable deixa clara a
 * ausência da conversão em vez de fabricar um valor monetário.
 */
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
