import { apiConfig } from "@/lib/api/config";
import { fetchJson } from "@/lib/api/fetch-json";
import { parseFeeHistoryResponse } from "@/lib/api/parsers";
import type { FeeHistoryPoint } from "@/types/fees";
import type { NetworkFilter } from "@/types/fees";

export async function fetchFeeHistory(
  from: Date,
  to: Date,
  network: NetworkFilter,
  signal?: AbortSignal,
): Promise<FeeHistoryPoint[]> {
  const url = new URL(apiConfig.historyUrl);
  url.searchParams.set("from", from.toISOString());
  url.searchParams.set("to", to.toISOString());
  if (network !== "all") url.searchParams.set("network", network);

  const parsed = parseFeeHistoryResponse(await fetchJson(url.toString(), signal));
  if (!parsed) throw new Error("A API retornou um histórico inválido.");
  return parsed.items;
}
