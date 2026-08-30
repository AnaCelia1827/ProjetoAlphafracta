const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001").replace(
  /\/+$/,
  "",
);

export const apiConfig = {
  apiUrl,
  streamUrl: `${apiUrl}/stream`,
  historyUrl: `${apiUrl}/fees/history`,
  recentBlocksUrl: `${apiUrl}/blocks/recent`,
  useMockData: process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true",
  enableRecentBlocks:
    process.env.NEXT_PUBLIC_ENABLE_RECENT_BLOCKS === "true",
  staleAfterMs: 15_000,
};
