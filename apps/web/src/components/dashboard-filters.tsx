"use client";

import Image from "next/image";
import styles from "@/app/page.module.css";
import type { HistoryRangeMinutes } from "@/types/fees";

type Props = {
  rangeMinutes: HistoryRangeMinutes;
  search: string;
  onRangeChange: (minutes: HistoryRangeMinutes) => void;
  onSearchChange: (search: string) => void;
  onSearch: (search: string) => void;
};

export function DashboardFilters({
  rangeMinutes,
  search,
  onRangeChange,
  onSearchChange,
  onSearch,
}: Props) {
  const submitSearch = () => {
    const value = search.trim();
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
            value={rangeMinutes}
            onChange={(event) =>
              onRangeChange(Number(event.target.value) as HistoryRangeMinutes)
            }
          >
            <option value={5}>Últimos 5 minutos</option>
            <option value={15}>Últimos 15 minutos</option>
            <option value={60}>Última hora</option>
            <option value={360}>Últimas 6 horas</option>
            <option value={1440}>Últimas 24 horas</option>
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
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
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
