"use client";

import { useCallback, useEffect, useState } from "react";
import { apiConfig } from "@/lib/api/config";
import { fetchAllFeeHistory } from "@/lib/api/fetch-fee-history";
import { mockFeeHistory } from "@/mocks/fee-snapshot";
import type { FeeHistoryPoint, HistoryRangeMinutes } from "@/types/fees";

type FeeHistoryResult = {
  history: FeeHistoryPoint[];
  baseline24h: FeeHistoryPoint[];
  loading: boolean;
  error: string | null;
  refresh(): void;
};

type StoredResult = {
  requestKey: string;
  history: FeeHistoryPoint[];
  baseline24h: FeeHistoryPoint[];
  error: string | null;
};

function filterMockHistory(rangeMinutes: HistoryRangeMinutes) {
  const lastTimestamp = Date.parse(mockFeeHistory.at(-1)?.timestamp ?? "");
  const cutoff = lastTimestamp - rangeMinutes * 60_000;
  return mockFeeHistory.filter((item) => Date.parse(item.timestamp) >= cutoff);
}

export function useFeeHistory(
  rangeMinutes: HistoryRangeMinutes = 360,
): FeeHistoryResult {
  const [requestVersion, setRequestVersion] = useState(0);
  const requestKey = `${rangeMinutes}:${requestVersion}`;
  const [result, setResult] = useState<StoredResult>({
    requestKey: apiConfig.useMockData ? requestKey : "",
    history: apiConfig.useMockData ? filterMockHistory(rangeMinutes) : [],
    baseline24h: apiConfig.useMockData ? mockFeeHistory : [],
    error: null,
  });
  const refresh = useCallback(() => {
    if (apiConfig.useMockData) return;
    setRequestVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    if (apiConfig.useMockData) return;

    const controller = new AbortController();
    let active = true;
    const to = new Date();
    const baselineFrom = new Date(to.getTime() - 1440 * 60_000);
    const selectedFrom = new Date(
      to.getTime() - rangeMinutes * 60_000,
    );
    const baselinePromise = fetchAllFeeHistory(
      baselineFrom,
      to,
      controller.signal,
    );
    const selectedPromise =
      rangeMinutes === 1440
        ? baselinePromise
        : fetchAllFeeHistory(selectedFrom, to, controller.signal);

    void Promise.all([baselinePromise, selectedPromise])
      .then(([baseline24h, history]) => {
        if (!active) return;
        setResult({ requestKey, history, baseline24h, error: null });
      })
      .catch((reason: unknown) => {
        if (!active) return;
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }
        setResult({
          requestKey,
          history: [],
          baseline24h: [],
          error:
            reason instanceof Error
              ? reason.message
              : "Falha ao carregar o histórico.",
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [rangeMinutes, requestKey]);

  if (apiConfig.useMockData) {
    return {
      history: filterMockHistory(rangeMinutes),
      baseline24h: mockFeeHistory,
      loading: false,
      error: null,
      refresh,
    };
  }

  const pending = result.requestKey !== requestKey;
  return {
    history: pending ? [] : result.history,
    baseline24h: pending ? [] : result.baseline24h,
    loading: pending,
    error: pending ? null : result.error,
    refresh,
  };
}
