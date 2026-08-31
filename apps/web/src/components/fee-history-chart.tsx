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
  const values = history.flatMap((item) => [item.recommendedMaxFeeGwei, item.recommendedPriorityFeeGwei]);
  const maxValue = Math.max(1, ...values) * 1.1;
  const denominator = Math.max(1, history.length - 1);
  const makePoints = (field: "recommendedMaxFeeGwei" | "recommendedPriorityFeeGwei") => history.map((item, index) => {
    const x = (index / denominator) * width;
    const y = height - (item[field] / maxValue) * height;
    return `${x},${y}`;
  }).join(" ");
  const maxFeePoints = makePoints("recommendedMaxFeeGwei");
  const priorityPoints = makePoints("recommendedPriorityFeeGwei");
  const areaPoints = history.length ? `0,${height} ${maxFeePoints} ${width},${height}` : "";
  const labelStep = Math.max(1, Math.ceil(history.length / 6));
  const maximum = history.length ? Math.max(...history.map((item) => item.recommendedMaxFeeGwei)) : undefined;
  const average = history.length ? history.reduce((total, item) => total + item.recommendedMaxFeeGwei, 0) / history.length : undefined;

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
        <svg role="img" aria-label="Histórico de taxas recomendadas em Gwei" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="feeArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#123bbf" stopOpacity=".38" /><stop offset="1" stopColor="#020068" stopOpacity="0" /></linearGradient>
            <linearGradient id="feeLine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#1946e5" /><stop offset=".55" stopColor="#0b2b9c" /><stop offset="1" stopColor="#020068" /></linearGradient>
          </defs>
          <polygon points={areaPoints} fill="url(#feeArea)" />
          <polyline points={maxFeePoints} fill="none" stroke="url(#feeLine)" strokeWidth="4" vectorEffect="non-scaling-stroke" />
          <polyline points={priorityPoints} fill="none" stroke="#315fd1" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        </svg>
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
