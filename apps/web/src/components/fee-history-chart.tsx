"use client";

import { useState } from "react";
import styles from "@/app/page.module.css";
import { Metric } from "@/components/metric";
import type { FeeHistoryPoint, HistoryRangeMinutes } from "@/types/fees";

type Props = {
  history: FeeHistoryPoint[];
  rangeMinutes: HistoryRangeMinutes;
  onRangeChange: (minutes: HistoryRangeMinutes) => void;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
};

type PricedPoint = {
  item: FeeHistoryPoint & { maxCostUsd: number };
  historyIndex: number;
  x: number;
  y: number;
};

const RANGE_OPTIONS = [
  [5, "5m"],
  [15, "15m"],
  [60, "1h"],
  [360, "6h"],
  [1440, "24h"],
] as const;

const width = 1_000;
const height = 260;

function formatUsd(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatVariation(value: number | undefined) {
  if (value === undefined) return "—";
  return `${value > 0 ? "+" : ""}${formatUsd(value)}`;
}

export function FeeHistoryChart({
  history,
  rangeMinutes,
  onRangeChange,
  loading,
  error,
  onRefresh,
}: Props) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const pricedHistory = history.filter(
    (item): item is FeeHistoryPoint & { maxCostUsd: number } =>
      item.maxCostUsd !== undefined,
  );
  const maxValue =
    Math.max(1, ...pricedHistory.map((item) => item.maxCostUsd)) * 1.1;
  const denominator = Math.max(1, history.length - 1);
  const pricedPoints: PricedPoint[] = history.flatMap((item, historyIndex) => {
    if (item.maxCostUsd === undefined) return [];
    return [
      {
        item: item as FeeHistoryPoint & { maxCostUsd: number },
        historyIndex,
        x: (historyIndex / denominator) * width,
        y: height - (item.maxCostUsd / maxValue) * height,
      },
    ];
  });
  const segments = pricedPoints.reduce<PricedPoint[][]>((groups, point) => {
    const currentSegment = groups.at(-1);
    if (
      !currentSegment ||
      point.historyIndex !== currentSegment.at(-1)!.historyIndex + 1
    ) {
      groups.push([point]);
    } else {
      currentSegment.push(point);
    }
    return groups;
  }, []);
  const drawableSegments = segments.filter((segment) => segment.length > 1);
  const maximum = pricedHistory.length
    ? Math.max(...pricedHistory.map((item) => item.maxCostUsd))
    : undefined;
  const average = pricedHistory.length
    ? pricedHistory.reduce((total, item) => total + item.maxCostUsd, 0) /
      pricedHistory.length
    : undefined;
  const current = pricedHistory.at(-1)?.maxCostUsd;
  const previous = pricedHistory.at(-2)?.maxCostUsd;
  const currentVariation =
    current === undefined || previous === undefined
      ? undefined
      : current - previous;
  const activeIndex =
    hoveredIndex === null
      ? null
      : Math.min(hoveredIndex, pricedPoints.length - 1);
  const activePoint = activeIndex === null ? null : pricedPoints[activeIndex];
  const activePrevious =
    activeIndex === null || activeIndex === 0
      ? undefined
      : pricedPoints[activeIndex - 1]?.item.maxCostUsd;
  const activeVariation =
    activePoint === null || activePrevious === undefined
      ? undefined
      : activePoint.item.maxCostUsd - activePrevious;
  const labelStep = Math.max(1, Math.ceil(history.length / 6));

  const selectClosestPoint = (clientX: number, element: HTMLDivElement) => {
    if (pricedPoints.length === 0) return;
    const bounds = element.getBoundingClientRect();
    const x =
      Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width)) * width;
    const closestIndex = pricedPoints.reduce(
      (best, point, index) =>
        Math.abs(point.x - x) < Math.abs(pricedPoints[best]!.x - x)
          ? index
          : best,
      0,
    );
    setHoveredIndex(closestIndex);
  };

  return (
    <section className={`${styles.panel} ${styles.historyPanel}`} id="history">
      <div className={styles.historyHeader}>
        <div>
          <h2>Histórico do custo em USD</h2>
          <p>Estimativa para transferir ETH no período selecionado</p>
        </div>
        <div className={styles.historyRanges} aria-label="Período do histórico">
          {RANGE_OPTIONS.map(([minutes, label]) => (
            <button
              key={minutes}
              type="button"
              aria-pressed={rangeMinutes === minutes}
              className={
                rangeMinutes === minutes ? styles.rangeActive : undefined
              }
              onClick={() => onRangeChange(minutes)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && history.length === 0 ? (
        <p className={styles.sectionState}>Carregando histórico…</p>
      ) : pricedPoints.length === 0 ? (
        <div className={styles.sectionState}>
          <p>Histórico em USD indisponível neste período.</p>
          {error && <p className={styles.inlineError}>{error}</p>}
          {error && <button onClick={onRefresh}>Tentar novamente</button>}
        </div>
      ) : (
        <>
          {error && <p className={styles.inlineError}>{error}</p>}
          <div className={styles.graph}>
            <div className={styles.yAxis}>
              <span>{formatUsd(maxValue)}</span>
              <span>{formatUsd(maxValue / 2)}</span>
              <span>{formatUsd(0)}</span>
            </div>
            <div
              className={styles.graphPlot}
              tabIndex={0}
              aria-label="Gráfico interativo do custo em USD. Use o mouse ou as setas para consultar os valores."
              onPointerEnter={(event) =>
                selectClosestPoint(event.clientX, event.currentTarget)
              }
              onPointerMove={(event) =>
                selectClosestPoint(event.clientX, event.currentTarget)
              }
              onPointerLeave={() => setHoveredIndex(null)}
              onFocus={() =>
                setHoveredIndex((value) => value ?? pricedPoints.length - 1)
              }
              onBlur={() => setHoveredIndex(null)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setHoveredIndex(null);
                if (
                  event.key === "ArrowLeft" ||
                  event.key === "ArrowRight"
                ) {
                  event.preventDefault();
                  const direction = event.key === "ArrowLeft" ? -1 : 1;
                  setHoveredIndex((value) =>
                    Math.min(
                      pricedPoints.length - 1,
                      Math.max(
                        0,
                        (value ?? pricedPoints.length - 1) + direction,
                      ),
                    ),
                  );
                }
              }}
            >
              <svg
                role="img"
                aria-label="Histórico do custo estimado de transferência em USD"
                viewBox={`0 0 ${width} ${height}`}
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="usdArea" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0"
                      stopColor="var(--color-primary-hover)"
                      stopOpacity=".38"
                    />
                    <stop
                      offset="1"
                      stopColor="var(--color-primary-deep)"
                      stopOpacity="0"
                    />
                  </linearGradient>
                  <linearGradient id="usdLine" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="var(--color-primary)" />
                    <stop offset=".55" stopColor="var(--color-primary-hover)" />
                    <stop offset="1" stopColor="var(--color-primary-deep)" />
                  </linearGradient>
                </defs>
                {drawableSegments.map((segment) => {
                  const points = segment
                    .map(({ x, y }) => `${x},${y}`)
                    .join(" ");
                  const first = segment[0]!;
                  const last = segment.at(-1)!;
                  return (
                    <g key={first.item.timestamp}>
                      <polygon
                        points={`${first.x},${height} ${points} ${last.x},${height}`}
                        fill="url(#usdArea)"
                      />
                      <polyline
                        data-series="usd"
                        className={styles.feeLine}
                        points={points}
                        fill="none"
                        stroke="url(#usdLine)"
                        strokeWidth="4"
                        vectorEffect="non-scaling-stroke"
                      />
                    </g>
                  );
                })}
                {pricedPoints.map((point) => (
                  <circle
                    key={point.item.timestamp}
                    className={styles.usdPoint}
                    cx={point.x}
                    cy={point.y}
                    r="3"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {activePoint && (
                  <>
                    <line
                      className={styles.hoverGuide}
                      x1={activePoint.x}
                      x2={activePoint.x}
                      y1="0"
                      y2={height}
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle
                      className={styles.hoverPointHalo}
                      cx={activePoint.x}
                      cy={activePoint.y}
                      r="10"
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle
                      className={styles.hoverPoint}
                      cx={activePoint.x}
                      cy={activePoint.y}
                      r="5"
                      vectorEffect="non-scaling-stroke"
                    />
                  </>
                )}
              </svg>
              {activePoint && (
                <div
                  className={`${styles.chartValueTooltip} ${activeIndex === 0 ? styles.chartValueTooltipStart : ""} ${activeIndex === pricedPoints.length - 1 ? styles.chartValueTooltipEnd : ""}`}
                  role="status"
                  style={{
                    left: `${(activePoint.x / width) * 100}%`,
                    top: `${(activePoint.y / height) * 100}%`,
                  }}
                >
                  <strong>{formatUsd(activePoint.item.maxCostUsd)}</strong>
                  <small>
                    {activePoint.item.recommendedMaxFeeGwei.toLocaleString(
                      "pt-BR",
                      { maximumFractionDigits: 2 },
                    )} Gwei
                  </small>
                  {activeVariation !== undefined && (
                    <span
                      className={
                        activeVariation >= 0
                          ? styles.positiveVariation
                          : styles.negativeVariation
                      }
                    >
                      {formatVariation(activeVariation)}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className={styles.xAxis}>
            {history
              .filter((_, index) => index % labelStep === 0)
              .map((item) => (
                <span key={item.timestamp}>{formatTime(item.timestamp)}</span>
              ))}
          </div>
          <div className={styles.historyStats}>
            <Metric
              label="MÁXIMA NO PERÍODO"
              value={maximum}
              suffix="USD"
            />
            <Metric
              label="MÉDIA NO PERÍODO"
              value={average}
              suffix="USD"
            />
            <Metric
              label="CUSTO ATUAL"
              value={current === undefined ? undefined : formatUsd(current)}
            />
            <Metric
              label="VARIAÇÃO RECENTE"
              value={formatVariation(currentVariation)}
            />
          </div>
        </>
      )}
    </section>
  );
}
