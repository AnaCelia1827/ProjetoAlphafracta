import type WebSocket from 'ws';

import type { PriceQuote } from '../../domain/fees/models.js';
import type { PriceSource } from '../../domain/fees/ports.js';
import type { Clock } from '../../domain/shared/clock.js';
import { decimalStringToRational } from '../../domain/shared/units.js';
import { ReconnectingWebSocket } from '../alchemy/reconnecting-websocket.js';

/**
 * Camada: infraestrutura Coinbase.
 *
 * Assina ticker ETH/USD e mantém somente a última cotação decimal convertida em
 * razão exata. Frames inválidos ou de outro produto são ignorados para proteger
 * o cálculo de custo, que continua disponível em ETH sem preço.
 */
/** Configuração do stream de cotação e do relógio que carimba seus dados. */
export interface CoinbasePriceClientOptions {
  wsUrl: string;
  clock: Clock;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  heartbeatMs?: number;
}

/** Fonte de preço em memória que implementa a porta opcional do domínio de taxas. */
export class CoinbasePriceClient implements PriceSource {
  private quote: PriceQuote | null = null;
  private readonly socket: ReconnectingWebSocket;

  /** Configura a inscrição no ticker e valida mensagens antes de atualizar cotação. */
  constructor(options: CoinbasePriceClientOptions) {
    this.socket = new ReconnectingWebSocket({
      url: options.wsUrl,
      reconnectBaseDelayMs: options.reconnectBaseDelayMs,
      reconnectMaxDelayMs: options.reconnectMaxDelayMs,
      heartbeatMs: options.heartbeatMs,
      onOpen: (socket: WebSocket) => {
        socket.send(
          JSON.stringify({
            type: 'subscribe',
            product_ids: ['ETH-USD'],
            channels: ['ticker'],
          }),
        );
      },
      onMessage: (message) => {
        try {
          const payload = JSON.parse(message) as {
            type?: string;
            product_id?: string;
            price?: string;
          };
          if (
            payload.type !== 'ticker' ||
            payload.product_id !== 'ETH-USD' ||
            payload.price === undefined
          ) {
            return;
          }
          const ethUsd = decimalStringToRational(payload.price);
          if (ethUsd === null || ethUsd.numerator <= 0n) return;
          this.quote = { ethUsd, updatedAt: options.clock.now() };
        } catch {
          return;
        }
      },
    });
  }

  /** Inicia o stream de cotação após o runtime compor suas dependências. */
  start(): void {
    this.socket.start();
  }

  /** Encerra socket e timers do ticker mantendo a última cotação apenas em memória. */
  stop(): void {
    this.socket.stop();
  }

  /** Fornece cotação mais recente ou null para custo explicitamente indisponível em USD. */
  latestQuote(): PriceQuote | null {
    return this.quote;
  }
}
