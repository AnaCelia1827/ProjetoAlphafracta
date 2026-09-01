import type { ApiErrorCode } from '@alphractal/contracts';

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: ApiErrorCode,
    readonly requestId?: string,
    readonly details?: ReadonlyArray<{ field: string; issue: string }>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}
