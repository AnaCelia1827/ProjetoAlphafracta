import { describe, expect, it } from "vitest";
import { apiConfig } from "@/lib/api/config";
import { resolveApiServerUrl } from "@/lib/api/server-config";

describe("API configuration", () => {
  it("uses the versioned same-origin routes", () => {
    expect(apiConfig).toMatchObject({
      currentFeeUrl: "/api/v1/fees/current",
      historyUrl: "/api/v1/fees/history",
      recentBlocksUrl: "/api/v1/blocks/recent",
      blockHistoryUrl: "/api/v1/blocks/history",
      streamUrl: "/api/v1/live/stream",
    });
  });

  it("rejects a missing production target", () => {
    expect(() => resolveApiServerUrl({}, "production")).toThrow(/API_SERVER_URL/);
  });

  it("uses localhost only in development", () => {
    expect(resolveApiServerUrl({}, "development")).toBe("http://localhost:3001");
  });

  it.each([
    "file:///tmp/backend.sock",
    "https://user:secret@example.com",
    "https://example.com/backend",
    "https://example.com?target=internal",
    "https://example.com/#fragment",
  ])("rejects an unsafe server target: %s", (value) => {
    expect(() =>
      resolveApiServerUrl({ API_SERVER_URL: value }, "production"),
    ).toThrow(/API_SERVER_URL/);
  });

  it("normalizes a valid server origin", () => {
    expect(
      resolveApiServerUrl(
        { API_SERVER_URL: "https://api.internal.example:8443/" },
        "production",
      ),
    ).toBe("https://api.internal.example:8443");
  });
});
