import { ApiErrorSchema } from '@alphractal/contracts';
import type { ZodType } from 'zod';
import { ApiClientError } from '@/lib/api/errors';

export async function fetchJson<T>(
  url: string,
  schema: ZodType<T>,
  signal?: AbortSignal,
  timeoutMs = 15_000,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted) {
    controller.abort(signal.reason);
  } else {
    signal?.addEventListener('abort', abortFromCaller, { once: true });
  }
  const timeout = setTimeout(() => {
    if (!controller.signal.aborted) {
      timedOut = true;
      controller.abort(new DOMException('Request timed out', 'TimeoutError'));
    }
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    let body: unknown;

    try {
      body = await response.json();
    } catch {
      throw new ApiClientError(`A API respondeu com HTTP ${response.status}.`, response.status);
    }

    if (!response.ok) {
      const parsedError = ApiErrorSchema.safeParse(body);

      if (parsedError.success) {
        const { code, message, requestId, details } = parsedError.data.error;
        throw new ApiClientError(message, response.status, code, requestId, details);
      }

      throw new ApiClientError(`A API respondeu com HTTP ${response.status}.`, response.status);
    }

    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      throw new ApiClientError('A API retornou uma resposta inválida.', response.status);
    }

    return parsed.data;
  } catch (reason) {
    if (timedOut) {
      throw new ApiClientError('A API excedeu o tempo limite de resposta.', 408);
    }
    throw reason;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}
