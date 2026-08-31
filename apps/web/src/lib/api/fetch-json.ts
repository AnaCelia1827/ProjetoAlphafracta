import { ApiErrorSchema } from "@alphractal/contracts";
import type { ZodType } from "zod";
import { ApiClientError } from "@/lib/api/errors";

export async function fetchJson<T>(
  url: string,
  schema: ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal,
  });

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    throw new ApiClientError(
      `A API respondeu com HTTP ${response.status}.`,
      response.status,
    );
  }

  if (!response.ok) {
    const parsedError = ApiErrorSchema.safeParse(body);

    if (parsedError.success) {
      const { code, message, requestId, details } = parsedError.data.error;
      throw new ApiClientError(
        message,
        response.status,
        code,
        requestId,
        details,
      );
    }

    throw new ApiClientError(
      `A API respondeu com HTTP ${response.status}.`,
      response.status,
    );
  }

  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    throw new ApiClientError(
      "A API retornou uma resposta inválida.",
      response.status,
    );
  }

  return parsed.data;
}
