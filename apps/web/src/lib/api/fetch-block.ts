import {
  BlockIdentifierSchema,
  BlockResponseSchema,
} from "@alphractal/contracts";
import { apiConfig } from "@/lib/api/config";
import { ApiClientError } from "@/lib/api/errors";
import { fetchJson } from "@/lib/api/fetch-json";
import { toBlockViewModel } from "@/lib/api/view-models";

export async function fetchBlock(identifier: string, signal?: AbortSignal) {
  const normalized = identifier.trim();
  const parsedIdentifier = BlockIdentifierSchema.safeParse(normalized);

  if (!parsedIdentifier.success) {
    throw new ApiClientError(
      "Informe um número de bloco ou hash Ethereum válido.",
      400,
      "INVALID_BLOCK_IDENTIFIER",
    );
  }

  const response = await fetchJson(
    apiConfig.blockUrl(parsedIdentifier.data),
    BlockResponseSchema,
    signal,
  );

  return toBlockViewModel(response.data);
}
