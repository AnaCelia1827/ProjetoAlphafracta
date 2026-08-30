"use client";

import Image from "next/image";
import { useFeeStream } from "@/hooks/use-fee-stream";
import { mockFeeHistory } from "@/mocks/fee-snapshot";
import type { ConnectionStatus, FeeSnapshot } from "@/types/fees";
import styles from "./page.module.css";

const statusLabels: Record<ConnectionStatus, string> = {
  connecting: "Conectando",
  connected: "Conectado",
  reconnecting: "Reconectando",
  disconnected: "Desconectado",
};

function Header({ status }: { status: ConnectionStatus }) {
  return <header className={styles.header}><div className={styles.logo}><Image src="/figma/provider.svg" alt="" width={18} height={19} />Alphractal</div><nav className={styles.nav}><a href="#"><Image src="/figma/logo.svg" alt="" width={18} height={18} />Dashboard</a><a href="#history">Histórico</a><a className={styles.active} href="#live"><i />Monitor ao vivo</a></nav><span className={`${styles.connection} ${styles[status]}`}><i />{statusLabels[status]}</span></header>;
}

function Metric({ label, value, suffix }: { label: string; value?: number | string; suffix?: string }) {
  const formattedValue = typeof value === "number" ? value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : value;
  return <div className={styles.metric}><span>{label}</span><p><strong>{formattedValue ?? "—"}</strong>{suffix && <em>{suffix}</em>}</p></div>;
}

function FeeCard({ snapshot }: { snapshot: FeeSnapshot | null }) {
  return <article className={`${styles.panel} ${styles.feeCard}`}><div className={styles.metrics}><Metric label="Taxa máxima recomendada" value={snapshot?.recommendedMaxFeeGwei} suffix="Gwei" /><Metric label="Taxa de prioridade" value={snapshot?.recommendedPriorityFeeGwei} suffix="Gwei" /><Metric label="Cotação ETH/USD" value={snapshot?.ethUsd} suffix="USD" /></div><div className={styles.feeBreakdown}><Metric label="AMOSTRA" value={snapshot?.sampleSize} suffix="transações" /><Metric label="IDADE DO DADO" value={snapshot ? Math.round(snapshot.dataAgeMs / 1000) : undefined} suffix="segundos" /><Metric label="REDE" value={snapshot?.metadata.network} /></div></article>;
}

function DataStatus({ snapshot, status }: { snapshot: FeeSnapshot | null; status: ConnectionStatus }) {
  const updatedAt = snapshot ? new Date(snapshot.timestamp).toLocaleTimeString("pt-BR") : "—";
  return <article className={`${styles.panel} ${styles.confidence}`}><div className={styles.panelTitle}><span>Status dos dados</span><Image src="/figma/dashboard.svg" alt="" width={16} height={4} /></div><p className={styles.dataStatus}>{statusLabels[status]}</p><div className={styles.sourceList}><p><span>Mempool</span><strong>{snapshot?.sources.mempool ?? "—"}</strong></p><p><span>Cotação</span><strong>{snapshot?.sources.price ?? "—"}</strong></p><p><span>Última atualização</span><strong>{updatedAt}</strong></p></div>{!snapshot && <p className={styles.noData}>Aguardando o primeiro snapshot da API.</p>}</article>;
}

function EmptySection({ title, message }: { title: string; message: string }) {
  return <section className={`${styles.panel} ${styles.emptySection}`} id="history"><h2>{title}</h2><p>{message}</p></section>;
}

function FeeHistoryChart() {
  const width = 1000;
  const height = 260;
  const maxValue = 50;
  const points = mockFeeHistory.map((item, index) => {
    const x = (index / (mockFeeHistory.length - 1)) * width;
    const y = height - (item.maxFeeGwei / maxValue) * height;
    return `${x},${y}`;
  }).join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;

  return <section className={`${styles.panel} ${styles.historyPanel}`} id="history"><div className={styles.historyHeader}><div><h2>Histórico de taxas</h2><p>Taxa máxima recomendada nas últimas horas</p></div><div className={styles.legend}><i />Máxima <i />Prioridade</div></div><div className={styles.graph}><div className={styles.yAxis}><span>50</span><span>25</span><span>0 Gwei</span></div><svg role="img" aria-label="Histórico mockado de taxas em Gwei" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"><defs><linearGradient id="feeArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8b5cf6" stopOpacity=".35"/><stop offset="1" stopColor="#8b5cf6" stopOpacity="0"/></linearGradient></defs><polygon points={areaPoints} fill="url(#feeArea)"/><polyline points={points} fill="none" stroke="#8b5cf6" strokeWidth="4" vectorEffect="non-scaling-stroke"/></svg></div><div className={styles.xAxis}>{mockFeeHistory.filter((_, index) => index % 2 === 0).map((item) => <span key={item.time}>{item.time}</span>)}</div><div className={styles.historyStats}><Metric label="MÁXIMA NO PERÍODO" value={Math.max(...mockFeeHistory.map((item) => item.maxFeeGwei))} suffix="Gwei"/><Metric label="MÉDIA NO PERÍODO" value={mockFeeHistory.reduce((total, item) => total + item.maxFeeGwei, 0) / mockFeeHistory.length} suffix="Gwei"/><Metric label="PRIORIDADE ATUAL" value={mockFeeHistory.at(-1)?.priorityFeeGwei} suffix="Gwei"/></div></section>;
}

export default function Home() {
  const { snapshot, status } = useFeeStream();
  return <><Header status={status} /><main className={styles.page} id="live"><section className={styles.summary}><FeeCard snapshot={snapshot} /><DataStatus snapshot={snapshot} status={status} /></section><FeeHistoryChart /><EmptySection title="Blocos recentes" message="Nenhum dado de bloco recebido da API." /></main></>;
}
