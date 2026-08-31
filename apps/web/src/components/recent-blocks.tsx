"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "@/app/page.module.css";
import { Metric } from "@/components/metric";
import type { RecentBlock } from "@/types/blocks";

type Props = {
  enabled: boolean;
  blocks: RecentBlock[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
};

const conditionLabels = { normal: "Normal", elevated: "Elevado" } as const;
const statusLabels = { confirmed: "Confirmado", pending: "Pendente" } as const;

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function RecentBlocks({ enabled, blocks, loading, error, onRefresh }: Props) {
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  if (!enabled) return null;

  if (loading && blocks.length === 0) {
    return <section id="recent-blocks" className={`${styles.panel} ${styles.recentBlocksPanel}`}><p className={styles.sectionState}>Carregando blocos…</p></section>;
  }

  if (blocks.length === 0) {
    return <section id="recent-blocks" className={`${styles.panel} ${styles.recentBlocksPanel}`}><div className={styles.sectionState}><p>{error ?? "Nenhum bloco encontrado."}</p>{error && <button onClick={onRefresh}>Tentar novamente</button>}</div></section>;
  }

  const selected = blocks.find((block) => block.hash === selectedHash) ?? blocks[0];
  const priorityFee = selected.priorityFeeGwei ?? 0;
  const totalFee = selected.baseFeeGwei + priorityFee;
  const condition = selected.condition ?? "normal";
  const status = selected.status ?? "confirmed";

  return <section id="recent-blocks" className={styles.blocksPanel} aria-label="Histórico de blocos">
    <aside className={styles.blockList} aria-label="Blocos recentes">
      {blocks.map((block, index) => {
        const blockCondition = block.condition ?? "normal";
        const isSelected = block.hash === selected.hash;
        return <button
          className={`${styles.blockRow} ${isSelected ? styles.selected : ""}`}
          key={block.hash}
          type="button"
          onClick={() => setSelectedHash(block.hash)}
          aria-pressed={isSelected}
        >
          <i className={`${styles.blockThumb} ${index % 2 ? styles.teal : styles.purple}`}>
            <Image src="/figma/avatar.jpeg" alt="" width={38} height={38} />
          </i>
          <span><b>#{block.number}</b><small>{formatTime(block.timestamp)}</small></span>
          <em>{conditionLabels[blockCondition]}</em>
          <strong>{block.baseFeeGwei.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} Gwei</strong>
        </button>;
      })}
    </aside>

    <article className={styles.details}>
      <header className={styles.detailsHeader}>
        <div><span>Detalhes do bloco</span><p>#{selected.number}</p></div>
        <em>{conditionLabels[condition]}</em>
        <div className={styles.provider}><span>Provedor</span><strong>Alchemy <Image src="/figma/provider.svg" alt="" width={18} height={19} /></strong></div>
        <Image className={styles.avatar} src="/figma/avatar.jpeg" alt="" width={42} height={42} />
      </header>

      <div className={styles.detailCards}>
        <div className={styles.detailMetric}><span>Base Fee</span><strong>{selected.baseFeeGwei.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} Gwei</strong><small>{selected.transactionCount} transações</small></div>
        <div className={styles.detailMetric}><span>Priority Fee</span><strong>{priorityFee.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} Gwei</strong><small>Miner tip</small></div>
        <button className={styles.add} type="button" aria-label="Adicionar métrica"><span>+</span></button>
      </div>

      <footer className={styles.detailsFooter}>
        <Metric label="TOTAL FEE" value={totalFee} suffix="Gwei" />
        <Metric label="STATUS" value={statusLabels[status]} />
        <div>
          <button className={styles.share} type="button" aria-label="Compartilhar bloco"><Image src="/figma/block-b.svg" alt="" width={18} height={20} /></button>
          <button className={styles.analyze} type="button">Analisar bloco</button>
        </div>
      </footer>
    </article>
  </section>;
}
