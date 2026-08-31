import type { BlockFinality, BlockHash, FinalityHead, FinalityHeads } from './models.js';

/**
 * Camada: domínio de blocos.
 *
 * Resolve a finality observável comparando a identidade número+hash contra as
 * cabeças safe e finalized, sem assumir que mesma altura implica mesmo bloco.
 */
/** Determina se a identidade do bloco pertence à cadeia no marco informado. */
function isAtOrBehind(block: { number: bigint; hash: BlockHash }, head: FinalityHead): boolean {
  if (block.number > head.number) return false;
  if (block.number < head.number) return true;
  return block.hash.toLowerCase() === head.hash.toLowerCase();
}

/**
 * Prioriza finalized, depois safe, e mantém latest quando o bloco ainda não
 * alcançou nenhum marco. A ordem protege a progressão monotônica de status.
 */
export function resolveBlockFinality(
  block: { number: bigint; hash: BlockHash },
  heads: FinalityHeads,
): BlockFinality {
  if (isAtOrBehind(block, heads.finalized)) return 'finalized';
  if (isAtOrBehind(block, heads.safe)) return 'safe';
  return 'latest';
}
