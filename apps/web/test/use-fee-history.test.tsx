import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useFeeHistory } from "@/hooks/use-fee-history";
import { fetchAllFeeHistory } from "@/lib/api/fetch-fee-history";

vi.mock("@/lib/api/fetch-fee-history", () => ({
  fetchAllFeeHistory: vi.fn(),
}));

const fetchAllFeeHistoryMock = vi.mocked(fetchAllFeeHistory);
const oldPoint = {
  timestamp: "2026-08-31T01:00:00.000Z",
  recommendedMaxFeeGwei: 40,
  recommendedPriorityFeeGwei: 2,
};

describe("useFeeHistory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not label a previous range as the newly selected range", async () => {
    let rejectOneHour!: (reason: unknown) => void;
    fetchAllFeeHistoryMock
      .mockResolvedValueOnce([oldPoint])
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectOneHour = reject;
        }),
      );

    const { result, rerender } = renderHook(
      ({ hours }) => useFeeHistory(hours),
      { initialProps: { hours: 24 } },
    );
    await waitFor(() => expect(result.current.history).toEqual([oldPoint]));

    rerender({ hours: 1 });
    expect(result.current.loading).toBe(true);
    expect(result.current.history).toEqual([]);

    act(() => rejectOneHour(new Error("history unavailable")));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.history).toEqual([]);
    expect(result.current.error).toBe("history unavailable");
  });
});
