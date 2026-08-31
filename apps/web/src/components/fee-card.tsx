import styles from "@/app/page.module.css";
import { Metric } from "@/components/metric";
import type { FeeViewModel } from "@/types/fees";

const confidenceLabels: Record<FeeViewModel["confidence"]["level"], string> = {
  high: "Confiança alta",
  medium: "Confiança média",
  low: "Confiança baixa",
  unavailable: "Confiança indisponível",
};

function formatUsd(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatTrend(trend: FeeViewModel["trend"]) {
  if (trend.status === "insufficient-history") {
    return "Histórico insuficiente";
  }
  if (trend.status === "unavailable") {
    return "Tendência indisponível";
  }

  const value = trend.percentChange.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${trend.percentChange >= 0 ? "+" : ""}${value}%`;
}

export function FeeCard({
  snapshot,
  ageMs,
}: {
  snapshot: FeeViewModel | null;
  ageMs: number | null;
}) {
  const cost =
    snapshot?.maxCostUsd === undefined
      ? "Cotação indisponível"
      : formatUsd(snapshot.maxCostUsd);

  return (
    <article className={`${styles.panel} ${styles.feeCard}`}>
      <div className={styles.metrics}>
        <Metric
          label="Taxa máxima recomendada"
          value={snapshot?.recommendedMaxFeeGwei}
          suffix="Gwei"
        />
        <Metric
          label="Taxa de prioridade"
          value={snapshot?.recommendedPriorityFeeGwei}
          suffix="Gwei"
        />
        <Metric label="Custo máximo estimado" value={cost} />
      </div>

      <div className={styles.recommendationMeta}>
        <p>
          <span>Confiança</span>
          <strong>
            {snapshot
              ? confidenceLabels[snapshot.confidence.level]
              : "Aguardando dados"}
          </strong>
        </p>
        <p>
          <span>Tendência em 5 min</span>
          <strong>{snapshot ? formatTrend(snapshot.trend) : "—"}</strong>
        </p>
      </div>

      <div className={styles.feeBreakdown}>
        <Metric label="BASE FEE" value={snapshot?.baseFeeGwei} suffix="Gwei" />
        <Metric
          label="PREÇO EFETIVO"
          value={snapshot?.effectiveGasPriceGwei}
          suffix="Gwei"
        />
        <Metric
          label="IDADE DO DADO"
          value={ageMs === null ? undefined : Math.round(ageMs / 1000)}
          suffix="segundos"
        />
      </div>
    </article>
  );
}
