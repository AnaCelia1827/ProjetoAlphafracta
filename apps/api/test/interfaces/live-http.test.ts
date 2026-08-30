import {
  ApiErrorSchema,
  BlockResponseSchema,
  FeeCurrentResponseSchema,
  FeeHistoryResponseSchema,
  RecentBlocksResponseSchema,
} from '@alphractal/contracts';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import {
  BlockNotFoundError,
  BlocksUnavailableError,
  EthereumProviderUnavailableError,
  HistoryUnavailableError,
  PreEip1559BlockUnsupportedError,
  SnapshotUnavailableError,
} from '../../src/application/common/errors.js';
import { createApp, type ApiDependencies } from '../../src/app.js';
import { blockSummary, feeSnapshot, FIXED_NOW } from '../helpers/fixtures.js';

function dependencies(): ApiDependencies {
  return {
    corsOrigins: new Set(['https://app.alphractal.test']),
    getCurrentFeeSnapshot: { execute: vi.fn(async () => feeSnapshot()) },
    getFeeHistory: {
      execute: vi.fn(async () => ({ data: [feeSnapshot()], nextCursor: 'next-page' })),
    },
    getRecentBlocks: { execute: vi.fn(async () => [blockSummary(20_000_001n)]) },
    getBlockByIdentifier: { execute: vi.fn(async () => blockSummary(20_000_000n)) },
    liveSseHub: { handle: vi.fn((_request, response) => response.status(200).end()) },
  };
}

function expectRestHeaders(response: request.Response): void {
  expect(response.headers['x-request-id']).toEqual(expect.any(String));
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['content-type']).toMatch(/^application\/json/);
}

describe('live monitor REST API', () => {
  it('serves the current snapshot through the executable contract', async () => {
    const response = await request(createApp(dependencies())).get('/api/v1/fees/current');

    expect(response.status).toBe(200);
    expectRestHeaders(response);
    expect(FeeCurrentResponseSchema.parse(response.body).data).toMatchObject({
      timestamp: FIXED_NOW.toISOString(),
      metadata: { network: 'ethereum-mainnet' },
      recommendedMaxFeeGwei: 35.75,
    });
  });

  it('validates history query, applies limit=1000 and serializes pagination', async () => {
    const input = dependencies();
    const response = await request(createApp(input)).get('/api/v1/fees/history').query({
      from: '2026-08-29T00:00:00.000Z',
      to: '2026-08-30T00:00:00.000Z',
    });

    expect(response.status).toBe(200);
    expect(FeeHistoryResponseSchema.parse(response.body).page).toEqual({
      nextCursor: 'next-page',
      hasMore: true,
    });
    expect(input.getFeeHistory.execute).toHaveBeenCalledWith({
      from: new Date('2026-08-29T00:00:00.000Z'),
      to: new Date('2026-08-30T00:00:00.000Z'),
      limit: 1000,
    });
  });

  it.each([
    ['/api/v1/fees/history?from=nope&to=2026-08-30T00:00:00.000Z', 'INVALID_QUERY'],
    [
      '/api/v1/fees/history?from=2026-08-30T00:00:00.000Z&to=2026-08-29T00:00:00.000Z',
      'INVALID_TIME_RANGE',
    ],
  ])('returns a stable validation error for %s', async (url, code) => {
    const response = await request(createApp(dependencies())).get(url);

    expect(response.status).toBe(400);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe(code);
    expectRestHeaders(response);
  });

  it('serializes recent and searched blocks from the same representation', async () => {
    const app = createApp(dependencies());
    const recent = await request(app).get('/api/v1/blocks/recent');
    const searched = await request(app).get('/api/v1/blocks/20000000');

    expect(recent.status).toBe(200);
    expect(RecentBlocksResponseSchema.parse(recent.body).data[0]).toMatchObject({
      number: '20000001',
      etherscanUrl: 'https://etherscan.io/block/20000001',
    });
    expect(searched.status).toBe(200);
    expect(BlockResponseSchema.parse(searched.body).data.number).toBe('20000000');
  });

  it('rejects a malformed block identifier before calling the use case', async () => {
    const input = dependencies();
    const response = await request(createApp(input)).get('/api/v1/blocks/latest');

    expect(response.status).toBe(400);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe('INVALID_BLOCK_IDENTIFIER');
    expect(input.getBlockByIdentifier.execute).not.toHaveBeenCalled();
  });

  it.each([
    ['/api/v1/fees/current', new SnapshotUnavailableError(), 503, 'SNAPSHOT_UNAVAILABLE'],
    ['/api/v1/fees/history', new HistoryUnavailableError(), 503, 'HISTORY_UNAVAILABLE'],
    ['/api/v1/blocks/recent', new BlocksUnavailableError(), 503, 'BLOCKS_UNAVAILABLE'],
    ['/api/v1/blocks/20000000', new BlockNotFoundError(), 404, 'BLOCK_NOT_FOUND'],
    [
      '/api/v1/blocks/12964999',
      new PreEip1559BlockUnsupportedError(),
      422,
      'PRE_EIP1559_BLOCK_UNSUPPORTED',
    ],
    [
      '/api/v1/blocks/20000000',
      new EthereumProviderUnavailableError(),
      503,
      'ETHEREUM_PROVIDER_UNAVAILABLE',
    ],
  ])('maps %s use-case failures to stable errors', async (url, error, status, code) => {
    const input = dependencies();
    if (url === '/api/v1/fees/current') {
      vi.mocked(input.getCurrentFeeSnapshot.execute).mockRejectedValue(error);
    } else if (url.startsWith('/api/v1/fees/history')) {
      vi.mocked(input.getFeeHistory.execute).mockRejectedValue(error);
    } else if (url === '/api/v1/blocks/recent') {
      vi.mocked(input.getRecentBlocks.execute).mockRejectedValue(error);
    } else {
      vi.mocked(input.getBlockByIdentifier.execute).mockRejectedValue(error);
    }

    const requestBuilder = request(createApp(input)).get(url);
    const response =
      url === '/api/v1/fees/history'
        ? await requestBuilder.query({
            from: '2026-08-29T00:00:00.000Z',
            to: '2026-08-30T00:00:00.000Z',
          })
        : await requestBuilder;

    expect(response.status).toBe(status);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe(code);
  });

  it('returns controlled 404 and 500 responses without leaking raw failures', async () => {
    const missing = await request(createApp(dependencies())).get('/does-not-exist');
    expect(missing.status).toBe(404);
    expect(ApiErrorSchema.parse(missing.body).error.code).toBe('ROUTE_NOT_FOUND');

    const input = dependencies();
    vi.mocked(input.getCurrentFeeSnapshot.execute).mockRejectedValue(
      new Error('provider URL https://secret.example/key/credential and stack'),
    );
    const failed = await request(createApp(input)).get('/api/v1/fees/current');
    expect(failed.status).toBe(500);
    expect(ApiErrorSchema.parse(failed.body).error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(failed.body)).not.toMatch(/secret|credential|stack/i);
  });

  it('allows only configured CORS origins and controls oversized JSON', async () => {
    const app = createApp(dependencies());
    const allowed = await request(app).get('/health').set('Origin', 'https://app.alphractal.test');
    const rejected = await request(app).get('/health').set('Origin', 'https://evil.test');

    expect(allowed.headers['access-control-allow-origin']).toBe('https://app.alphractal.test');
    expect(rejected.headers['access-control-allow-origin']).toBeUndefined();

    const oversized = await request(app)
      .post('/does-not-exist')
      .set('Content-Type', 'application/json')
      .send({ content: 'x'.repeat(40_000) });
    expect(oversized.status).toBe(400);
    expect(ApiErrorSchema.parse(oversized.body).error.code).toBe('INVALID_QUERY');
  });

  it('mounts only the unified live stream route', async () => {
    const input = dependencies();
    const live = await request(createApp(input)).get('/api/v1/live/stream');
    const obsolete = await request(createApp(input)).get('/api/v1/fees/stream');

    expect(live.status).toBe(200);
    expect(input.liveSseHub.handle).toHaveBeenCalledTimes(1);
    expect(obsolete.status).toBe(404);
    expect(ApiErrorSchema.parse(obsolete.body).error.code).toBe('ROUTE_NOT_FOUND');
  });
});
