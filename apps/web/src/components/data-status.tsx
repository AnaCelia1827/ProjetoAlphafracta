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
};

export function DataStatus({ snapshot, connectionStatus, dataStatus, error }: DataStatusProps) {
  const updatedAt = snapshot ? new Date(snapshot.timestamp).toLocaleTimeString("pt-BR") : "—";
  const persistenceDegraded = snapshot?.health && snapshot.health.persistence !== "connected";

  return <article className={`${styles.panel} ${styles.confidence}`}>
    <div className={styles.panelTitle}><span>Status dos dados</span><Image src="/figma/dashboard.svg" alt="" width={16} height={4} /></div>
    <p className={`${styles.dataStatus} ${styles[dataStatus]}`}>{dataStatusLabels[dataStatus]}</p>
    <div className={styles.sourceList}>
      <p><span>Stream</span><strong>{connectionLabels[connectionStatus]}</strong></p>
      <p><span>Mempool</span><strong>{snapshot?.sources.mempool ?? "—"}</strong></p>
      <p><span>Cotação</span><strong>{snapshot?.sources.price ?? "—"}</strong></p>
      <p><span>Última atualização</span><strong>{updatedAt}</strong></p>
    </div>
    {!snapshot && <p className={styles.noData}>Aguardando o primeiro snapshot da API.</p>}
    {persistenceDegraded && <p className={styles.warning}>Dados ao vivo ativos; persistência do histórico degradada.</p>}
    {error && <p className={styles.errorMessage}>{error}</p>}
    <p className={styles.disclaimer}>Recomendação baseada na amostra de transações pendentes observada pela Alchemy.</p>
  </article>;
}
