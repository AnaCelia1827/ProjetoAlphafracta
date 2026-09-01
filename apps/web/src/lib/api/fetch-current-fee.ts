import { FeeCurrentResponseSchema } from '@alphractal/contracts';
import { apiConfig } from '@/lib/api/config';
import { fetchJson } from '@/lib/api/fetch-json';

export async function fetchCurrentFee(signal?: AbortSignal, url: string = apiConfig.currentFeeUrl) {
  const response = await fetchJson(url, FeeCurrentResponseSchema, signal);

  return response.data;
}
