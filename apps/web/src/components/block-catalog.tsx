"use client";

import { FormEvent, useState } from "react";
import styles from "@/app/page.module.css";
import { BlockIcon } from "@/components/block-icon";
import { DashboardHeader } from "@/components/dashboard-header";
import { useBlockCatalog } from "@/hooks/use-block-catalog";
import { useBlockSearch } from "@/hooks/use-block-search";
import { apiConfig } from "@/lib/api/config";
import type { BlockViewModel } from "@/types/blocks";

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
  return new Date(timestamp).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

type BlockCatalogViewProps = {
  blocks: BlockViewModel[];
  pageNumber: number;
  itemRange: { from: number; to: number };
  canPrevious: boolean;
  canNext: boolean;
  loading: boolean;
  error: string | null;
  onNext(): Promise<void>;
  onPrevious(): void;
  onRefresh(): Promise<void>;
  searchedBlock?: BlockViewModel | null;
  searching?: boolean;
  searchError?: string | null;
  onBackToCatalog?: () => void;
};

export function BlockCatalogView({
  blocks,
  pageNumber,
  itemRange,
  canPrevious,
  canNext,
  loading,
  error,
  onNext,
  onPrevious,
  onRefresh,
  searchedBlock = null,
  searching = false,
  searchError = null,
  onBackToCatalog,
}: BlockCatalogViewProps) {
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const visibleBlocks = blocks.slice(0, 10);
  const selected =
    searchedBlock ??
    visibleBlocks.find((block) => block.hash === selectedHash) ??
    visibleBlocks[0];

  return (
    <section
      className={`${styles.catalogGrid} ${selected ? "" : styles.catalogGridSingle}`}
      aria-busy={loading || searching}
    >
      <aside className={styles.catalogList} aria-label="Catálogo de blocos">
        <div className={styles.catalogListHeader}>
          <div>
            <span>Histórico completo</span>
            <strong>{`Página ${pageNumber} · itens ${itemRange.from}–${itemRange.to}`}</strong>
          </div>
          <button
            className={styles.catalogRefresh}
            type="button"
            disabled={loading}
            onClick={() => void onRefresh()}
          >
            Atualizar
          </button>
        </div>

        {(error || searchError) && (
          <p className={styles.blockError} role="alert">
            {searchError ?? error}
          </p>
        )}
        {searching && (
          <p className={styles.searchStatus} role="status">
            Buscando bloco…
          </p>
        )}
        {searchedBlock && onBackToCatalog && (
          <button
            className={styles.backToLive}
            type="button"
            onClick={onBackToCatalog}
          >
            Voltar ao catálogo
          </button>
        )}

        <div className={styles.catalogRows}>
          {visibleBlocks.length === 0 && !searchedBlock && (
            <div className={styles.catalogEmpty}>
              <p role={loading ? "status" : undefined}>
                {loading ? "Carregando catálogo…" : "Nenhum bloco encontrado."}
              </p>
            </div>
          )}
          {visibleBlocks.map((block) => {
            const isSelected =
              !searchedBlock && block.hash === selected?.hash;
            return (
              <button
                className={`${styles.blockRow} ${isSelected ? styles.selected : ""}`}
                key={block.hash}
                type="button"
                onClick={() => setSelectedHash(block.hash)}
                aria-pressed={isSelected}
              >
                <BlockIcon selected={isSelected} />
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
        </div>

        <nav className={styles.catalogPagination} aria-label="Paginação">
          <button
            type="button"
            disabled={!canPrevious || loading}
            onClick={onPrevious}
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={!canNext || loading}
            onClick={() => void onNext()}
          >
            Próxima
          </button>
        </nav>
      </aside>

      {selected && (
        <article className={styles.catalogDetails}>
          <header className={styles.catalogDetailsHeader}>
            <div>
              <span>
                {searchedBlock ? "Resultado da busca" : "Detalhes do bloco"}
              </span>
              <h2>#{selected.number}</h2>
            </div>
            <BlockIcon selected size="detail" />
          </header>
          <dl className={styles.catalogMetrics}>
            <div>
              <dt>Taxa-base</dt>
              <dd>{selected.baseFeeGwei.toLocaleString("pt-BR")} Gwei</dd>
            </div>
            <div>
              <dt>Taxa de prioridade</dt>
              <dd>{selected.priorityFeeGwei.toLocaleString("pt-BR")} Gwei</dd>
            </div>
            <div>
              <dt>Preço efetivo</dt>
              <dd>
                {selected.effectiveGasPriceGwei.toLocaleString("pt-BR")} Gwei
              </dd>
            </div>
            <div>
              <dt>Utilização</dt>
              <dd>{selected.utilizationPercent.toLocaleString("pt-BR")}%</dd>
            </div>
            <div>
              <dt>Transações</dt>
              <dd>{selected.transactionCount.toLocaleString("pt-BR")}</dd>
            </div>
            <div>
              <dt>Finalidade</dt>
              <dd>{finalityLabels[selected.finality]}</dd>
            </div>
          </dl>
          <a
            className={styles.catalogAnalyze}
            href={selected.etherscanUrl}
            target="_blank"
            rel="noreferrer"
          >
            Analisar no Etherscan
          </a>
        </article>
      )}
    </section>
  );
}

export function BlockCatalog() {
  const catalog = useBlockCatalog();
  const blockSearch = useBlockSearch();
  const [search, setSearch] = useState("");

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void blockSearch.search(search);
  };

  const backToCatalog = () => {
    setSearch("");
    blockSearch.backToLive();
  };

  return (
    <>
      <DashboardHeader activePage="blocks" demo={apiConfig.useMockData} />
      <main className={`${styles.page} ${styles.catalogPage}`}>
        <header className={styles.catalogHero}>
          <div>
            <span>Rede principal Ethereum</span>
            <h1>Catálogo de blocos</h1>
            <p>Consulte o histórico em páginas sequenciais de dez blocos.</p>
          </div>
          <form className={styles.catalogSearch} onSubmit={submitSearch}>
            <label htmlFor="catalog-search">Buscar bloco</label>
            <div>
              <input
                id="catalog-search"
                type="search"
                placeholder="Número ou hash"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <button type="submit" disabled={blockSearch.searching}>
                Buscar
              </button>
            </div>
          </form>
        </header>
        <BlockCatalogView
          {...catalog}
          onNext={catalog.next}
          onPrevious={catalog.previous}
          onRefresh={catalog.refresh}
          searchedBlock={blockSearch.searchedBlock}
          searching={blockSearch.searching}
          searchError={blockSearch.error}
          onBackToCatalog={backToCatalog}
        />
      </main>
    </>
  );
}
