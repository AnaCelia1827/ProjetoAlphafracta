"use client";

import { useState } from "react";
import styles from "@/app/page.module.css";
import { Metric } from "@/components/metric";
import type { FeeHistoryPoint } from "@/types/fees";

type Props = {
  history: FeeHistoryPoint[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
};

const width = 1_000;
const height = 260;

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function FeeHistoryChart({ history, loading, error, onRefresh }: Props) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const values = history.flatMap((item) => [item.recommendedMaxFeeGwei, item.recommendedPriorityFeeGwei]);
  const maxValue = Math.max(1, ...values) * 1.1;
  const denominator = Math.max(1, history.length - 1);
  const makeCoordinates = (field: "recommendedMaxFeeGwei" | "recommendedPriorityFeeGwei") => history.map((item, index) => {
    const x = (index / denominator) * width;
    const y = height - (item[field] / maxValue) * height;
    return { x, y };
  });
  const maxFeeCoordinates = makeCoordinates("recommendedMaxFeeGwei");
  const priorityCoordinates = makeCoordinates("recommendedPriorityFeeGwei");
  const maxFeePoints = maxFeeCoordinates.map(({ x, y }) => `${x},${y}`).join(" ");
  const priorityPoints = priorityCoordinates.map(({ x, y }) => `${x},${y}`).join(" ");
  const areaPoints = history.length ? `0,${height} ${maxFeePoints} ${width},${height}` : "";
  const labelStep = Math.max(1, Math.ceil(history.length / 6));
  const maximum = history.length ? Math.max(...history.map((item) => item.recommendedMaxFeeGwei)) : undefined;
  const average = history.length ? history.reduce((total, item) => total + item.recommendedMaxFeeGwei, 0) / history.length : undefined;
  const activeIndex = hoveredIndex === null ? null : Math.min(hoveredIndex, history.length - 1);
  const activeItem = activeIndex === null ? null : history[activeIndex];
  const activePoint = activeIndex === null ? null : maxFeeCoordinates[activeIndex];
  const variation = activeIndex === null || activeIndex === 0
    ? null
    : history[activeIndex].recommendedMaxFeeGwei - history[activeIndex - 1].recommendedMaxFeeGwei;

  const selectClosestPoint = (clientX: number, element: HTMLDivElement) => {
    const bounds = element.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width));
    setHoveredIndex(Math.round(ratio * denominator));
  };

  return <section className={`${styles.panel} ${styles.historyPanel}`} id="history">
    <div className={styles.historyHeader}>
      <div><h2>Histórico de taxas</h2><p>Taxas recomendadas nas últimas horas</p></div>
      <div className={styles.legend}><i />Máxima <i />Prioridade</div>
    </div>
    {loading && history.length === 0 ? <p className={styles.sectionState}>Carregando histórico…</p> : history.length === 0 ? (
      <div className={styles.sectionState}><p>{error ?? "Nenhum snapshot foi encontrado no período."}</p>{error && <button onClick={onRefresh}>Tentar novamente</button>}</div>
    ) : <>
      {error && <p className={styles.inlineError}>{error}</p>}
      <div className={styles.graph}>
        <div className={styles.yAxis}><span>{Math.ceil(maxValue)}</span><span>{Math.ceil(maxValue / 2)}</span><span>0 Gwei</span></div>
        <div
          className={styles.graphPlot}
          tabIndex={0}
          aria-label="Gráfico interativo. Use o mouse ou as setas para consultar os valores."
          onPointerEnter={(event) => selectClosestPoint(event.clientX, event.currentTarget)}
          onPointerMove={(event) => selectClosestPoint(event.clientX, event.currentTarget)}
          onPointerLeave={() => setHoveredIndex(null)}
          onFocus={() => setHoveredIndex((current) => current ?? history.length - 1)}
          onBlur={() => setHoveredIndex(null)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setHoveredIndex(null);
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              const direction = event.key === "ArrowLeft" ? -1 : 1;
              setHoveredIndex((current) => Math.min(history.length - 1, Math.max(0, (current ?? history.length - 1) + direction)));
            }
          }}
        >
          <svg role="img" aria-label="Histórico de taxas recomendadas em Gwei" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <defs>
              <linearGradient id="feeArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--color-primary-hover)" stopOpacity=".38" /><stop offset="1" stopColor="var(--color-primary-deep)" stopOpacity="0" /></linearGradient>
              <linearGradient id="feeLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="var(--color-primary)" /><stop offset=".55" stopColor="var(--color-primary-hover)" /><stop offset="1" stopColor="var(--color-primary-deep)" /></linearGradient>
            </defs>
            <polygon points={areaPoints} fill="url(#feeArea)" />
            <polyline className={styles.feeLine} points={maxFeePoints} fill="none" stroke="url(#feeLine)" strokeWidth="4" vectorEffect="non-scaling-stroke" />
            <polyline points={priorityPoints} fill="none" stroke="var(--color-focus)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
            {activePoint && <>
              <line className={styles.hoverGuide} x1={activePoint.x} x2={activePoint.x} y1="0" y2={height} vectorEffect="non-scaling-stroke" />
              <circle className={styles.hoverPointHalo} cx={activePoint.x} cy={activePoint.y} r="10" vectorEffect="non-scaling-stroke" />
              <circle className={styles.hoverPoint} cx={activePoint.x} cy={activePoint.y} r="5" vectorEffect="non-scaling-stroke" />
            </>}
          </svg>
          {activeItem && activePoint && <div
            className={`${styles.chartValueTooltip} ${activeIndex === 0 ? styles.chartValueTooltipStart : ""} ${activeIndex === history.length - 1 ? styles.chartValueTooltipEnd : ""}`}
            role="status"
            style={{ left: `${(activePoint.x / width) * 100}%`, top: `${(activePoint.y / height) * 100}%` }}
          >
            <strong>{activeItem.recommendedMaxFeeGwei.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} Gwei</strong>
            {variation !== null && <span className={variation >= 0 ? styles.positiveVariation : styles.negativeVariation}>
              {variation >= 0 ? "+" : ""}{variation.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
            </span>}
          </div>}
        </div>
      </div>
      <div className={styles.xAxis}>{history.filter((_, index) => index % labelStep === 0).map((item) => <span key={item.timestamp}>{formatTime(item.timestamp)}</span>)}</div>
      <div className={styles.historyStats}>
        <Metric label="MÁXIMA NO PERÍODO" value={maximum} suffix="Gwei" />
        <Metric label="MÉDIA NO PERÍODO" value={average} suffix="Gwei" />
        <Metric label="PRIORIDADE ATUAL" value={history.at(-1)?.recommendedPriorityFeeGwei} suffix="Gwei" />
      </div>
    </>}
  </section>;
}
