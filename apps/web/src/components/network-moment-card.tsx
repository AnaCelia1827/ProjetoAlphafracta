import styles from "@/app/page.module.css";
import type { NetworkMoment } from "@/lib/fees/network-moment";

export function NetworkMomentCard({
  moment,
  error,
}: {
  moment: NetworkMoment;
  error: string | null;
}) {
  return (
    <article className={`${styles.panel} ${styles.networkMoment}`}>
      <header>
        <span>Momento da rede</span>
        <strong className={styles[moment.level]}>{moment.label}</strong>
      </header>
      <h2>{moment.message}</h2>
      <p>Comparação com os custos observados nas últimas 24 horas.</p>
      {error && <p className={styles.errorMessage}>{error}</p>}
      <small>O custo pode mudar antes do envio da transação.</small>
    </article>
  );
}
