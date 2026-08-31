"use client";

import { useCallback, useEffect, useState } from "react";
import { apiConfig } from "@/lib/api/config";
import { fetchAllFeeHistory } from "@/lib/api/fetch-fee-history";
import { mockFeeHistory } from "@/mocks/fee-snapshot";
import type { FeeHistoryPoint } from "@/types/fees";

function filterMockHistory(hours: number) {
  const lastTimestamp = Date.parse(mockFeeHistory.at(-1)?.timestamp ?? "");
  const cutoff = lastTimestamp - hours * 60 * 60 * 1_000;
  return mockFeeHistory.filter((item) => Date.parse(item.timestamp) >= cutoff);
}

export function useFeeHistory(hours = 6) {
  const [history, setHistory] = useState<FeeHistoryPoint[]>(
    apiConfig.useMockData ? mockFeeHistory : [],
  );
  const [loading, setLoading] = useState(!apiConfig.useMockData);
  const [error, setError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const refresh = useCallback(() => {
    if (apiConfig.useMockData) return;
    setLoading(true);
    setError(null);
    setRequestVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    if (apiConfig.useMockData) return;

    const controller = new AbortController();
    const to = new Date();
    const from = new Date(to.getTime() - hours * 60 * 60 * 1_000);
    setLoading(true);
    setError(null);

    void fetchAllFeeHistory(from, to, controller.signal)
      .then((items) => {
        setHistory(items);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Falha ao carregar o histórico.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [hours, requestVersion]);

  return {
    history: apiConfig.useMockData ? filterMockHistory(hours) : history,
    loading,
    error,
    refresh,
  };
}
