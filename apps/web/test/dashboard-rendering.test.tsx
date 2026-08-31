import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardHeader } from "@/components/dashboard-header";
import { DataStatus } from "@/components/data-status";
import { FeeCard } from "@/components/fee-card";
import { toFeeViewModel } from "@/lib/api/view-models";
import { feeSnapshotFixture } from "./fixtures";

const feeViewFixture = toFeeViewModel({
  ...feeSnapshotFixture,
  trend24h: {
    ...feeSnapshotFixture.trend24h,
    status: "available",
    percentChange: 12,
    currentMedianMaxFeeGwei: 50,
    previousMedianMaxFeeGwei: 44.64,
  },
});

const unavailableFeeViewFixture = {
  ...feeViewFixture,
  maxCostUsd: undefined,
  priceStatus: "unavailable" as const,
  trend: { status: "insufficient-history" as const, windowMinutes: 5 as const },
  confidence: {
    level: "unavailable" as const,
    reasons: ["missing-data" as const],
  },
};

describe("connected dashboard rendering", () => {
  it("renders confidence, transfer cost, and available trend", () => {
    render(<FeeCard snapshot={feeViewFixture} ageMs={4200} />);

    expect(screen.getByText(/confiança alta/i)).toBeVisible();
    expect(screen.getByText(/US\$\s2,31/)).toBeVisible();
    expect(screen.getByText("+12,00%")).toBeVisible();
  });

  it("does not invent USD or trend values when unavailable", () => {
    render(<FeeCard snapshot={unavailableFeeViewFixture} ageMs={20000} />);

    expect(screen.getByText(/cotação indisponível/i)).toBeVisible();
    expect(screen.getByText(/histórico insuficiente/i)).toBeVisible();
  });

  it("shows demo mode and the backend-derived data reason", () => {
    render(
      <>
        <DashboardHeader status="degraded" demo />
        <DataStatus
          snapshot={feeViewFixture}
          dataStatus="stale"
          error="Histórico temporariamente indisponível"
        />
      </>,
    );

    expect(screen.getByText("Demo")).toBeVisible();
    expect(screen.getByText("Degradado")).toBeVisible();
    expect(screen.getByText("Dados desatualizados")).toBeVisible();
    expect(screen.getByText("Dados recentes")).toBeVisible();
    expect(
      screen.getByText("Histórico temporariamente indisponível"),
    ).toBeVisible();
  });
});
