import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBlockCatalog } from "@/hooks/use-block-catalog";
import { fetchBlockHistory } from "@/lib/api/fetch-block-history";
import { toBlockViewModel } from "@/lib/api/view-models";
import { blockFixture } from "./fixtures";

vi.mock("@/lib/api/fetch-block-history", () => ({
  fetchBlockHistory: vi.fn(),
}));

const fetchBlockHistoryMock = vi.mocked(fetchBlockHistory);
const firstBlocks = Array.from({ length: 10 }, (_, index) =>
  toBlockViewModel({
    ...blockFixture,
    number: String(23_548_192 - index),
    hash: `0x${String(index).padStart(64, "0")}`,
    etherscanUrl: `https://etherscan.io/block/${23_548_192 - index}`,
  }),
);
const secondBlocks = Array.from({ length: 10 }, (_, index) =>
  toBlockViewModel({
    ...blockFixture,
    number: String(23_548_182 - index),
    hash: `0x${String(index + 10).padStart(64, "0")}`,
    etherscanUrl: `https://etherscan.io/block/${23_548_182 - index}`,
  }),
);

describe("useBlockCatalog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("moves through cached cursor pages and preserves the current page on failure", async () => {
    fetchBlockHistoryMock
      .mockResolvedValueOnce({ blocks: firstBlocks, nextCursor: "page-2" })
      .mockResolvedValueOnce({ blocks: secondBlocks, nextCursor: null });

    const { result } = renderHook(() => useBlockCatalog());

    await waitFor(() => expect(result.current.blocks).toEqual(firstBlocks));
    expect(result.current.pageNumber).toBe(1);

    await act(() => result.current.next());
    expect(result.current.pageNumber).toBe(2);
    expect(result.current.itemRange).toEqual({ from: 11, to: 20 });

    act(() => result.current.previous());
    expect(result.current.pageNumber).toBe(1);
    expect(fetchBlockHistoryMock).toHaveBeenCalledTimes(2);

    fetchBlockHistoryMock.mockRejectedValueOnce(
      new Error("catalog unavailable"),
    );
    await act(() => result.current.refresh());
    expect(result.current.pageNumber).toBe(1);
    expect(result.current.blocks).toEqual(firstBlocks);
    expect(result.current.error).toBe("catalog unavailable");
  });
});
