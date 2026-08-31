import type { BlockSummary } from './models.js';

/**
 * Camada: domínio de blocos.
 *
 * Mantém uma janela curta em memória para exibição e classificação. A troca de
 * hash na mesma altura representa reorg, e por isso é devolvida ao chamador.
 */
/** Resultado de inserir um bloco e, se houver, substituir sua versão não canônica. */
export interface BlockUpsertResult {
  current: BlockSummary;
  replaced: BlockSummary | null;
}

/** Janela ordenada de blocos únicos por altura e hash, limitada por configuração. */
export class RecentBlockWindow {
  private blocks: BlockSummary[] = [];

  /** Valida um limite positivo para impedir retenção sem limite ou janela vazia. */
  constructor(private readonly limit = 20) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError('Recent block window limit must be a positive integer');
    }
  }

  /**
   * Insere ou atualiza bloco canônico, removendo duplicatas e expondo possível
   * bloco substituído para que persistência e SSE possam tratar o reorg.
   */
  upsert(block: BlockSummary): BlockUpsertResult {
    const existing = this.blocks.find((candidate) => candidate.number === block.number);
    const replaced =
      existing && existing.hash.toLowerCase() !== block.hash.toLowerCase() ? existing : null;

    this.blocks = this.blocks
      .filter(
        (candidate) =>
          candidate.number !== block.number &&
          candidate.hash.toLowerCase() !== block.hash.toLowerCase(),
      )
      .concat(block)
      .sort((left, right) => (left.number > right.number ? -1 : left.number < right.number ? 1 : 0))
      .slice(0, this.limit);

    return { current: block, replaced };
  }

  /** Devolve cópia da janela ordenada para impedir mutação externa do estado. */
  values(): BlockSummary[] {
    return [...this.blocks];
  }

  /** Localiza a observação corrente por altura sem consultar infraestrutura. */
  find(number: bigint): BlockSummary | null {
    return this.blocks.find((block) => block.number === number) ?? null;
  }
}
