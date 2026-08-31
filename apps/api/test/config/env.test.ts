/**
 * Testes de configuração: garantem defaults seguros e rejeitam protocolos,
 * origens e valores de ambiente que gerariam runtime parcialmente configurado.
 */
import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config/env.js';

const required = {
  ALCHEMY_HTTP_URL: 'https://eth-mainnet.g.alchemy.com/v2/test-key',
  ALCHEMY_WS_URL: 'wss://eth-mainnet.g.alchemy.com/v2/test-key',
  CORS_ORIGINS: 'http://localhost:3000, https://app.alphractal.test',
};

describe('loadConfig', () => {
  it('loads required sources and approved defaults', () => {
    expect(loadConfig(required)).toEqual({
      PORT: 3001,
      ...required,
      COINBASE_WS_URL: 'wss://ws-feed.exchange.coinbase.com',
      CORS_ORIGINS: ['http://localhost:3000', 'https://app.alphractal.test'],
      FEE_INTERVAL_MS: 5_000,
      SSE_HEARTBEAT_MS: 15_000,
      PROVIDER_REQUEST_TIMEOUT_MS: 10_000,
    });
  });

  it('accepts optional Mongo and Coinbase overrides', () => {
    const result = loadConfig({
      ...required,
      MONGODB_URI: 'mongodb://localhost:27017/alphractal',
      COINBASE_WS_URL: 'wss://coinbase.example.test/feed',
      PORT: '43123',
      PROVIDER_REQUEST_TIMEOUT_MS: '2500',
    });

    expect(result).toMatchObject({
      PORT: 43_123,
      MONGODB_URI: 'mongodb://localhost:27017/alphractal',
      COINBASE_WS_URL: 'wss://coinbase.example.test/feed',
      PROVIDER_REQUEST_TIMEOUT_MS: 2_500,
    });
  });

  it.each([
    [{ ...required, ALCHEMY_HTTP_URL: 'http://alchemy.test/key' }],
    [{ ...required, ALCHEMY_WS_URL: 'ws://alchemy.test/key' }],
    [{ ...required, COINBASE_WS_URL: 'https://coinbase.test/feed' }],
    [{ ...required, CORS_ORIGINS: '*' }],
    [{ ...required, CORS_ORIGINS: 'https://app.test/path' }],
    [{ ...required, CORS_ORIGINS: '' }],
    [{ ALCHEMY_HTTP_URL: required.ALCHEMY_HTTP_URL, CORS_ORIGINS: 'https://app.test' }],
  ])('rejects insecure or missing source configuration %#', (environment) => {
    expect(() => loadConfig(environment)).toThrow();
  });

  it.each(['', 'not-a-url', 'mongodb://', 'https://example.com/alphractal'])(
    'rejects a malformed supplied MONGODB_URI: %s',
    (MONGODB_URI) => {
      expect(() => loadConfig({ ...required, MONGODB_URI })).toThrow();
    },
  );
});
