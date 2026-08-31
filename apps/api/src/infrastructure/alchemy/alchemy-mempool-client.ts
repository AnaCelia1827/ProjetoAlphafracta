import type WebSocket from 'ws';

import type { PendingBid, TransactionHash } from '../../domain/fees/models.js';
import type { MempoolSource } from '../../domain/fees/ports.js';
import type { Clock } from '../../domain/shared/clock.js';
import { ReconnectingWebSocket } from './reconnecting-websocket.js';

/**
 * Camada: infraestrutura Alchemy.
 *
 * Assina transações pendentes, normaliza somente campos de taxa necessários e
 * deduplica por hash em memória. Mensagens malformadas são descartadas para que
 * um frame inválido não interrompa o fluxo de monitoramento.
 */
/** Configura o WebSocket da mempool e sua política de reconexão. */
export interface AlchemyMempoolClientOptions {
  wsUrl: string;
  clock: Clock;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  heartbeatMs?: number;
}

/** Subconjunto não confiável da transação pendente recebido pela assinatura. */
interface PendingTransactionPayload {
  hash?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasPrice?: string;
}

/** Converte quantidade RPC não negativa, omitindo valores ausentes ou ilegíveis. */
function quantity(value: string | undefined): bigint | undefined {
  if (value === undefined) return undefined;
  try {
    const parsed = BigInt(value);
    return parsed >= 0n ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Fonte de mempool em memória que implementa a porta pura do domínio. */
export class AlchemyMempoolClient implements MempoolSource {
  private readonly bids = new Map<TransactionHash, PendingBid>();
  private readonly socket: ReconnectingWebSocket;
  private lastUpdatedAt: Date | null = null;

  /** Configura assinatura pendente e encaminha frames para a normalização segura. */
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

  /** Inicia a conexão e a assinatura após o runtime estar pronto. */
  start(): void {
    this.socket.start();
  }

  /** Encerra conexão e timers sem apagar a amostra já coletada. */
  stop(): void {
    this.socket.stop();
  }

  /**
   * Descarta amostras vencidas e devolve lances ordenados pelo instante de
   * observação, preservando a janela solicitada pelo domínio.
   */
  getPendingBids(since: Date): PendingBid[] {
    for (const [hash, bid] of this.bids) {
      if (bid.observedAt < since) this.bids.delete(hash);
    }
    return [...this.bids.values()].sort(
      (left, right) => left.observedAt.getTime() - right.observedAt.getTime(),
    );
  }

  /** Informa a última mensagem válida que tornou a fonte utilizável. */
  updatedAt(): Date | null {
    return this.lastUpdatedAt;
  }

  /**
   * Valida e normaliza um frame de assinatura; exceções de JSON são isoladas
   * porque um único payload ruim não deve derrubar um socket que será reutilizado.
   */
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
