import { BlocksUnavailableError } from '../common/errors.js';
import type { BlockSummary } from '../../domain/blocks/models.js';
import type { RecentBlockWindow } from '../../domain/blocks/recent-block-window.js';

export class GetRecentBlocks {
  constructor(private readonly window: RecentBlockWindow) {}

  async execute(): Promise<BlockSummary[]> {
    const blocks = this.window.values();
    if (blocks.length === 0) throw new BlocksUnavailableError();
    return blocks;
  }
}
