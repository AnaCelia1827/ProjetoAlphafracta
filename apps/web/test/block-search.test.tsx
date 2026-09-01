import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardFilters } from "@/components/dashboard-filters";
import { fetchBlock } from "@/lib/api/fetch-block";
import { blockFixture } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

describe("block search", () => {
  it("submits a block number only on Enter", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();

    function Harness() {
      const [search, setSearch] = useState("");
      return (
        <DashboardFilters
          search={search}
          onSearchChange={setSearch}
          onSearch={onSearch}
        />
      );
    }

    render(<Harness />);

    await user.type(screen.getByRole("searchbox"), "23548192");
    expect(onSearch).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(onSearch).toHaveBeenCalledWith("23548192");
    expect(screen.getByRole("searchbox")).toHaveFocus();
  });

  it("validates identifiers before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchBlock("not-a-block")).rejects.toMatchObject({
      code: "INVALID_BLOCK_IDENTIFIER",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads a canonical block through the versioned endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ data: blockFixture }));
    vi.stubGlobal("fetch", fetchMock);

    const block = await fetchBlock(blockFixture.number);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/blocks/${blockFixture.number}`,
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
    expect(block.etherscanUrl).toBe(blockFixture.etherscanUrl);
  });
});
