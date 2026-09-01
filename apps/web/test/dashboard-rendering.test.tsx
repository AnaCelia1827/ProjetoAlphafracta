import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardHeader } from "@/components/dashboard-header";
import { FeeCard } from "@/components/fee-card";
import { NetworkMomentCard } from "@/components/network-moment-card";
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
  it("prioritizes native-transfer USD and keeps Gwei secondary", () => {
    render(<FeeCard snapshot={feeViewFixture} ageMs={4200} />);

    expect(screen.getByText("Custo estimado para transferir ETH")).toBeVisible();
    expect(screen.getByText(/US\$\s*2,31/)).toBeVisible();
    expect(screen.getByText(/50.*Gwei/i)).toBeVisible();
    expect(screen.queryByText(/confiança/i)).not.toBeInTheDocument();
  });

  it("does not invent a USD value when the quote is unavailable", () => {
    render(<FeeCard snapshot={unavailableFeeViewFixture} ageMs={20000} />);

    expect(screen.getByText(/cotação indisponível/i)).toBeVisible();
  });

  it("renders actionable network context without source tags", () => {
    render(
      <NetworkMomentCard
        moment={{
          level: "cheap",
          label: "Barato",
          message: "Bom momento para transacionar",
        }}
        error={null}
      />,
    );

    expect(screen.getByText("Momento da rede")).toBeVisible();
    expect(screen.getByText("Bom momento para transacionar")).toBeVisible();
    expect(
      screen.queryByText(/mempool|persistence|amostra robusta/i),
    ).not.toBeInTheDocument();
  });

  it("keeps demo and connection state visible in the header", () => {
    render(<DashboardHeader status="degraded" demo />);

    expect(screen.getByText("Demo")).toBeVisible();
    expect(screen.getByText("Degradado")).toBeVisible();
  });
});
