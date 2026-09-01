import { BlockHistoryResponseSchema } from '@alphractal/contracts';
import { apiConfig } from '@/lib/api/config';
import { fetchJson } from '@/lib/api/fetch-json';
import { toBlockViewModel } from '@/lib/api/view-models';

export async function fetchBlockHistory(input: {
  limit: number;
  cursor?: string;
  signal?: AbortSignal;
  url?: string;
}) {
  const query = new URLSearchParams({ limit: String(input.limit) });
  if (input.cursor !== undefined) query.set('cursor', input.cursor);
  const endpoint = input.url ?? apiConfig.blockHistoryUrl;
  const response = await fetchJson(
    `${endpoint}?${query.toString()}`,
    BlockHistoryResponseSchema,
    input.signal,
  );

  return {
    blocks: response.data.map(toBlockViewModel),
    nextCursor: response.page.nextCursor,
  };
}
