import Image from "next/image";
import styles from "@/app/page.module.css";
import { connectionLabels } from "@/components/dashboard-header";
import type { ConnectionStatus, DataStatus as SnapshotDataStatus, FeeSnapshot } from "@/types/fees";

const dataStatusLabels: Record<SnapshotDataStatus, string> = {
  fresh: "Dados ao vivo",
  stale: "Dados desatualizados",
  unavailable: "Aguardando dados",
};

type DataStatusProps = {
  snapshot: FeeSnapshot | null;
  connectionStatus: ConnectionStatus;
  dataStatus: SnapshotDataStatus;
  error: string | null;
  onRefresh: () => void;
};

export function DataStatus({ snapshot, connectionStatus, dataStatus, error, onRefresh }: DataStatusProps) {
  const updatedAt = snapshot ? new Date(snapshot.timestamp).toLocaleTimeString("pt-BR") : "—";
  const persistenceDegraded = snapshot?.health && snapshot.health.persistence !== "connected";

  return <article className={`${styles.panel} ${styles.confidence}`}>
    <div className={styles.panelTitle}><span>Status dos dados</span><Image src="/figma/dashboard.svg" alt="" width={16} height={4} /></div>
    <div className={styles.statusSummary}>
      <p className={`${styles.dataStatus} ${styles[dataStatus]}`}>{dataStatusLabels[dataStatus]}</p>
      <span>{connectionLabels[connectionStatus]} · {updatedAt}</span>
    </div>
    <div className={styles.samples}>
      <div className={dataStatus === "stale" ? styles.staleSource : styles.primarySource}>
        <strong>{snapshot?.sources.mempool ?? "—"}</strong>
        <span>Mempool</span>
      </div>
      <div>
        <strong>{snapshot?.sources.price ?? "—"}</strong>
        <span>Cotação ETH/USD</span>
      </div>
    </div>
    <button className={styles.refresh} type="button" onClick={onRefresh}>Atualizar dados</button>
    {!snapshot && <p className={styles.noData}>Aguardando o primeiro snapshot da API.</p>}
    {persistenceDegraded && <p className={styles.warning}>Dados ao vivo ativos; persistência do histórico degradada.</p>}
    {error && <p className={styles.errorMessage}>{error}</p>}
    <p className={styles.disclaimer}>Recomendação baseada na amostra de transações pendentes observada pela Alchemy.</p>
  </article>;
}
