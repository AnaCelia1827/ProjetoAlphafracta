'use client';

import { useState } from 'react';
import { DashboardHeader } from '@/components/dashboard-header';
import { DashboardFilters } from '@/components/dashboard-filters';
import { FeeCard } from '@/components/fee-card';
import { FeeHistoryChart } from '@/components/fee-history-chart';
import { NetworkMomentCard } from '@/components/network-moment-card';
import { RecentBlocks } from '@/components/recent-blocks';
import { useBlockSearch } from '@/hooks/use-block-search';
import { useDataAge } from '@/hooks/use-data-age';
import { useFeeHistory } from '@/hooks/use-fee-history';
import { useLiveMonitor } from '@/hooks/use-live-monitor';
import { apiConfig } from '@/lib/api/config';
import { classifyNetworkMoment } from '@/lib/fees/network-moment';
import type { HistoryRangeMinutes } from '@/types/fees';
import styles from './page.module.css';

export default function Home() {
  const [rangeMinutes, setRangeMinutes] = useState<HistoryRangeMinutes>(1440);
  const [blockSearchValue, setBlockSearchValue] = useState('');
  const live = useLiveMonitor();
  const blockSearch = useBlockSearch();
  const { ageMs } = useDataAge(live.fee);
  const history = useFeeHistory(rangeMinutes);
  const moment = classifyNetworkMoment(live.fee?.maxCostUsd, history.baseline24h);

  const searchBlock = (identifier: string) => {
    void blockSearch.search(identifier);
  };

  const backToLive = () => {
    setBlockSearchValue('');
    blockSearch.backToLive();
  };

  return (
    <>
      <DashboardHeader status={live.connection} demo={apiConfig.useMockData} />
      <main className={styles.page} id="dashboard">
        <DashboardFilters
          search={blockSearchValue}
          onSearchChange={setBlockSearchValue}
          onSearch={searchBlock}
        />
        <section className={styles.summary} id="live">
          <FeeCard snapshot={live.fee} ageMs={ageMs} />
          <NetworkMomentCard moment={moment} error={history.error} />
        </section>
        <FeeHistoryChart
          history={history.history}
          rangeMinutes={rangeMinutes}
          onRangeChange={setRangeMinutes}
          loading={history.loading}
          error={history.error}
          onRefresh={history.refresh}
        />
        <RecentBlocks
          blocks={live.blocks}
          searchedBlock={blockSearch.searchedBlock}
          onBackToLive={backToLive}
          loading={live.bootstrapLoading}
          searching={blockSearch.searching}
          error={blockSearch.error ?? live.blocksError?.message ?? null}
          onRefresh={() => void live.refresh()}
        />
      </main>
    </>
  );
}
