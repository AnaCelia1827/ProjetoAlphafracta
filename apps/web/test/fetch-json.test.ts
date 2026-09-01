import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@/lib/api/errors';
import { fetchJson } from '@/lib/api/fetch-json';

afterEach(() => vi.unstubAllGlobals());

describe('fetchJson', () => {
  it('preserves the backend error code and request id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'BLOCK_NOT_FOUND',
              message: 'Block not found',
              requestId: 'req-1',
            },
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const error = await fetchJson('/api/v1/blocks/1', z.unknown()).catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      code: 'BLOCK_NOT_FOUND',
      requestId: 'req-1',
    });
  });

  it('turns a stalled request into a localized timeout error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_input, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
          }),
      ),
    );

    const error = await fetchJson('/api/v1/fees/current', z.unknown(), undefined, 5).catch(
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({ status: 408 });
    expect((error as Error).message).toMatch(/tempo limite/i);
  });
});
