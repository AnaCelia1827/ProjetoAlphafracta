import { apiConfig } from "@/lib/api/config";
import { fetchJson } from "@/lib/api/fetch-json";
import { parseRecentBlocksResponse } from "@/lib/api/parsers";
import type { RecentBlock } from "@/types/blocks";
import type { NetworkFilter } from "@/types/fees";

export async function fetchRecentBlocks(
  limit = 5,
  network: NetworkFilter = "all",
  search = "",
  signal?: AbortSignal,
): Promise<RecentBlock[]> {
  const url = new URL(apiConfig.recentBlocksUrl);
  url.searchParams.set("limit", String(limit));
  if (network !== "all") url.searchParams.set("network", network);
  if (search.trim()) url.searchParams.set("search", search.trim());

  const parsed = parseRecentBlocksResponse(await fetchJson(url.toString(), signal));
  if (!parsed) throw new Error("A API retornou blocos em formato inválido.");
  return parsed.items;
}
