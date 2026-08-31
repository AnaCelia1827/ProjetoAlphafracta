import { RecentBlocksResponseSchema } from "@alphractal/contracts";
import { apiConfig } from "@/lib/api/config";
import { fetchJson } from "@/lib/api/fetch-json";

export async function fetchRecentBlocks(
  limit = 20,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ limit: String(limit) });
  const response = await fetchJson(
    `${apiConfig.recentBlocksUrl}?${query.toString()}`,
    RecentBlocksResponseSchema,
    signal,
  );

  return response.data;
}
