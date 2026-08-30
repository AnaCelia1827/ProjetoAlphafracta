import { createPublicClient, http, numberToHex } from 'viem';
import { mainnet } from 'viem/chains';
import type WebSocket from 'ws';

import type {
  BlockHash,
  BlockIdentifier,
  FinalityHead,
  FinalityHeads,
  NormalizedBlock,
  NormalizedBlockTransaction,
} from '../../domain/blocks/models.js';
import type { EthereumBlockSource } from '../../domain/blocks/ports.js';
import { AlchemyProviderUnavailableError } from './alchemy-errors.js';
import { ReconnectingWebSocket } from './reconnecting-websocket.js';

interface RpcTransaction {
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasPrice?: string;
}

interface RpcBlock {
  number: string | null;
  hash: string | null;
  timestamp: string;
  baseFeePerGas?: string | null;
  gasUsed: string;
  gasLimit: string;
  transactions: Array<string | RpcTransaction>;
}

export interface AlchemyBlockClientOptions {
  httpUrl: string;
  wsUrl?: string;
  timeoutMs: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  heartbeatMs?: number;
}

function parseQuantity(value: string): bigint {
  return BigInt(value);
}

function normalizeTransaction(
  transaction: string | RpcTransaction,
): NormalizedBlockTransaction | null {
  if (typeof transaction === 'string') return null;
  if (transaction.maxFeePerGas !== undefined && transaction.maxPriorityFeePerGas !== undefined) {
    return {
      kind: 'eip1559',
      maxFeePerGasWei: parseQuantity(transaction.maxFeePerGas),
      maxPriorityFeePerGasWei: parseQuantity(transaction.maxPriorityFeePerGas),
    };
  }
  if (transaction.gasPrice !== undefined) {
    return {
      kind: 'legacy',
      gasPriceWei: parseQuantity(transaction.gasPrice),
    };
  }
  return null;
}

function normalizeBlock(block: RpcBlock): NormalizedBlock {
  if (block.number === null || block.hash === null || !/^0x[a-fA-F0-9]{64}$/.test(block.hash)) {
    throw new AlchemyProviderUnavailableError();
  }

  return {
    number: parseQuantity(block.number),
    hash: block.hash as BlockHash,
    timestamp: new Date(Number(parseQuantity(block.timestamp)) * 1_000),
    baseFeePerGasWei:
      block.baseFeePerGas === undefined || block.baseFeePerGas === null
        ? null
        : parseQuantity(block.baseFeePerGas),
    gasUsed: parseQuantity(block.gasUsed),
    gasLimit: parseQuantity(block.gasLimit),
    transactions: block.transactions
      .map(normalizeTransaction)
      .filter((transaction): transaction is NormalizedBlockTransaction => transaction !== null),
  };
}

function normalizeHead(block: RpcBlock): FinalityHead {
  const normalized = normalizeBlock({ ...block, transactions: [] });
  return { number: normalized.number, hash: normalized.hash };
}

export class AlchemyBlockClient implements EthereumBlockSource {
  private readonly client;
  private headSocket: ReconnectingWebSocket | null = null;

  constructor(private readonly options: AlchemyBlockClientOptions) {
    this.client = createPublicClient({
      chain: mainnet,
      transport: http(options.httpUrl, { timeout: options.timeoutMs }),
    });
  }

  async getBlock(identifier: BlockIdentifier): Promise<NormalizedBlock | null> {
    try {
      const block =
        typeof identifier === 'bigint'
          ? await this.client.request({
              method: 'eth_getBlockByNumber',
              params: [numberToHex(identifier), true],
            })
          : await this.client.request({
              method: 'eth_getBlockByHash',
              params: [identifier, true],
            });
      return block === null ? null : normalizeBlock(block as unknown as RpcBlock);
    } catch (error) {
      if (error instanceof AlchemyProviderUnavailableError) throw error;
      throw new AlchemyProviderUnavailableError();
    }
  }

  async getLatestBlockNumber(): Promise<bigint> {
    try {
      return await this.client.getBlockNumber({ cacheTime: 0 });
    } catch {
      throw new AlchemyProviderUnavailableError();
    }
  }

  async getFinalityHeads(): Promise<FinalityHeads> {
    try {
      const [safe, finalized] = await Promise.all([
        this.client.request({
          method: 'eth_getBlockByNumber',
          params: ['safe', false],
        }),
        this.client.request({
          method: 'eth_getBlockByNumber',
          params: ['finalized', false],
        }),
      ]);
      if (safe === null || finalized === null) {
        throw new AlchemyProviderUnavailableError();
      }
      return {
        safe: normalizeHead(safe as unknown as RpcBlock),
        finalized: normalizeHead(finalized as unknown as RpcBlock),
      };
    } catch (error) {
      if (error instanceof AlchemyProviderUnavailableError) throw error;
      throw new AlchemyProviderUnavailableError();
    }
  }

  start(onHead: (head: FinalityHead) => void): void {
    if (this.options.wsUrl === undefined || this.headSocket !== null) return;
    this.headSocket = new ReconnectingWebSocket({
      url: this.options.wsUrl,
      reconnectBaseDelayMs: this.options.reconnectBaseDelayMs,
      reconnectMaxDelayMs: this.options.reconnectMaxDelayMs,
      heartbeatMs: this.options.heartbeatMs,
      onOpen: (socket: WebSocket) => {
        socket.send(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_subscribe',
            params: ['newHeads'],
          }),
        );
      },
      onMessage: (message) => {
        try {
          const payload = JSON.parse(message) as {
            method?: string;
            params?: { result?: { number?: string; hash?: string } };
          };
          const result = payload.params?.result;
          if (
            payload.method !== 'eth_subscription' ||
            result?.number === undefined ||
            result.hash === undefined ||
            !/^0x[a-fA-F0-9]{64}$/.test(result.hash)
          ) {
            return;
          }
          onHead({
            number: parseQuantity(result.number),
            hash: result.hash as BlockHash,
          });
        } catch {
          return;
        }
      },
    });
    this.headSocket.start();
  }

  stop(): void {
    this.headSocket?.stop();
    this.headSocket = null;
  }
}
