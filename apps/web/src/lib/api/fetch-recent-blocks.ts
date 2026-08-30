import { apiConfig } from "@/lib/api/config";
import { fetchJson } from "@/lib/api/fetch-json";
import { parseRecentBlocksResponse } from "@/lib/api/parsers";
import type { RecentBlock } from "@/types/blocks";

export async function fetchRecentBlocks(
  limit = 5,
  signal?: AbortSignal,
): Promise<RecentBlock[]> {
  const url = new URL(apiConfig.recentBlocksUrl);
  url.searchParams.set("limit", String(limit));

  const parsed = parseRecentBlocksResponse(await fetchJson(url.toString(), signal));
  if (!parsed) throw new Error("A API retornou blocos em formato inválido.");
  return parsed.items;
}
