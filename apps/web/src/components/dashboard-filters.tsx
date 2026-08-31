"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
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

type FilterOption = { value: string; label: string };

type FilterDropdownProps = {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
};

function FilterDropdown({ label, value, options, onChange }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedLabel = options.find((option) => option.value === value)?.label ?? value;

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <div className={styles.filterDropdown} ref={containerRef}>
    <button
      className={styles.filterTrigger}
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={() => setOpen((current) => !current)}
    >
      <span>{selectedLabel}</span>
      <Image className={open ? styles.chevronOpen : ""} src="/figma/chevron.svg" alt="" width={12} height={8} />
    </button>
    {open && <div className={styles.filterMenu} role="listbox" aria-label={label}>
      {options.map((option) => <button
        className={`${styles.filterMenuOption} ${option.value === value ? styles.filterMenuOptionSelected : ""}`}
        type="button"
        role="option"
        aria-selected={option.value === value}
        key={option.value}
        onClick={() => {
          onChange(option.value);
          setOpen(false);
        }}
      >
        {option.label}
        {option.value === value && <span aria-hidden="true">✓</span>}
      </button>)}
    </div>}
  </div>;
}

export function DashboardFilters({ network, rangeHours, search, onNetworkChange, onRangeChange, onSearchChange }: Props) {
  return (
    <section className={styles.filters} aria-label="Dashboard filters">
      <div className={styles.filterControls}>
        <FilterDropdown
          label="Network"
          value={network}
          options={[{ value: "all", label: "All Networks" }, { value: "ethereum-mainnet", label: "Ethereum Mainnet" }]}
          onChange={(value) => onNetworkChange(value as NetworkFilter)}
        />
        <FilterDropdown
          label="Time range"
          value={String(rangeHours)}
          options={[{ value: "1", label: "Last Hour" }, { value: "6", label: "Last 6 Hours" }, { value: "24", label: "Last 24 Hours" }]}
          onChange={(value) => onRangeChange(Number(value) as HistoryRangeHours)}
        />
        <div className={styles.filterSearch}>
          <input type="search" placeholder="Search blocks..." aria-label="Search blocks" value={search} onChange={(event) => onSearchChange(event.target.value)} />
          <button
            className={styles.filterSearchButton}
            type="button"
            aria-label="Pesquisar e ir para os blocos recentes"
            aria-controls="recent-blocks"
            onClick={() => document.getElementById("recent-blocks")?.scrollIntoView({ block: "start" })}
          >
            <Image src="/figma/search.svg" alt="" width={18} height={18} />
          </button>
        </div>
      </div>
    </section>
  );
}
