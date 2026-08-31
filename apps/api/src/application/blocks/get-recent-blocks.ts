import { BlocksUnavailableError } from '../common/errors.js';
import type { BlockSummary } from '../../domain/blocks/models.js';
import type { RecentBlockWindow } from '../../domain/blocks/recent-block-window.js';

/**
 * Camada: aplicação de blocos.
 *
 * Lê exclusivamente a janela observada. Isso separa o painel ao vivo de uma
 * busca pontual e impede que uma consulta do usuário altere estado monitorado.
 */
/** Caso de uso que fornece a janela local pronta para a rota REST. */
export class GetRecentBlocks {
  /** Recebe a memória de blocos mantida pelo fluxo de observação. */
  constructor(private readonly window: RecentBlockWindow) {}

  /** Devolve a janela ou sinaliza que ela ainda não possui nenhum bloco. */
  async execute(): Promise<BlockSummary[]> {
    const blocks = this.window.values();
    if (blocks.length === 0) throw new BlocksUnavailableError();
    return blocks;
  }
}
