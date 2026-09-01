import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BlockCatalogView } from "@/components/block-catalog";
import { toBlockViewModel } from "@/lib/api/view-models";
import { blockFixture } from "./fixtures";

const blockViewFixture = toBlockViewModel(blockFixture);

describe("block catalog", () => {
  it("shows page position and uses sequential controls", async () => {
    const user = userEvent.setup();
    const next = vi.fn(async () => undefined);

    render(
      <BlockCatalogView
        blocks={[blockViewFixture]}
        pageNumber={3}
        itemRange={{ from: 21, to: 21 }}
        canPrevious
        canNext={false}
        loading={false}
        error={null}
        onNext={next}
        onPrevious={vi.fn()}
        onRefresh={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByText("Página 3 · itens 21–21")).toBeVisible();
    expect(screen.getByRole("button", { name: "Próxima" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /#23548192/ }));
    expect(screen.getByText("Detalhes do bloco")).toBeVisible();
  });

  it("keeps the visible page when refresh reports an error", () => {
    render(
      <BlockCatalogView
        blocks={[blockViewFixture]}
        pageNumber={1}
        itemRange={{ from: 1, to: 1 }}
        canPrevious={false}
        canNext
        loading={false}
        error="catalog unavailable"
        onNext={vi.fn(async () => undefined)}
        onPrevious={vi.fn()}
        onRefresh={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("catalog unavailable");
    expect(
      screen.getByRole("button", { name: /#23548192/ }),
    ).toBeVisible();
  });
});
