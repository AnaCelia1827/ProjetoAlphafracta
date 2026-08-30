import type { BlockSummary } from './models.js';

export interface BlockUpsertResult {
  current: BlockSummary;
  replaced: BlockSummary | null;
}

export class RecentBlockWindow {
  private blocks: BlockSummary[] = [];

  constructor(private readonly limit = 20) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError('Recent block window limit must be a positive integer');
    }
  }

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

  values(): BlockSummary[] {
    return [...this.blocks];
  }

  find(number: bigint): BlockSummary | null {
    return this.blocks.find((block) => block.number === number) ?? null;
  }
}
