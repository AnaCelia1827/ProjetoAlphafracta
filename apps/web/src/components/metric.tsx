import styles from '@/app/page.module.css';

type MetricProps = { label: string; value?: number | string; suffix?: string };

export function Metric({ label, value, suffix }: MetricProps) {
  const formattedValue =
    typeof value === 'number' ? value.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : value;

  return (
    <div className={styles.metric}>
      <span>{label}</span>
      <p>
        <strong>{formattedValue ?? '—'}</strong>
        {suffix && <em>{suffix}</em>}
      </p>
    </div>
  );
}
