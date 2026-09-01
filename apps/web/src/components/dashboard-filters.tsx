'use client';

import Image from 'next/image';
import styles from '@/app/page.module.css';

type Props = {
  search: string;
  onSearchChange: (search: string) => void;
  onSearch: (search: string) => void;
};

export function DashboardFilters({ search, onSearchChange, onSearch }: Props) {
  const submitSearch = () => {
    const value = search.trim();
    if (value) {
      onSearch(value);
      document.getElementById('recent-blocks')?.scrollIntoView({ block: 'start' });
    }
  };

  return (
    <section className={styles.filters} aria-label="Filtros do dashboard">
      <div className={styles.filterControls}>
        <div className={styles.networkBadge} aria-label="Rede monitorada">
          Ethereum Mainnet
        </div>
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
