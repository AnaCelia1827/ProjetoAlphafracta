export async function fetchJson(
  url: string,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`A API respondeu com HTTP ${response.status}.`);
  }

  return response.json() as Promise<unknown>;
}
