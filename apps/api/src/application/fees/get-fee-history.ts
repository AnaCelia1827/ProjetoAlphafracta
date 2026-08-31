import { HistoryUnavailableError } from '../common/errors.js';
import { FeeHistoryUnavailableError } from '../../domain/fees/fee-trend.js';
import type { FeeHistoryPage, FeeHistoryQuery } from '../../domain/fees/models.js';
import type { FeeSnapshotRepository } from '../../domain/fees/ports.js';

/**
 * Camada: aplicação de taxas.
 *
 * Expõe a página de histórico preservando o cursor do repositório e converte
 * indisponibilidade de armazenamento em erro público específico.
 */
/** Caso de uso de leitura paginada do histórico de recomendações atuais. */
export class GetFeeHistory {
  /** Recebe somente a capacidade necessária de paginação. */
  constructor(private readonly repository: Pick<FeeSnapshotRepository, 'findPage'>) {}

  /** Consulta a página e mapeia falha conhecida de histórico para o contrato HTTP. */
  async execute(query: FeeHistoryQuery): Promise<FeeHistoryPage> {
    try {
      return await this.repository.findPage(query);
    } catch (error) {
      if (error instanceof FeeHistoryUnavailableError) throw new HistoryUnavailableError();
      throw error;
    }
  }
}
