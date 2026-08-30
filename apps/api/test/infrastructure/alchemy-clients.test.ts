import { createServer, type Server } from 'node:http';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';

import * as blockModule from '../../src/infrastructure/alchemy/alchemy-block-client.js';
import * as feeModule from '../../src/infrastructure/alchemy/alchemy-fee-client.js';
import * as mempoolModule from '../../src/infrastructure/alchemy/alchemy-mempool-client.js';

const hash = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const from = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const to = '0xcccccccccccccccccccccccccccccccccccccccc';
const now = new Date('2026-08-30T18:42:15.000Z');

interface RpcRequest {
  id: number;
  method: string;
  params: unknown[];
}

const requests: RpcRequest[] = [];
let httpServer: Server;
let httpUrl: string;

function rpcResult(request: RpcRequest): unknown {
  if (request.method === 'eth_feeHistory') {
    return {
      oldestBlock: '0x1',
      baseFeePerGas: [
        '0x5b',
        '0x5c',
        '0x5d',
        '0x5e',
        '0x5f',
        '0x60',
        '0x61',
        '0x62',
        '0x63',
        '0x64',
        '0x78',
      ],
      gasUsedRatio: Array.from({ length: 10 }, () => 0.5),
      reward: Array.from({ length: 10 }, (_, index) => [`0x${(index + 1).toString(16)}`]),
    };
  }
  if (request.method === 'eth_blockNumber') return '0x0a';
  if (request.method === 'eth_getBlockByNumber') {
    const tag = request.params[0];
    if (tag === 'safe') return rpcBlock('0x09', hash, false);
    if (tag === 'finalized') return rpcBlock('0x08', hash, false);
    return rpcBlock(String(tag), hash, request.params[1] === true);
  }
  if (request.method === 'eth_getBlockByHash') {
    return rpcBlock('0x0a', String(request.params[0]), request.params[1] === true);
  }
  throw new Error(`Unexpected RPC method ${request.method}`);
}

function rpcBlock(number: string, blockHash: string, includeTransactions: boolean) {
  return {
    number,
    hash: blockHash,
    timestamp: '0x68b497e7',
    baseFeePerGas: '0x64',
    gasUsed: '0x4b',
    gasLimit: '0x64',
    transactions: includeTransactions
      ? [
          {
            hash,
            type: '0x2',
            from,
            to,
            gas: '0x5208',
            value: '0x0',
            input: '0x',
            nonce: '0x1',
            maxFeePerGas: '0x78',
            maxPriorityFeePerGas: '0x5',
          },
          {
            hash: hash.replace(/a/g, 'd'),
            type: '0x0',
            from,
            to,
            gas: '0x5208',
            value: '0x0',
            input: '0x',
            nonce: '0x2',
            gasPrice: '0x70',
          },
        ]
      : [],
  };
}

beforeAll(async () => {
  httpServer = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const rpc = JSON.parse(Buffer.concat(chunks).toString('utf8')) as RpcRequest;
      requests.push(rpc);
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: rpcResult(rpc) }));
    });
  });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  if (address === null || typeof address === 'string') throw new Error('Missing test HTTP address');
  httpUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    httpServer.close((error) => (error ? reject(error) : resolve())),
  );
});

describe('AlchemyFeeClient', () => {
  it('requests ten blocks at P60 and uses the final two base-fee entries', async () => {
    expect(feeModule).toHaveProperty('AlchemyFeeClient');
    const Client = (
      feeModule as unknown as {
        AlchemyFeeClient: new (options: object) => { getFeeEvidence(): Promise<object> };
      }
    ).AlchemyFeeClient;
    const client = new Client({ httpUrl, clock: { now: () => now }, timeoutMs: 1_000 });
    const evidence = await client.getFeeEvidence();

    expect(requests.at(-1)).toMatchObject({
      method: 'eth_feeHistory',
      params: ['0xa', 'latest', [60]],
    });
    expect(evidence).toEqual({
      latestBaseFeeWei: 100n,
      projectedNextBaseFeeWei: 120n,
      historicalRewardP60Wei: [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 10n],
      ethereumUpdatedAt: now,
    });
  });
});

describe('AlchemyBlockClient', () => {
  it('loads full blocks by number or hash and normalizes their transactions', async () => {
    expect(blockModule).toHaveProperty('AlchemyBlockClient');
    const Client = (
      blockModule as unknown as {
        AlchemyBlockClient: new (options: object) => {
          getBlock(identifier: bigint | string): Promise<Record<string, unknown>>;
        };
      }
    ).AlchemyBlockClient;
    const client = new Client({ httpUrl, timeoutMs: 1_000 });

    const byNumber = await client.getBlock(10n);
    const byHash = await client.getBlock(hash);

    expect(requests.slice(-2)).toEqual([
      expect.objectContaining({ method: 'eth_getBlockByNumber', params: ['0xa', true] }),
      expect.objectContaining({ method: 'eth_getBlockByHash', params: [hash, true] }),
    ]);
    expect(byNumber).toMatchObject({
      number: 10n,
      hash,
      baseFeePerGasWei: 100n,
      gasUsed: 75n,
      gasLimit: 100n,
      transactions: [
        { kind: 'eip1559', maxFeePerGasWei: 120n, maxPriorityFeePerGasWei: 5n },
        { kind: 'legacy', gasPriceWei: 112n },
      ],
    });
    expect(byHash).toMatchObject({ number: 10n, hash });
  });

  it('reads latest, safe and finalized references', async () => {
    const Client = (
      blockModule as unknown as {
        AlchemyBlockClient: new (options: object) => {
          getLatestBlockNumber(): Promise<bigint>;
          getFinalityHeads(): Promise<object>;
        };
      }
    ).AlchemyBlockClient;
    const client = new Client({ httpUrl, timeoutMs: 1_000 });

    expect(await client.getLatestBlockNumber()).toBe(10n);
    expect(await client.getFinalityHeads()).toEqual({
      safe: { number: 9n, hash },
      finalized: { number: 8n, hash },
    });
  });

  it('subscribes to new canonical heads', async () => {
    const webSocketServer = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => webSocketServer.once('listening', resolve));
    const address = webSocketServer.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Missing test WebSocket address');
    }
    const wsUrl = `ws://127.0.0.1:${address.port}`;
    let subscription: unknown;

    webSocketServer.once('connection', (socket) => {
      socket.once('message', (message) => {
        subscription = JSON.parse(message.toString());
        socket.send(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_subscription',
            params: { subscription: '0x2', result: { number: '0x0a', hash } },
          }),
        );
      });
    });

    const Client = (
      blockModule as unknown as {
        AlchemyBlockClient: new (options: object) => {
          start(onHead: (head: object) => void): void;
          stop(): void;
        };
      }
    ).AlchemyBlockClient;
    const client = new Client({
      httpUrl,
      wsUrl,
      timeoutMs: 1_000,
      reconnectBaseDelayMs: 5,
      reconnectMaxDelayMs: 10,
      heartbeatMs: 1_000,
    });
    const onHead = vi.fn();
    client.start(onHead);

    await vi.waitFor(() => expect(onHead).toHaveBeenCalledWith({ number: 10n, hash }));
    expect(subscription).toMatchObject({
      method: 'eth_subscribe',
      params: ['newHeads'],
    });

    client.stop();
    await new Promise<void>((resolve) => webSocketServer.close(() => resolve()));
  });
});

describe('AlchemyMempoolClient', () => {
  it('resubscribes, keeps valid normalized bids and expires the rolling window', async () => {
    expect(mempoolModule).toHaveProperty('AlchemyMempoolClient');
    const webSocketServer = new WebSocketServer({ port: 0 });
    await new Promise<void>((resolve) => webSocketServer.once('listening', resolve));
    const address = webSocketServer.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Missing test WebSocket address');
    }
    const wsUrl = `ws://127.0.0.1:${address.port}`;
    const subscriptions: unknown[] = [];
    let connectionCount = 0;

    webSocketServer.on('connection', (socket) => {
      connectionCount += 1;
      socket.once('message', (message) => {
        subscriptions.push(JSON.parse(message.toString()));
        if (connectionCount === 1) {
          socket.close();
          return;
        }
        socket.send(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_subscription',
            params: {
              subscription: '0x1',
              result: {
                hash,
                maxFeePerGas: '0x78',
                maxPriorityFeePerGas: '0x5',
              },
            },
          }),
        );
        socket.send(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_subscription',
            params: { subscription: '0x1', result: { hash: 'bad', gasPrice: '0x70' } },
          }),
        );
      });
    });

    const Client = (
      mempoolModule as unknown as {
        AlchemyMempoolClient: new (options: object) => {
          start(): void;
          stop(): void;
          getPendingBids(since: Date): unknown[];
          updatedAt(): Date | null;
        };
      }
    ).AlchemyMempoolClient;
    let clockNow = now;
    const client = new Client({
      wsUrl,
      clock: { now: () => clockNow },
      reconnectBaseDelayMs: 5,
      reconnectMaxDelayMs: 10,
      heartbeatMs: 1_000,
    });
    client.start();

    await vi.waitFor(() => expect(client.getPendingBids(new Date(0))).toHaveLength(1));
    expect(subscriptions).toHaveLength(2);
    expect(subscriptions[0]).toMatchObject({
      method: 'eth_subscribe',
      params: ['alchemy_pendingTransactions', { hashesOnly: false }],
    });
    expect(client.updatedAt()).toEqual(now);

    clockNow = new Date(now.getTime() + 30_001);
    expect(client.getPendingBids(new Date(clockNow.getTime() - 30_000))).toEqual([]);

    client.stop();
    await new Promise<void>((resolve) => webSocketServer.close(() => resolve()));
  });
});
