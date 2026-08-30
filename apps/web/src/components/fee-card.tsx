import styles from "@/app/page.module.css";
import { Metric } from "@/components/metric";
import type { FeeSnapshot } from "@/types/fees";

export function FeeCard({ snapshot, ageMs }: { snapshot: FeeSnapshot | null; ageMs: number | null }) {
  return <article className={`${styles.panel} ${styles.feeCard}`}>
    <div className={styles.metrics}>
      <Metric label="Taxa máxima recomendada" value={snapshot?.recommendedMaxFeeGwei} suffix="Gwei" />
      <Metric label="Taxa de prioridade" value={snapshot?.recommendedPriorityFeeGwei} suffix="Gwei" />
      <Metric label="Cotação ETH/USD" value={snapshot?.ethUsd} suffix="USD" />
    </div>
    <div className={styles.feeBreakdown}>
      <Metric label="AMOSTRA" value={snapshot?.sampleSize} suffix="transações" />
      <Metric label="IDADE DO DADO" value={ageMs === null ? undefined : Math.round(ageMs / 1_000)} suffix="segundos" />
      <Metric label="REDE" value={snapshot?.metadata.network} />
    </div>
  </article>;
}
