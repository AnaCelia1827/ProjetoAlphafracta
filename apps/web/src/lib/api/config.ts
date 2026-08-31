const useMockData =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";

export const apiConfig = {
  currentFeeUrl: "/api/v1/fees/current",
  historyUrl: "/api/v1/fees/history",
  recentBlocksUrl: "/api/v1/blocks/recent",
  blockUrl: (identifier: string) =>
    `/api/v1/blocks/${encodeURIComponent(identifier)}`,
  streamUrl: "/api/v1/live/stream",
  useMockData,
  staleAfterMs: 15_000,
} as const;
