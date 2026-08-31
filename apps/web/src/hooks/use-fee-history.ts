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
  const [requestVersion, setRequestVersion] = useState(0);
  const requestKey = `${hours}:${requestVersion}`;
  const [result, setResult] = useState<{
    requestKey: string;
    history: FeeHistoryPoint[];
    error: string | null;
  }>({
    requestKey: apiConfig.useMockData ? requestKey : "",
    history: apiConfig.useMockData ? mockFeeHistory : [],
    error: null,
  });
  const refresh = useCallback(() => {
    if (apiConfig.useMockData) return;
    setRequestVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    if (apiConfig.useMockData) return;

    const controller = new AbortController();
    const to = new Date();
    const from = new Date(to.getTime() - hours * 60 * 60 * 1_000);

    void fetchAllFeeHistory(from, to, controller.signal)
      .then((items) => {
        setResult({ requestKey, history: items, error: null });
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setResult((current) => ({
          requestKey,
          history: current.history,
          error:
            reason instanceof Error
              ? reason.message
              : "Falha ao carregar o histórico.",
        }));
      });

    return () => controller.abort();
  }, [hours, requestKey]);

  const pending = !apiConfig.useMockData && result.requestKey !== requestKey;

  return {
    history: apiConfig.useMockData
      ? filterMockHistory(hours)
      : result.history,
    loading: pending,
    error: pending ? null : result.error,
    refresh,
  };
}
