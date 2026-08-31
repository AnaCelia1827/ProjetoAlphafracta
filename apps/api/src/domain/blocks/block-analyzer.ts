import { medianBigInt } from '../shared/statistics.js';
import { addRationals, rational } from '../shared/units.js';
import type {
  BlockFeeLevel,
  BlockFinality,
  BlockSummary,
  NormalizedBlock,
  NormalizedBlockTransaction,
} from './models.js';

/**
 * Camada: domínio de blocos.
 *
 * Converte um bloco normalizado em resumo calculado, validando os invariantes
 * que tornam métricas de taxa e ocupação significativas antes de publicá-las.
 */
/** Erro explícito para blocos anteriores a EIP-1559, sem base fee analisável. */
export class UnsupportedPreEip1559BlockError extends Error {
  /** Cria o erro estável convertido na borda HTTP para resposta compreensível. */
  constructor() {
    super('Block does not contain an EIP-1559 base fee');
    this.name = 'UnsupportedPreEip1559BlockError';
  }
}

/** Erro para dados de bloco que violam limites físicos de gas da própria rede. */
export class MalformedBlockError extends Error {
  /** Preserva a explicação específica da inconsistência detectada na análise. */
  constructor(message: string) {
    super(message);
    this.name = 'MalformedBlockError';
  }
}

/**
 * Calcula gorjeta efetiva de uma transação e descarta campos incompatíveis ou
 * incapazes de cobrir a base fee para não enviesar a mediana do bloco.
 */
function effectiveTip(transaction: NormalizedBlockTransaction, baseFeeWei: bigint): bigint | null {
  if (transaction.kind === 'eip1559') {
    const maxFee = transaction.maxFeePerGasWei;
    const priority = transaction.maxPriorityFeePerGasWei;
    if (maxFee === undefined || priority === undefined || maxFee < baseFeeWei || priority < 0n) {
      return null;
    }
    const capacity = maxFee - baseFeeWei;
    return priority < capacity ? priority : capacity;
  }

  const gasPrice = transaction.gasPriceWei;
  if (gasPrice === undefined || gasPrice < baseFeeWei) return null;
  return gasPrice - baseFeeWei;
}

/**
 * Valida e resume um bloco EIP-1559 usando mediana das gorjetas válidas.
 *
 * O resumo conserva valores exatos e já recebe finality/classificação da
 * aplicação, permitindo que a regra de cálculo permaneça independente de I/O.
 */
export function analyzeBlock(
  block: NormalizedBlock,
  classification: {
    finality: BlockFinality;
    feeLevel: BlockFeeLevel;
  },
): BlockSummary {
  if (block.baseFeePerGasWei === null || block.baseFeePerGasWei < 0n) {
    throw new UnsupportedPreEip1559BlockError();
  }
  if (block.gasLimit <= 0n) {
    throw new MalformedBlockError('Block gas limit must be greater than zero');
  }
  if (block.gasUsed < 0n || block.gasUsed > block.gasLimit) {
    throw new MalformedBlockError('Block gas used is outside its gas limit');
  }

  const validTips = block.transactions
    .map((transaction) => effectiveTip(transaction, block.baseFeePerGasWei!))
    .filter((tip): tip is bigint => tip !== null);
  const medianPriorityFeeWei = medianBigInt(validTips) ?? rational(0n);

  return {
    network: 'ethereum-mainnet',
    number: block.number,
    hash: block.hash,
    timestamp: block.timestamp,
    finality: classification.finality,
    feeLevel: classification.feeLevel,
    baseFeeWei: block.baseFeePerGasWei,
    medianPriorityFeeWei,
    effectiveGasPriceWei: addRationals(rational(block.baseFeePerGasWei), medianPriorityFeeWei),
    gasUsed: block.gasUsed,
    gasLimit: block.gasLimit,
    utilization: rational(block.gasUsed * 100n, block.gasLimit),
    transactionCount: block.transactions.length,
    provider: 'alchemy',
  };
}
