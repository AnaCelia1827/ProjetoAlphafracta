import styles from "@/app/page.module.css";
import type { RecentBlock } from "@/types/blocks";

type Props = {
  enabled: boolean;
  blocks: RecentBlock[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
};

export function RecentBlocks({ enabled, blocks, loading, error, onRefresh }: Props) {
  if (!enabled) return null;

  return <section className={`${styles.panel} ${styles.recentBlocksPanel}`}>
    <div className={styles.historyHeader}><div><h2>Blocos recentes</h2><p>Últimos blocos observados pela API</p></div></div>
    {loading && blocks.length === 0 ? <p className={styles.sectionState}>Carregando blocos…</p> : blocks.length === 0 ? (
      <div className={styles.sectionState}><p>{error ?? "Nenhum bloco foi recebido da API."}</p>{error && <button onClick={onRefresh}>Tentar novamente</button>}</div>
    ) : <div className={styles.recentBlocksList}>{blocks.map((block) => (
      <article key={block.hash}>
        <div><strong>#{block.number.toLocaleString("pt-BR")}</strong><span>{block.hash}</span></div>
        <span>{block.transactionCount} transações</span>
        <span>{block.baseFeeGwei.toLocaleString("pt-BR")} Gwei</span>
        <time dateTime={block.timestamp}>{new Date(block.timestamp).toLocaleTimeString("pt-BR")}</time>
      </article>
    ))}</div>}
  </section>;
}
