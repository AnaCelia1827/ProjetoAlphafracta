import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAllFeeHistory } from "@/lib/api/fetch-fee-history";
import { downsampleHistory } from "@/lib/history/downsample";
import { feeSnapshotFixture } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

describe("fee history", () => {
  it("keeps first and last while bounding chart points", () => {
    const points = Array.from({ length: 1000 }, (_, index) => ({
      timestamp: new Date(index * 1000).toISOString(),
      recommendedMaxFeeGwei: index,
      recommendedPriorityFeeGwei: 1,
    }));

    const sampled = downsampleHistory(points, 288);

    expect(sampled).toHaveLength(288);
    expect(sampled[0]).toBe(points[0]);
    expect(sampled.at(-1)).toBe(points.at(-1));
  });

  it("keeps the same bounds and limit while following the cursor", async () => {
    const requests: string[] = [];
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((input: string | URL | Request) => {
        requests.push(String(input));
        return Promise.resolve(
          Response.json({
            data: [feeSnapshotFixture],
            page: { nextCursor: "cursor-2", hasMore: true },
          }),
        );
      })
      .mockImplementationOnce((input: string | URL | Request) => {
        requests.push(String(input));
        return Promise.resolve(
          Response.json({
            data: [
              {
                ...feeSnapshotFixture,
                timestamp: "2026-08-31T03:01:00.000Z",
              },
            ],
            page: { nextCursor: null, hasMore: false },
          }),
        );
      });
    vi.stubGlobal("fetch", fetchMock);

    const from = new Date("2026-08-31T02:00:00.000Z");
    const to = new Date("2026-08-31T04:00:00.000Z");
    const result = await fetchAllFeeHistory(from, to);

    expect(result).toHaveLength(2);
    expect(requests).toHaveLength(2);

    const first = new URL(requests[0]!, "http://localhost");
    const second = new URL(requests[1]!, "http://localhost");
    expect(first.pathname).toBe("/api/v1/fees/history");
    expect(first.searchParams.get("from")).toBe(from.toISOString());
    expect(first.searchParams.get("to")).toBe(to.toISOString());
    expect(first.searchParams.get("limit")).toBe("5000");
    expect(first.searchParams.has("cursor")).toBe(false);
    expect(second.searchParams.get("from")).toBe(first.searchParams.get("from"));
    expect(second.searchParams.get("to")).toBe(first.searchParams.get("to"));
    expect(second.searchParams.get("limit")).toBe("5000");
    expect(second.searchParams.get("cursor")).toBe("cursor-2");
  });
});
