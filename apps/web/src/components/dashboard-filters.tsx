import Image from "next/image";
import styles from "@/app/page.module.css";
import type { HistoryRangeHours, NetworkFilter } from "@/types/fees";

type Props = {
  network: NetworkFilter;
  rangeHours: HistoryRangeHours;
  search: string;
  onNetworkChange: (network: NetworkFilter) => void;
  onRangeChange: (hours: HistoryRangeHours) => void;
  onSearchChange: (search: string) => void;
};

export function DashboardFilters({ network, rangeHours, search, onNetworkChange, onRangeChange, onSearchChange }: Props) {
  return (
    <section className={styles.filters} aria-label="Dashboard filters">
      <div className={styles.filterControls}>
        <label className={styles.filterSelect}>
          <select aria-label="Network" value={network} onChange={(event) => onNetworkChange(event.target.value as NetworkFilter)}>
            <option value="all">All Networks</option>
            <option value="ethereum-mainnet">Ethereum Mainnet</option>
          </select>
          <Image src="/figma/chevron.svg" alt="" width={12} height={8} />
        </label>
        <label className={styles.filterSelect}>
          <select aria-label="Time range" value={rangeHours} onChange={(event) => onRangeChange(Number(event.target.value) as HistoryRangeHours)}>
            <option value={1}>Last Hour</option>
            <option value={6}>Last 6 Hours</option>
            <option value={24}>Last 24 Hours</option>
          </select>
          <Image src="/figma/chevron.svg" alt="" width={12} height={8} />
        </label>
        <label className={styles.filterSearch}>
          <input type="search" placeholder="Search blocks..." aria-label="Search blocks" value={search} onChange={(event) => onSearchChange(event.target.value)} />
          <Image src="/figma/search.svg" alt="" width={18} height={18} />
        </label>
      </div>
    </section>
  );
}
