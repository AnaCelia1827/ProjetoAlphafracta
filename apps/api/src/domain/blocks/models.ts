import type { Rational } from '../shared/units.js';

/**
 * Camada: domínio de blocos.
 *
 * Normaliza a identidade e os valores de blocos antes de qualquer adaptação de
 * provedor. Número junto a hash mantém a memória segura perante reorganizações.
 */
/** Hash tipado para não confundir a identidade de bloco com texto arbitrário. */
export type BlockHash = `0x${string}`;

/** Campos de taxa preservados para transações EIP-1559 e legacy normalizadas. */
export type NormalizedBlockTransaction =
  | {
      kind: 'eip1559';
      maxFeePerGasWei?: bigint;
      maxPriorityFeePerGasWei?: bigint;
    }
  | {
      kind: 'legacy';
      gasPriceWei?: bigint;
    };

/** Bloco independente de fornecedor, pronto para análise das regras de domínio. */
export interface NormalizedBlock {
  number: bigint;
  hash: BlockHash;
  timestamp: Date;
  baseFeePerGasWei: bigint | null;
  gasUsed: bigint;
  gasLimit: bigint;
  transactions: NormalizedBlockTransaction[];
}

/** Marco de confirmação que só pode avançar ao longo do ciclo de vida do bloco. */
export type BlockFinality = 'latest' | 'safe' | 'finalized';
/** Classificação de preço relativa ao histórico recente de blocos. */
export type BlockFeeLevel = 'low' | 'normal' | 'elevated' | 'high' | 'unavailable';

/** Resumo persistível e exibível de uma observação canônica de bloco. */
export interface BlockSummary {
  network: 'ethereum-mainnet';
  number: bigint;
  hash: BlockHash;
  timestamp: Date;
  finality: BlockFinality;
  feeLevel: BlockFeeLevel;
  baseFeeWei: bigint;
  medianPriorityFeeWei: Rational;
  effectiveGasPriceWei: Rational;
  gasUsed: bigint;
  gasLimit: bigint;
  utilization: Rational;
  transactionCount: number;
  provider: 'alchemy';
}

/** Cabeça identificada que representa um marco de finality retornado pela rede. */
export interface FinalityHead {
  number: bigint;
  hash: BlockHash;
}

/** Par de cabeças necessário para promover blocos a safe ou finalized. */
export interface FinalityHeads {
  safe: FinalityHead;
  finalized: FinalityHead;
}

/** Promoção a persistir e transmitir quando a finality de um bloco avança. */
export interface FinalityChange {
  number: bigint;
  hash: BlockHash;
  finality: BlockFinality;
}

/** Entrada de busca por altura numérica ou pela identidade hash do bloco. */
export type BlockIdentifier = bigint | BlockHash;
