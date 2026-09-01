import { FeeHistoryResponseSchema } from '@alphractal/contracts';
import { apiConfig } from '@/lib/api/config';
import { fetchJson } from '@/lib/api/fetch-json';
import { toHistoryPoint } from '@/lib/api/view-models';
import { downsampleHistory } from '@/lib/history/downsample';
import type { FeeHistoryPoint } from '@/types/fees';

const HISTORY_PAGE_LIMIT = 5000;
const MAXIMUM_CHART_POINTS = 288;

export async function fetchAllFeeHistory(
  from: Date,
  to: Date,
  signal?: AbortSignal,
): Promise<FeeHistoryPoint[]> {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const points: FeeHistoryPoint[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  do {
    const query = new URLSearchParams({
      from: fromIso,
      to: toIso,
      limit: String(HISTORY_PAGE_LIMIT),
    });

    if (cursor) {
      query.set('cursor', cursor);
    }

    const response = await fetchJson(
      `${apiConfig.historyUrl}?${query.toString()}`,
      FeeHistoryResponseSchema,
      signal,
    );
    points.push(...response.data.map(toHistoryPoint));

    const nextCursor = response.page.nextCursor;
    if (nextCursor && seenCursors.has(nextCursor)) {
      throw new Error('A API repetiu o cursor do histórico.');
    }

    if (nextCursor) {
      seenCursors.add(nextCursor);
    }
    cursor = nextCursor;
  } while (cursor);

  return downsampleHistory(points, MAXIMUM_CHART_POINTS);
}
