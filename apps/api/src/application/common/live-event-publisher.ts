import type { BlockSummary, FinalityChange } from '../../domain/blocks/models.js';
import type { FeeSnapshot } from '../../domain/fees/models.js';

/**
 * Camada: aplicação.
 *
 * Define a fronteira de publicação ao vivo que evita que casos de uso conheçam
 * SSE. A implementação decide como enfileirar, serializar e lidar com clientes.
 */
/** União discriminada dos fatos de domínio que podem alcançar assinantes ao vivo. */
export type LiveEvent =
  | { type: 'fee-snapshot'; snapshot: FeeSnapshot }
  | { type: 'block-added'; block: BlockSummary }
  | { type: 'block-status-changed'; change: FinalityChange };

/** Porta de saída síncrona para transmitir um fato recém-observado. */
export interface LiveEventPublisher {
  /** Publica o evento sem impor transporte específico aos casos de uso. */
  publish(event: LiveEvent): void;
}
