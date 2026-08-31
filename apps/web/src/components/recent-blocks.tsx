"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "@/app/page.module.css";
import { Metric } from "@/components/metric";
import type { BlockViewModel } from "@/types/blocks";

type Props = {
  blocks: BlockViewModel[];
  searchedBlock: BlockViewModel | null;
  onBackToLive: () => void;
  loading?: boolean;
  searching?: boolean;
  error?: string | null;
  onRefresh?: () => void;
};

const feeLevelLabels: Record<BlockViewModel["feeLevel"], string> = {
  low: "Baixo",
  normal: "Normal",
  elevated: "Elevado",
  high: "Alto",
  unavailable: "Indisponível",
};

const finalityLabels: Record<BlockViewModel["finality"], string> = {
  latest: "Recente",
  safe: "Seguro",
  finalized: "Finalizado",
};

function formatTime(timestamp: string) {
  return new Date(timestamp).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function RecentBlocks({
  blocks,
  searchedBlock,
  onBackToLive,
  loading = false,
  searching = false,
  error = null,
  onRefresh,
}: Props) {
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [shareNotice, setShareNotice] = useState<{
    hash: string;
    message: string;
  } | null>(null);

  if ((loading || searching) && blocks.length === 0 && !searchedBlock) {
    return (
      <section
        id="recent-blocks"
        className={`${styles.panel} ${styles.recentBlocksPanel}`}
      >
        <p className={styles.sectionState} role="status">
          {searching ? "Buscando bloco…" : "Carregando blocos…"}
        </p>
      </section>
    );
  }

  if (blocks.length === 0 && !searchedBlock) {
    return (
      <section
        id="recent-blocks"
        className={`${styles.panel} ${styles.recentBlocksPanel}`}
      >
        <div className={styles.sectionState}>
          <p>{error ?? "Nenhum bloco encontrado."}</p>
          {error && onRefresh && (
            <button type="button" onClick={onRefresh}>
              Tentar novamente
            </button>
          )}
        </div>
      </section>
    );
  }

  const selected =
    searchedBlock ??
    blocks.find((block) => block.hash === selectedHash) ??
    blocks[0]!;

  const shareBlock = async () => {
    setShareNotice(null);
    const data = {
      title: `Bloco Ethereum #${selected.number}`,
      text: `Bloco Ethereum #${selected.number} monitorado pela Alphractal`,
      url: selected.etherscanUrl,
    };

    try {
      if (!navigator.share) {
        throw new Error("Web Share indisponível");
      }
      await navigator.share(data);
      setShareNotice({ hash: selected.hash, message: "Compartilhado" });
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") {
        return;
      }
      try {
        await navigator.clipboard.writeText(selected.etherscanUrl);
        setShareNotice({ hash: selected.hash, message: "Link copiado" });
      } catch {
        setShareNotice({
          hash: selected.hash,
          message: "Não foi possível compartilhar",
        });
      }
    }
  };

  return (
    <section
      id="recent-blocks"
      className={styles.blocksPanel}
      aria-label="Histórico de blocos"
      aria-busy={searching}
    >
      <aside className={styles.blockList} aria-label="Blocos recentes">
        {searching && (
          <p className={styles.searchStatus} role="status">
            Buscando bloco…
          </p>
        )}
        {error && (
          <p className={styles.blockError} role="alert">
            {error}
          </p>
        )}
        {searchedBlock && (
          <button
            className={styles.backToLive}
            type="button"
            onClick={onBackToLive}
          >
            Voltar ao vivo
          </button>
        )}
        {blocks.map((block) => {
          const isSelected = !searchedBlock && block.hash === selected.hash;
          return (
            <button
              className={`${styles.blockRow} ${isSelected ? styles.selected : ""}`}
              key={block.hash}
              type="button"
              onClick={() => setSelectedHash(block.hash)}
              aria-pressed={isSelected}
            >
              <i className={styles.blockThumb}>
                <Image
                  src="/figma/avatar.jpeg"
                  alt=""
                  width={38}
                  height={38}
                />
              </i>
              <span>
                <b>#{block.number}</b>
                <small>{formatTime(block.timestamp)}</small>
              </span>
              <em>{feeLevelLabels[block.feeLevel]}</em>
              <strong>
                {block.baseFeeGwei.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                })}{" "}
                Gwei
              </strong>
            </button>
          );
        })}
      </aside>

      <article className={styles.details}>
        <header className={styles.detailsHeader}>
          <div>
            <span>{searchedBlock ? "Resultado da busca" : "Detalhes do bloco"}</span>
            <p>#{selected.number}</p>
          </div>
          <em>{feeLevelLabels[selected.feeLevel]}</em>
          <div className={styles.provider}>
            <span>Provedor</span>
            <strong>
              Alchemy
              <Image
                src="/figma/provider.svg"
                alt=""
                width={18}
                height={19}
              />
            </strong>
          </div>
          <Image
            className={styles.avatar}
            src="/figma/avatar.jpeg"
            alt=""
            width={42}
            height={42}
          />
        </header>

        <div className={styles.detailCards}>
          <div className={styles.detailMetric}>
            <span>Base Fee</span>
            <strong>{selected.baseFeeGwei.toLocaleString("pt-BR")} Gwei</strong>
            <small>{selected.transactionCount} transações</small>
          </div>
          <div className={styles.detailMetric}>
            <span>Priority Fee</span>
            <strong>{selected.priorityFeeGwei.toLocaleString("pt-BR")} Gwei</strong>
            <small>{selected.utilizationPercent.toLocaleString("pt-BR")}% utilizado</small>
          </div>
        </div>

        <footer className={styles.detailsFooter}>
          <Metric
            label="PREÇO EFETIVO"
            value={selected.effectiveGasPriceGwei}
            suffix="Gwei"
          />
          <Metric label="FINALIDADE" value={finalityLabels[selected.finality]} />
          <div>
            <button
              className={styles.share}
              type="button"
              aria-label="Compartilhar bloco"
              onClick={() => void shareBlock()}
            >
              <Image
                src="/figma/block-b.svg"
                alt=""
                width={18}
                height={20}
              />
            </button>
            <button
              className={styles.analyze}
              type="button"
              onClick={() =>
                window.open(
                  selected.etherscanUrl,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
            >
              Analisar bloco
            </button>
          </div>
          {shareNotice?.hash === selected.hash && (
            <p className={styles.shareNotice} role="status">
              {shareNotice.message}
            </p>
          )}
        </footer>
      </article>
    </section>
  );
}
