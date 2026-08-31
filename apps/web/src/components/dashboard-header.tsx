"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "@/app/page.module.css";
import type { ConnectionStatus } from "@/types/fees";

export const connectionLabels: Record<ConnectionStatus, string> = {
  connecting: "Conectando",
  connected: "Conectado",
  reconnecting: "Reconectando",
  disconnected: "Desconectado",
};

type NavIconName = "dashboard" | "history" | "live";

function NavIcon({ name }: { name: NavIconName }) {
  if (name === "dashboard") {
    return <svg className={styles.navIcon} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" fill="currentColor" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" fill="currentColor" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" fill="currentColor" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" fill="currentColor" />
    </svg>;
  }

  if (name === "history") {
    return <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 3v5h5M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>;
  }

  return <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M3 12h4l2.2-5 4.1 10 2.2-5H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

function ConnectionPlugIcon() {
  return <svg className={styles.connectionIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M7 2v4M17 2v4M5 6h14v4h-2v3a5 5 0 0 1-10 0v-3H5V6Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 18v1a3 3 0 0 0 3 3h1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="m13 9-2 2h2l-2 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export function DashboardHeader({ status }: { status: ConnectionStatus }) {
  const [activeItem, setActiveItem] = useState<"dashboard" | "history" | "live">("live");

  return <header className={styles.header}>
    <div className={styles.logo}>
      <Image
        className={styles.brandLogo}
        src="/alphractal-logo-dark.svg"
        alt="Alphractal"
        width={156}
        height={40}
        priority
      />
    </div>
    <nav className={styles.nav}>
      <a className={activeItem === "dashboard" ? styles.active : ""} href="#recent-blocks" onClick={() => setActiveItem("dashboard")}><NavIcon name="dashboard" />Dashboard</a>
      <a className={activeItem === "history" ? styles.active : ""} href="#history" onClick={() => setActiveItem("history")}><NavIcon name="history" />Histórico</a>
      <a className={activeItem === "live" ? styles.active : ""} href="#live" onClick={() => setActiveItem("live")}><NavIcon name="live" />Monitor ao vivo</a>
    </nav>
    <span className={`${styles.connection} ${styles[status]}`} role="status" aria-live="polite">
      <ConnectionPlugIcon />
      {connectionLabels[status]}
    </span>
  </header>;
}
