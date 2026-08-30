import type WebSocket from 'ws';

import type { PriceQuote } from '../../domain/fees/models.js';
import type { PriceSource } from '../../domain/fees/ports.js';
import type { Clock } from '../../domain/shared/clock.js';
import { decimalStringToRational } from '../../domain/shared/units.js';
import { ReconnectingWebSocket } from '../alchemy/reconnecting-websocket.js';

export interface CoinbasePriceClientOptions {
  wsUrl: string;
  clock: Clock;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  heartbeatMs?: number;
}

export class CoinbasePriceClient implements PriceSource {
  private quote: PriceQuote | null = null;
  private readonly socket: ReconnectingWebSocket;

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

  start(): void {
    this.socket.start();
  }

  stop(): void {
    this.socket.stop();
  }

  latestQuote(): PriceQuote | null {
    return this.quote;
  }
}
