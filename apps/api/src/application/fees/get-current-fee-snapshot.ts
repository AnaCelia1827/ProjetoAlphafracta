import { SnapshotUnavailableError } from '../common/errors.js';
import { FeeHistoryUnavailableError } from '../../domain/fees/fee-trend.js';
import type { FeeSnapshot } from '../../domain/fees/models.js';
import type { FeeSnapshotRepository } from '../../domain/fees/ports.js';
import type { FeeSnapshotCache } from './calculate-fee-snapshot.js';

/**
 * Camada: aplicação de taxas.
 *
 * Entrega o estado mais recente do cache e o inicializa uma vez a partir do
 * histórico quando disponível, permitindo resposta antes do próximo evento.
 */
/** Caso de uso de leitura do snapshot atual, desacoplado de HTTP e Mongo concreto. */
export class GetCurrentFeeSnapshot {
  /** Recebe cache de processo e consulta mínima de recuperação persistida. */
  constructor(
    private readonly cache: FeeSnapshotCache,
    private readonly repository: Pick<FeeSnapshotRepository, 'findLatest'>,
  ) {}

  /**
   * Preenche o cache apenas se vazio; indisponibilidade de histórico é tolerada
   * porque o primeiro cálculo ao vivo ainda pode construir um novo estado.
   */
  async bootstrap(): Promise<void> {
    if (this.cache.get() !== null) return;
    try {
      const persisted = await this.repository.findLatest();
      if (persisted !== null) this.cache.set(persisted);
    } catch (error) {
      if (!(error instanceof FeeHistoryUnavailableError)) throw error;
    }
  }

  /** Devolve o cache ou informa que nenhuma recomendação foi obtida ainda. */
  async execute(): Promise<FeeSnapshot> {
    const snapshot = this.cache.get();
    if (snapshot === null) throw new SnapshotUnavailableError();
    return snapshot;
  }
}
