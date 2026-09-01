import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecentBlocks } from "@/components/recent-blocks";
import { toBlockViewModel } from "@/lib/api/view-models";
import { blockFixture } from "./fixtures";

const blockViewFixture = toBlockViewModel(blockFixture);

afterEach(() => vi.unstubAllGlobals());

describe("recent block actions", () => {
  it("renders at most ten blocks with the official icon and history link", () => {
    const blocks = Array.from({ length: 12 }, (_, index) => ({
      ...blockViewFixture,
      number: String(23_548_192 - index),
      hash: `0x${String(index).padStart(64, "0")}`,
    }));

    render(
      <RecentBlocks
        blocks={blocks}
        searchedBlock={null}
        onBackToLive={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("button", { name: /#23548/i })).toHaveLength(10);
    expect(screen.getAllByTestId("block-icon")).toHaveLength(11);
    expect(screen.getByRole("link", { name: /histórico completo/i })).toHaveAttribute(
      "href",
      "/blocos",
    );
    expect(document.querySelector('img[src*="avatar"]')).toBeNull();
  });

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

  it("does not overwrite the clipboard when native sharing is cancelled", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError")),
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
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByText("Link copiado")).not.toBeInTheDocument();
  });

  it("shows a search error without hiding the live blocks", () => {
    render(
      <RecentBlocks
        blocks={[blockViewFixture]}
        searchedBlock={null}
        onBackToLive={vi.fn()}
        error="Informe um número de bloco ou hash Ethereum válido."
      />,
    );

    expect(
      screen.getByText("Informe um número de bloco ou hash Ethereum válido."),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: new RegExp(`#${blockViewFixture.number}`),
      }),
    ).toBeVisible();
  });

  it("announces an in-flight search without hiding the live blocks", () => {
    render(
      <RecentBlocks
        blocks={[blockViewFixture]}
        searchedBlock={null}
        onBackToLive={vi.fn()}
        searching
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Buscando bloco");
    expect(
      screen.getByRole("button", {
        name: new RegExp(`#${blockViewFixture.number}`),
      }),
    ).toBeVisible();
  });
});
