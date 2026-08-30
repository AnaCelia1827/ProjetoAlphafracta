import Image from "next/image";
import styles from "@/app/page.module.css";
import type { ConnectionStatus } from "@/types/fees";

export const connectionLabels: Record<ConnectionStatus, string> = {
  connecting: "Conectando",
  connected: "Conectado",
  reconnecting: "Reconectando",
  disconnected: "Desconectado",
};

export function DashboardHeader({ status }: { status: ConnectionStatus }) {
  return <header className={styles.header}>
    <div className={styles.logo}><Image src="/figma/provider.svg" alt="" width={18} height={19} />Alphractal</div>
    <nav className={styles.nav}>
      <a href="#"><Image src="/figma/logo.svg" alt="" width={18} height={18} />Dashboard</a>
      <a href="#history">Histórico</a>
      <a className={styles.active} href="#live"><i />Monitor ao vivo</a>
    </nav>
    <span className={`${styles.connection} ${styles[status]}`}><i />{connectionLabels[status]}</span>
  </header>;
}
