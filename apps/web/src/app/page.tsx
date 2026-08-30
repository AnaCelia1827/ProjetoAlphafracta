"use client";

import { DashboardHeader } from "@/components/dashboard-header";
import { DataStatus } from "@/components/data-status";
import { FeeCard } from "@/components/fee-card";
import { FeeHistoryChart } from "@/components/fee-history-chart";
import { RecentBlocks } from "@/components/recent-blocks";
import { useDataAge } from "@/hooks/use-data-age";
import { useFeeHistory } from "@/hooks/use-fee-history";
import { useFeeStream } from "@/hooks/use-fee-stream";
import { useRecentBlocks } from "@/hooks/use-recent-blocks";
import styles from "./page.module.css";

export default function Home() {
  const { snapshot, connectionStatus, error: streamError } = useFeeStream();
  const { ageMs, dataStatus } = useDataAge(snapshot);
  const history = useFeeHistory();
  const recentBlocks = useRecentBlocks();

  return <>
    <DashboardHeader status={connectionStatus} />
    <main className={styles.page} id="live">
      <section className={styles.summary}>
        <FeeCard snapshot={snapshot} ageMs={ageMs} />
        <DataStatus snapshot={snapshot} connectionStatus={connectionStatus} dataStatus={dataStatus} error={streamError} />
      </section>
      <FeeHistoryChart history={history.history} loading={history.loading} error={history.error} onRefresh={history.refresh} />
      <RecentBlocks enabled={recentBlocks.enabled} blocks={recentBlocks.blocks} loading={recentBlocks.loading} error={recentBlocks.error} onRefresh={recentBlocks.refresh} />
    </main>
  </>;
}
