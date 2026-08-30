import type WebSocket from 'ws';

import type { PendingBid, TransactionHash } from '../../domain/fees/models.js';
import type { MempoolSource } from '../../domain/fees/ports.js';
import type { Clock } from '../../domain/shared/clock.js';
import { ReconnectingWebSocket } from './reconnecting-websocket.js';

export interface AlchemyMempoolClientOptions {
  wsUrl: string;
  clock: Clock;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  heartbeatMs?: number;
}

interface PendingTransactionPayload {
  hash?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasPrice?: string;
}

function quantity(value: string | undefined): bigint | undefined {
  if (value === undefined) return undefined;
  try {
    const parsed = BigInt(value);
    return parsed >= 0n ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export class AlchemyMempoolClient implements MempoolSource {
  private readonly bids = new Map<TransactionHash, PendingBid>();
  private readonly socket: ReconnectingWebSocket;
  private lastUpdatedAt: Date | null = null;

  constructor(private readonly options: AlchemyMempoolClientOptions) {
    this.socket = new ReconnectingWebSocket({
      url: options.wsUrl,
      reconnectBaseDelayMs: options.reconnectBaseDelayMs,
      reconnectMaxDelayMs: options.reconnectMaxDelayMs,
      heartbeatMs: options.heartbeatMs,
      onOpen: (socket: WebSocket) => {
        socket.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_subscribe',
            params: ['alchemy_pendingTransactions', { hashesOnly: false }],
          }),
        );
      },
      onMessage: (message) => this.receive(message),
    });
  }

  start(): void {
    this.socket.start();
  }

  stop(): void {
    this.socket.stop();
  }

  getPendingBids(since: Date): PendingBid[] {
    for (const [hash, bid] of this.bids) {
      if (bid.observedAt < since) this.bids.delete(hash);
    }
    return [...this.bids.values()].sort(
      (left, right) => left.observedAt.getTime() - right.observedAt.getTime(),
    );
  }

  updatedAt(): Date | null {
    return this.lastUpdatedAt;
  }

  private receive(message: string): void {
    try {
      const payload = JSON.parse(message) as {
        method?: string;
        params?: { result?: PendingTransactionPayload };
      };
      if (payload.method !== 'eth_subscription') return;
      const transaction = payload.params?.result;
      if (transaction?.hash === undefined || !/^0x[a-fA-F0-9]{64}$/.test(transaction.hash)) {
        return;
      }

      const observedAt = this.options.clock.now();
      const hash = transaction.hash as TransactionHash;
      const maxFeePerGasWei = quantity(transaction.maxFeePerGas);
      const maxPriorityFeePerGasWei = quantity(transaction.maxPriorityFeePerGas);
      const gasPriceWei = quantity(transaction.gasPrice);
      let bid: PendingBid | null = null;

      if (maxFeePerGasWei !== undefined && maxPriorityFeePerGasWei !== undefined) {
        bid = {
          hash,
          observedAt,
          kind: 'eip1559',
          maxFeePerGasWei,
          maxPriorityFeePerGasWei,
        };
      } else if (gasPriceWei !== undefined) {
        bid = { hash, observedAt, kind: 'legacy', gasPriceWei };
      }
      if (bid === null) return;

      this.bids.set(hash, bid);
      this.lastUpdatedAt = observedAt;
    } catch {
      return;
    }
  }
}
