/**
 * Teste de infraestrutura Coinbase: confirma inscrição ETH/USD e descarte de
 * ticker inválido usando WebSocket efêmero sem comunicar serviço externo.
 */
import { describe, expect, it, vi } from 'vitest';
import { WebSocketServer } from 'ws';

import * as coinbaseModule from '../../src/infrastructure/coinbase/coinbase-price-client.js';

const now = new Date('2026-08-30T18:42:15.000Z');

describe('CoinbasePriceClient', () => {
  it('subscribes to ETH-USD ticker and updates only from valid prices', async () => {
    expect(coinbaseModule).toHaveProperty('CoinbasePriceClient');
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
        socket.send(JSON.stringify({ type: 'ticker', product_id: 'ETH-USD', price: '3420.25' }));
        socket.send(JSON.stringify({ type: 'ticker', product_id: 'ETH-USD', price: 'invalid' }));
      });
    });

    const Client = (
      coinbaseModule as unknown as {
        CoinbasePriceClient: new (options: object) => {
          start(): void;
          stop(): void;
          latestQuote(): object | null;
        };
      }
    ).CoinbasePriceClient;
    const client = new Client({
      wsUrl,
      clock: { now: () => now },
      reconnectBaseDelayMs: 5,
      reconnectMaxDelayMs: 10,
      heartbeatMs: 1_000,
    });
    client.start();

    await vi.waitFor(() => expect(client.latestQuote()).not.toBeNull());
    expect(subscription).toEqual({
      type: 'subscribe',
      product_ids: ['ETH-USD'],
      channels: ['ticker'],
    });
    expect(client.latestQuote()).toEqual({
      ethUsd: { numerator: 13681n, denominator: 4n },
      updatedAt: now,
    });

    client.stop();
    await new Promise<void>((resolve) => webSocketServer.close(() => resolve()));
  });
});
