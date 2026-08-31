import type { Rational } from '../shared/units.js';

/**
 * Camada: domínio de taxas.
 *
 * Define o vocabulário puro que une evidência Ethereum, mempool, preço e
 * persistência. Nenhum tipo aqui conhece RPC, MongoDB ou formato HTTP.
 */
/** Hash tipado para impedir que texto comum seja usado como transação observada. */
export type TransactionHash = `0x${string}`;

/** Evidência de taxa vinda da rede Ethereum para uma recomendação calculável. */
export interface FeeEvidence {
  latestBaseFeeWei: bigint;
  projectedNextBaseFeeWei: bigint;
  historicalRewardP60Wei: bigint[];
  ethereumUpdatedAt: Date;
}

/** Lance pendente normalizado, conservando os campos que cada tipo suporta. */
export interface PendingBid {
  hash: TransactionHash;
  observedAt: Date;
  kind: 'eip1559' | 'legacy';
  maxFeePerGasWei?: bigint;
  maxPriorityFeePerGasWei?: bigint;
  gasPriceWei?: bigint;
}

/** Parâmetros auditáveis que definem como a recomendação de taxa é calculada. */
export interface FeePolicy {
  mempoolWindowMs: number;
  feeHistoryBlockCount: number;
  rewardPercentile: number;
  pendingPercentile: number;
  baseFeeHeadroomBasisPoints: number;
}

/** Política padrão: janela curta da mempool e teto EIP-1559 de 12,5%. */
export const DEFAULT_FEE_POLICY = {
  mempoolWindowMs: 30_000,
  feeHistoryBlockCount: 10,
  rewardPercentile: 0.6,
  pendingPercentile: 0.6,
  baseFeeHeadroomBasisPoints: 1_125,
} as const satisfies FeePolicy;

/** Resultado interno da política antes de preço, confiança e serialização. */
export interface FeeEstimate {
  latestBaseFeeWei: bigint;
  projectedNextBaseFeeWei: bigint;
  recommendedPriorityFeeWei: bigint;
  recommendedMaxFeeWei: bigint;
  effectiveGasPriceWei: bigint;
  pendingEffectiveTipsWei: bigint[];
}

/** Cotação ETH/USD exata acompanhada do instante observado na fonte. */
export interface PriceQuote {
  ethUsd: Rational;
  updatedAt: Date;
}

/** Campos comuns do custo de uma transferência ETH simples de 21.000 gas. */
interface TransferCostBase {
  transactionType: 'native-eth-transfer';
  gasUnits: 21_000n;
  maxCostEth: Rational;
}

/** Custo convertido quando há cotação ou estado explícito de indisponibilidade. */
export type EstimatedTransferCost =
  | (TransferCostBase & {
      status: 'fresh' | 'stale';
      ethUsd: Rational;
      maxCostUsd: Rational;
      priceUpdatedAt: Date;
    })
  | (TransferCostBase & {
      status: 'unavailable';
    });

/** Comparação recente de mediana que diferencia histórico insuficiente de falha. */
export type FeeTrend =
  | {
      status: 'available';
      windowMinutes: 5;
      percentChange: Rational;
      currentMedianMaxFeeWei: Rational;
      previousMedianMaxFeeWei: Rational;
    }
  | {
      status: 'insufficient-history';
      windowMinutes: 5;
    }
  | {
      status: 'unavailable';
      windowMinutes: 5;
      reason: 'history-unavailable';
    };

/** Evidência humana e determinística que justifica a confiança calculada. */
export type FeeConfidenceReason =
  | 'fresh-data'
  | 'stable-fees'
  | 'strong-sample'
  | 'aging-data'
  | 'volatile-fees'
  | 'weak-sample'
  | 'missing-data';

/** Nível final de confiança acompanhado das razões que o compõem. */
export interface FeeConfidence {
  level: 'high' | 'medium' | 'low' | 'unavailable';
  reasons: FeeConfidenceReason[];
}

/** Estado completo monitorado, ainda em unidades exatas e objetos Date internos. */
export interface FeeSnapshot {
  timestamp: Date;
  network: 'ethereum-mainnet';
  recommendationState: 'current' | 'last-known';
  recommendedMaxFeeWei: bigint;
  recommendedPriorityFeeWei: bigint;
  baseFeeWei: bigint;
  effectiveGasPriceWei: bigint;
  estimatedTransferCost: EstimatedTransferCost;
  trend24h: FeeTrend;
  confidence: FeeConfidence;
  sampleSize: number;
  dataAgeMs: number;
  sourceUpdatedAt: {
    mempool?: Date;
    ethereum?: Date;
    price?: Date;
  };
  status: {
    mempool: 'fresh' | 'stale' | 'unavailable';
    ethereum: 'fresh' | 'stale' | 'unavailable';
    price: 'fresh' | 'stale' | 'unavailable';
    persistence: 'available' | 'degraded';
  };
}

/** Consulta de histórico já normalizada para a porta de persistência. */
export interface FeeHistoryQuery {
  from: Date;
  to: Date;
  limit: number;
  cursor?: string;
}

/** Página de snapshots com cursor opaco para paginação temporal estável. */
export interface FeeHistoryPage {
  data: FeeSnapshot[];
  nextCursor: string | null;
}

/** Limiares que convertem idade, amostra e volatilidade em confiança. */
export interface ConfidencePolicy {
  freshSourceAgeMs: number;
  mediumSourceAgeMs: number;
  unavailableSourceAgeMs: number;
  highSampleSize: number;
  mediumSampleSize: number;
  highRelativeIqr: Rational;
  mediumRelativeIqr: Rational;
}

/** Política padrão que favorece dados recentes, amostras fortes e baixa dispersão. */
export const DEFAULT_CONFIDENCE_POLICY = {
  freshSourceAgeMs: 10_000,
  mediumSourceAgeMs: 20_000,
  unavailableSourceAgeMs: 30_000,
  highSampleSize: 500,
  mediumSampleSize: 100,
  highRelativeIqr: { numerator: 1n, denominator: 2n },
  mediumRelativeIqr: { numerator: 1n, denominator: 1n },
} as const satisfies ConfidencePolicy;
