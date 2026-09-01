import styles from '@/app/page.module.css';
import type { FeeViewModel } from '@/types/fees';

const priceStatusLabels: Record<FeeViewModel['priceStatus'], string> = {
  fresh: 'Cotação atualizada',
  stale: 'Cotação desatualizada',
  unavailable: 'Sem cotação atual',
};

function formatUsd(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

function formatGwei(value: number | undefined) {
  return value === undefined
    ? '—'
    : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} Gwei`;
}

function formatDataAge(ageMs: number | null) {
  if (ageMs === null) return 'Aguardando atualização';
  return `Atualizado há ${Math.max(0, Math.round(ageMs / 1000))}s`;
}

export function FeeCard({
  snapshot,
  ageMs,
}: {
  snapshot: FeeViewModel | null;
  ageMs: number | null;
}) {
  return (
    <article className={`${styles.panel} ${styles.feeCard}`}>
      <div className={styles.transferHero}>
        <span>Custo estimado para transferir ETH</span>
        <strong>
          {snapshot?.maxCostUsd === undefined
            ? 'Cotação indisponível'
            : formatUsd(snapshot.maxCostUsd)}
        </strong>
        <small className={styles.transferFreshness}>{formatDataAge(ageMs)}</small>
        <small>Estimativa para uma transferência simples de 21.000 gas</small>
      </div>

      <div className={styles.feeSecondaryGrid}>
        <p>
          <span>Máxima recomendada</span>
          <strong>{formatGwei(snapshot?.recommendedMaxFeeGwei)}</strong>
        </p>
        <p>
          <span>Prioridade</span>
          <strong>{formatGwei(snapshot?.recommendedPriorityFeeGwei)}</strong>
        </p>
        <p>
          <span>Base fee</span>
          <strong>{formatGwei(snapshot?.baseFeeGwei)}</strong>
        </p>
        <p>
          <span>Status da cotação</span>
          <strong>{snapshot ? priceStatusLabels[snapshot.priceStatus] : 'Aguardando dados'}</strong>
        </p>
      </div>
    </article>
  );
}
