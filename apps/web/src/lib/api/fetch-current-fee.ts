import { FeeCurrentResponseSchema } from "@alphractal/contracts";
import { apiConfig } from "@/lib/api/config";
import { fetchJson } from "@/lib/api/fetch-json";

export async function fetchCurrentFee(signal?: AbortSignal) {
  const response = await fetchJson(
    apiConfig.currentFeeUrl,
    FeeCurrentResponseSchema,
    signal,
  );

  return response.data;
}
