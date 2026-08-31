"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import styles from "@/app/page.module.css";
import type { HistoryRangeHours } from "@/types/fees";

type Props = {
  rangeHours: HistoryRangeHours;
  search: string;
  onRangeChange: (hours: HistoryRangeHours) => void;
  onSearch: (search: string) => void;
};

export function DashboardFilters({
  rangeHours,
  search,
  onRangeChange,
  onSearch,
}: Props) {
  const [draft, setDraft] = useState(search);

  useEffect(() => setDraft(search), [search]);

  const submitSearch = () => {
    const value = draft.trim();
    if (value) {
      onSearch(value);
      document
        .getElementById("recent-blocks")
        ?.scrollIntoView({ block: "start" });
    }
  };

  return (
    <section className={styles.filters} aria-label="Filtros do dashboard">
      <div className={styles.filterControls}>
        <div className={styles.networkBadge} aria-label="Rede monitorada">
          Ethereum Mainnet
        </div>
        <label className={styles.filterSelect}>
          <span className={styles.srOnly}>Período do histórico</span>
          <select
            aria-label="Período do histórico"
            value={rangeHours}
            onChange={(event) =>
              onRangeChange(Number(event.target.value) as HistoryRangeHours)
            }
          >
            <option value={1}>Última hora</option>
            <option value={6}>Últimas 6 horas</option>
            <option value={24}>Últimas 24 horas</option>
          </select>
          <Image src="/figma/chevron.svg" alt="" width={12} height={8} />
        </label>
        <form
          className={styles.filterSearch}
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch();
          }}
        >
          <input
            type="search"
            placeholder="Buscar bloco ou hash..."
            aria-label="Buscar blocos"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            className={styles.filterSearchButton}
            type="submit"
            aria-label="Pesquisar bloco"
            aria-controls="recent-blocks"
          >
            <Image src="/figma/search.svg" alt="" width={18} height={18} />
          </button>
        </form>
      </div>
    </section>
  );
}
