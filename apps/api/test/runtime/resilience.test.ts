/**
 * Testes de resiliência do runtime: garantem start/stop idempotente, recuperação
 * de MongoDB e continuidade last-known quando fontes Ethereum falham depois do boot.
 */
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  EthereumProviderUnavailableError,
  PersistenceUnavailableError,
} from '../../src/application/common/errors.js';
import type {
  BlockIdentifier,
  FinalityHead,
  NormalizedBlock,
} from '../../src/domain/blocks/models.js';
import { FeeHistoryUnavailableError } from '../../src/domain/fees/fee-trend.js';
import type { AppConfig } from '../../src/config/env.js';
import {
  createRuntime,
  redactConnectionUrl,
  UnavailableBlockRepository,
  type RuntimeAdapters,
} from '../../src/runtime.js';
import { FakeFeeSnapshotRepository, FakeObservedBlockRepository } from '../helpers/fakes.js';
import { FIXED_NOW, normalizedBlock, pendingBid } from '../helpers/fixtures.js';

const config: AppConfig = {
  PORT: 3001,
  ALCHEMY_HTTP_URL: 'https://user:secret@alchemy.example.test/v2/private-key',
  ALCHEMY_WS_URL: 'wss://user:secret@alchemy.example.test/v2/private-key',
  COINBASE_WS_URL: 'wss://ws-feed.exchange.coinbase.com',
  CORS_ORIGINS: ['https://app.alphractal.test'],
  FEE_INTERVAL_MS: 5_000,
  SSE_HEARTBEAT_MS: 15_000,
  PROVIDER_REQUEST_TIMEOUT_MS: 10_000,
};

/** Monta todos os adaptadores do runtime e permite programar falhas transitórias. */
function adapters(options: { mongoFailsOnce?: boolean; alchemyFailsAfterStart?: boolean } = {}) {
  const feeRepository = new FakeFeeSnapshotRepository();
  const blockRepository = new FakeObservedBlockRepository();
  let mongoAvailable = !options.mongoFailsOnce;
  if (!mongoAvailable) {
    feeRepository.available = false;
    feeRepository.historyError = new FeeHistoryUnavailableError();
    blockRepository.available = false;
    blockRepository.error = new PersistenceUnavailableError();
  }
  let connectAttempts = 0;
  const mongo = {
    connect: vi.fn(async () => {
      connectAttempts += 1;
      if (options.mongoFailsOnce && connectAttempts === 1) {
        throw new PersistenceUnavailableError();
      }
      mongoAvailable = true;
      feeRepository.available = true;
      feeRepository.historyError = null;
      blockRepository.available = true;
      blockRepository.error = null;
    }),
    close: vi.fn(async () => {
      mongoAvailable = false;
    }),
    isAvailable: vi.fn(() => mongoAvailable),
  };
  const blocks = new Map<string, NormalizedBlock>();
  for (let number = 20_000_000n; number <= 20_000_019n; number += 1n) {
    blocks.set(String(number), normalizedBlock(number));
  }
  let headListener: ((head: FinalityHead) => void) | null = null;
  let feeCalls = 0;
  const blockSource = {
    getBlock: vi.fn(async (identifier: BlockIdentifier) => blocks.get(String(identifier)) ?? null),
    getLatestBlockNumber: vi.fn(async () => 20_000_019n),
    getFinalityHeads: vi.fn(async () => ({
      safe: { number: 20_000_018n, hash: normalizedBlock(20_000_018n).hash },
      finalized: { number: 20_000_017n, hash: normalizedBlock(20_000_017n).hash },
    })),
    start: vi.fn((listener: (head: FinalityHead) => void) => {
      headListener = listener;
    }),
    stop: vi.fn(),
  };
  const runtimeAdapters: RuntimeAdapters = {
    clock: { now: () => FIXED_NOW },
    mongo,
    feeRepository: Object.assign(feeRepository, { initialize: vi.fn(async () => undefined) }),
    blockRepository: Object.assign(blockRepository, { initialize: vi.fn(async () => undefined) }),
    ethereumFeeSource: {
      getFeeEvidence: vi.fn(async () => {
        feeCalls += 1;
        if (options.alchemyFailsAfterStart && feeCalls > 1) {
          throw new EthereumProviderUnavailableError();
        }
        return {
          latestBaseFeeWei: 30_000_000_000n,
          projectedNextBaseFeeWei: 30_000_000_000n,
          historicalRewardP60Wei: [1_000_000_000n],
          ethereumUpdatedAt: FIXED_NOW,
        };
      }),
    },
    mempoolSource: {
      getPendingBids: vi.fn(() => [pendingBid(1)]),
      updatedAt: vi.fn(() => FIXED_NOW),
      start: vi.fn(),
      stop: vi.fn(),
    },
    priceSource: {
      latestQuote: vi.fn(() => null),
      start: vi.fn(),
      stop: vi.fn(),
    },
    blockSource,
  };
  return {
    runtimeAdapters,
    feeRepository,
    blockRepository,
    mongo,
    blockSource,
    headListener: () => headListener,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('runtime resilience', () => {
  it('rejects block history when MongoDB is not configured', async () => {
    const repository = new UnavailableBlockRepository();

    await expect(repository.findPage({ limit: 10 })).rejects.toBeInstanceOf(
      PersistenceUnavailableError,
    );
  });

  it('redacts credentials, paths and query strings from configured URLs', () => {
    expect(redactConnectionUrl(config.ALCHEMY_HTTP_URL)).toBe(
      'https://alchemy.example.test/[redacted]',
    );
    expect(
      redactConnectionUrl('mongodb://user:password@mongo.test:27017/db?authSource=admin'),
    ).toBe('mongodb://mongo.test:27017/[redacted]');
  });

  it('starts sources, restores state, serves degraded price and stops once', async () => {
    vi.useFakeTimers();
    const context = adapters();
    const runtime = createRuntime(config, { adapters: context.runtimeAdapters });

    await runtime.start();
    const current = await request(runtime.app).get('/api/v1/fees/current');
    const recent = await request(runtime.app).get('/api/v1/blocks/recent');

    expect(current.status).toBe(200);
    expect(current.body.data).toMatchObject({
      recommendationState: 'current',
      estimatedTransferCost: { status: 'unavailable' },
      status: { price: 'unavailable', persistence: 'available' },
    });
    expect(recent.status).toBe(200);
    expect(recent.body.data).toHaveLength(20);
    expect(context.mongo.connect).toHaveBeenCalledTimes(1);
    expect(context.blockSource.start).toHaveBeenCalledTimes(1);

    await runtime.stop();
    await runtime.stop();
    expect(context.runtimeAdapters.mempoolSource.stop).toHaveBeenCalledTimes(1);
    expect(context.runtimeAdapters.priceSource.stop).toHaveBeenCalledTimes(1);
    expect(context.blockSource.stop).toHaveBeenCalledTimes(1);
    expect(context.mongo.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts without Mongo, reconnects it and resumes persistence', async () => {
    vi.useFakeTimers();
    const context = adapters({ mongoFailsOnce: true });
    const runtime = createRuntime(
      { ...config, MONGODB_URI: 'mongodb://mongo.test/db' },
      { adapters: context.runtimeAdapters },
    );

    await runtime.start();
    const degraded = await request(runtime.app).get('/api/v1/fees/current');
    expect(degraded.body.data.status.persistence).toBe('degraded');
    expect(context.feeRepository.inserted).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(context.mongo.connect).toHaveBeenCalledTimes(2);
    expect(context.feeRepository.inserted.length).toBeGreaterThan(0);
    const recovered = await request(runtime.app).get('/api/v1/fees/current');
    expect(recovered.body.data.status.persistence).toBe('available');
    await runtime.stop();
  });

  it('keeps last-known values and live infrastructure when Alchemy polling fails', async () => {
    vi.useFakeTimers();
    const context = adapters({ alchemyFailsAfterStart: true });
    const runtime = createRuntime(config, { adapters: context.runtimeAdapters });
    await runtime.start();

    await vi.advanceTimersByTimeAsync(5_000);
    const current = await request(runtime.app).get('/api/v1/fees/current');

    expect(current.body.data).toMatchObject({
      recommendationState: 'last-known',
      confidence: { level: 'unavailable' },
    });
    expect(context.blockSource.stop).not.toHaveBeenCalled();
    expect(context.runtimeAdapters.mempoolSource.stop).not.toHaveBeenCalled();
    await runtime.stop();
  });
});
