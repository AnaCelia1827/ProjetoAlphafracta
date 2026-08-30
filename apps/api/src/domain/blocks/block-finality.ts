import type { BlockFinality, BlockHash, FinalityHead, FinalityHeads } from './models.js';

function isAtOrBehind(block: { number: bigint; hash: BlockHash }, head: FinalityHead): boolean {
  if (block.number > head.number) return false;
  if (block.number < head.number) return true;
  return block.hash.toLowerCase() === head.hash.toLowerCase();
}

export function resolveBlockFinality(
  block: { number: bigint; hash: BlockHash },
  heads: FinalityHeads,
): BlockFinality {
  if (isAtOrBehind(block, heads.finalized)) return 'finalized';
  if (isAtOrBehind(block, heads.safe)) return 'safe';
  return 'latest';
}
