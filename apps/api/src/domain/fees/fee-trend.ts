import { medianBigInt } from '../shared/statistics.js';
import {
  divideRationals,
  multiplyRationals,
  rational,
  subtractRationals,
} from '../shared/units.js';
import type { FeeTrend } from './models.js';
import type { FeeSnapshotRepository } from './ports.js';

/**
 * Camada: domínio de taxas.
 *
 * Compara a mediana de max fee da janela corrente com a janela equivalente de
 * 24 horas antes, mantendo insuficiência de histórico distinta de falha do repo.
 */
/** Duração da janela curta exibida pelo contrato de tendência. */
const WINDOW_MS = 5 * 60 * 1_000;
/** Deslocamento temporal que posiciona a janela de comparação em um dia antes. */
const DAY_MS = 24 * 60 * 60 * 1_000;

/** Sinal tipado de que histórico não pode ser consultado sem derrubar o snapshot. */
export class FeeHistoryUnavailableError extends Error {
  /** Cria o erro reconhecido pela aplicação ao degradar a tendência. */
  constructor() {
    super('Fee history is unavailable');
    this.name = 'FeeHistoryUnavailableError';
  }
}

/**
 * Calcula a variação percentual entre duas medianas de cinco minutos separadas
 * por 24 horas. Histórico vazio, ou referência zero, é insuficiente; somente a
 * indisponibilidade conhecida do repositório vira status unavailable.
 */
export async function calculateTrend24h(input: {
  now: Date;
  repository: Pick<FeeSnapshotRepository, 'findWindow'>;
}): Promise<FeeTrend> {
  const currentFrom = new Date(input.now.getTime() - WINDOW_MS);
  const previousTo = new Date(input.now.getTime() - DAY_MS);
  const previousFrom = new Date(previousTo.getTime() - WINDOW_MS);

  try {
    const [current, previous] = await Promise.all([
      input.repository.findWindow(currentFrom, input.now),
      input.repository.findWindow(previousFrom, previousTo),
    ]);
    const currentMedian = medianBigInt(current.map((snapshot) => snapshot.recommendedMaxFeeWei));
    const previousMedian = medianBigInt(previous.map((snapshot) => snapshot.recommendedMaxFeeWei));

    if (currentMedian === null || previousMedian === null || previousMedian.numerator === 0n) {
      return { status: 'insufficient-history', windowMinutes: 5 };
    }

    const percentChange = multiplyRationals(
      divideRationals(subtractRationals(currentMedian, previousMedian), previousMedian),
      rational(100n),
    );

    return {
      status: 'available',
      windowMinutes: 5,
      percentChange,
      currentMedianMaxFeeWei: currentMedian,
      previousMedianMaxFeeWei: previousMedian,
    };
  } catch (error) {
    if (error instanceof FeeHistoryUnavailableError) {
      return {
        status: 'unavailable',
        windowMinutes: 5,
        reason: 'history-unavailable',
      };
    }
    throw error;
  }
}
