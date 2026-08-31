import styles from "@/app/page.module.css";
import type { DataStatus as SnapshotDataStatus, FeeViewModel } from "@/types/fees";

const dataStatusLabels: Record<SnapshotDataStatus, string> = {
  fresh: "Dados ao vivo",
  stale: "Dados desatualizados",
  unavailable: "Aguardando dados",
};

const reasonLabels: Record<FeeViewModel["confidence"]["reasons"][number], string> = {
  "fresh-data": "Dados recentes",
  "stable-fees": "Taxas estáveis",
  "strong-sample": "Amostra robusta",
  "aging-data": "Dados envelhecendo",
  "volatile-fees": "Taxas voláteis",
  "weak-sample": "Amostra reduzida",
  "missing-data": "Dados ausentes",
};

const sourceStatusLabels: Record<string, string> = {
  fresh: "Atualizado",
  stale: "Desatualizado",
  unavailable: "Indisponível",
  available: "Disponível",
  degraded: "Degradado",
};

type DataStatusProps = {
  snapshot: FeeViewModel | null;
  dataStatus: SnapshotDataStatus;
  error: string | null;
};

export function DataStatus({
  snapshot,
  dataStatus,
  error,
}: DataStatusProps) {
  const updatedAt = snapshot
    ? new Date(snapshot.timestamp).toLocaleTimeString("pt-BR")
    : "—";

  return (
    <article className={`${styles.panel} ${styles.confidence}`}>
      <div className={styles.panelTitle}>
        <span>Qualidade da recomendação</span>
      </div>
      <div className={styles.statusSummary}>
        <p className={`${styles.dataStatus} ${styles[dataStatus]}`}>
          {dataStatusLabels[dataStatus]}
        </p>
        <span>Atualizado às {updatedAt}</span>
      </div>

      <div className={styles.confidenceReasons}>
        {snapshot?.confidence.reasons.map((reason) => (
          <span key={reason}>{reasonLabels[reason]}</span>
        )) ?? <span>Aguardando evidências da API</span>}
      </div>

      <dl className={styles.sourceStatusGrid}>
        {snapshot &&
          Object.entries(snapshot.status).map(([source, status]) => (
            <div key={source}>
              <dt>{source}</dt>
              <dd>{sourceStatusLabels[status] ?? status}</dd>
            </div>
          ))}
      </dl>

      {error && <p className={styles.errorMessage}>{error}</p>}
      <p className={styles.disclaimer}>
        Recomendação baseada em dados da Ethereum Mainnet observados pela
        Alchemy.
      </p>
    </article>
  );
}
