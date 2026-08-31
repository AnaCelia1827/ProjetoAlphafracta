import { describe, expect, it } from "vitest";
import { apiConfig } from "@/lib/api/config";
import { resolveApiServerUrl } from "@/lib/api/server-config";

describe("API configuration", () => {
  it("uses the versioned same-origin routes", () => {
    expect(apiConfig).toMatchObject({
      currentFeeUrl: "/api/v1/fees/current",
      historyUrl: "/api/v1/fees/history",
      recentBlocksUrl: "/api/v1/blocks/recent",
      streamUrl: "/api/v1/live/stream",
    });
  });

  it("rejects a missing production target", () => {
    expect(() => resolveApiServerUrl({}, "production")).toThrow(/API_SERVER_URL/);
  });

  it("uses localhost only in development", () => {
    expect(resolveApiServerUrl({}, "development")).toBe("http://localhost:3001");
  });
});
