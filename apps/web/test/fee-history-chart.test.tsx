import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FeeHistoryChart } from "@/components/fee-history-chart";

const baseProps = {
  rangeMinutes: 60 as const,
  loading: false,
  error: null,
  onRefresh: vi.fn(),
  onRangeChange: vi.fn(),
};

describe("FeeHistoryChart", () => {
  it("renders USD first and all five ranges", async () => {
    const user = userEvent.setup();
    const onRangeChange = vi.fn();
    render(
      <FeeHistoryChart
        {...baseProps}
        history={[
          {
            timestamp: "2026-08-31T03:00:00.000Z",
            recommendedMaxFeeGwei: 50,
            recommendedPriorityFeeGwei: 1.8,
            maxCostUsd: 2.31,
          },
        ]}
        onRangeChange={onRangeChange}
      />,
    );

    for (const label of ["5m", "15m", "1h", "6h", "24h"]) {
      expect(screen.getByRole("button", { name: label })).toBeVisible();
    }
    expect(screen.getByText(/US\$\s*2,31/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "15m" }));
    expect(onRangeChange).toHaveBeenCalledWith(15);
  });

  it("leaves a visible gap when USD pricing is missing between points", () => {
    const { container } = render(
      <FeeHistoryChart
        {...baseProps}
        history={[
          {
            timestamp: "2026-08-31T03:00:00.000Z",
            recommendedMaxFeeGwei: 40,
            recommendedPriorityFeeGwei: 1.5,
            maxCostUsd: 1.8,
          },
          {
            timestamp: "2026-08-31T03:01:00.000Z",
            recommendedMaxFeeGwei: 45,
            recommendedPriorityFeeGwei: 1.6,
            maxCostUsd: 2,
          },
          {
            timestamp: "2026-08-31T03:02:00.000Z",
            recommendedMaxFeeGwei: 50,
            recommendedPriorityFeeGwei: 1.7,
          },
          {
            timestamp: "2026-08-31T03:03:00.000Z",
            recommendedMaxFeeGwei: 55,
            recommendedPriorityFeeGwei: 1.8,
            maxCostUsd: 2.4,
          },
          {
            timestamp: "2026-08-31T03:04:00.000Z",
            recommendedMaxFeeGwei: 60,
            recommendedPriorityFeeGwei: 1.9,
            maxCostUsd: 2.6,
          },
        ]}
      />,
    );

    expect(container.querySelectorAll('[data-series="usd"]')).toHaveLength(2);
  });

  it("explains when no point has USD pricing", () => {
    render(
      <FeeHistoryChart
        {...baseProps}
        history={[
          {
            timestamp: "2026-08-31T03:00:00.000Z",
            recommendedMaxFeeGwei: 50,
            recommendedPriorityFeeGwei: 1.8,
          },
        ]}
      />,
    );

    expect(
      screen.getByText("Histórico em USD indisponível neste período."),
    ).toBeVisible();
  });
});
