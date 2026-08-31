import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecentBlocks } from "@/components/recent-blocks";
import { toBlockViewModel } from "@/lib/api/view-models";
import { blockFixture } from "./fixtures";

const blockViewFixture = toBlockViewModel(blockFixture);

afterEach(() => vi.unstubAllGlobals());

describe("recent block actions", () => {
  it("opens the backend-provided Etherscan URL", async () => {
    const user = userEvent.setup();
    const open = vi.fn();
    vi.stubGlobal("open", open);

    render(
      <RecentBlocks
        blocks={[blockViewFixture]}
        searchedBlock={null}
        onBackToLive={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /analisar bloco/i }));
    expect(open).toHaveBeenCalledWith(
      blockViewFixture.etherscanUrl,
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("copies the link when native sharing is rejected", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error("cancelled")),
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <RecentBlocks
        blocks={[blockViewFixture]}
        searchedBlock={null}
        onBackToLive={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /compartilhar bloco/i }));
    expect(writeText).toHaveBeenCalledWith(blockViewFixture.etherscanUrl);
    expect(await screen.findByText("Link copiado")).toBeVisible();
  });
});
