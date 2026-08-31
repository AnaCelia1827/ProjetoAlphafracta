import { RecentBlocksResponseSchema } from "@alphractal/contracts";
import { apiConfig } from "@/lib/api/config";
import { fetchJson } from "@/lib/api/fetch-json";

export async function fetchRecentBlocks(
  signal?: AbortSignal,
  url: string = apiConfig.recentBlocksUrl,
) {
  const response = await fetchJson(
    url,
    RecentBlocksResponseSchema,
    signal,
  );

  return response.data;
}
