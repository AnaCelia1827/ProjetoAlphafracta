import type { BlockSummary, FinalityChange } from '../../domain/blocks/models.js';
import type { FeeSnapshot } from '../../domain/fees/models.js';

export type LiveEvent =
  | { type: 'fee-snapshot'; snapshot: FeeSnapshot }
  | { type: 'block-added'; block: BlockSummary }
  | { type: 'block-status-changed'; change: FinalityChange };

export interface LiveEventPublisher {
  publish(event: LiveEvent): void;
}
