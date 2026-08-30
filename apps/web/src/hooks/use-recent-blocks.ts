"use client";

import { useCallback, useEffect, useState } from "react";
import { apiConfig } from "@/lib/api/config";
import { fetchRecentBlocks } from "@/lib/api/fetch-recent-blocks";
import { mockRecentBlocks } from "@/mocks/recent-blocks";
import type { RecentBlock } from "@/types/blocks";

export function useRecentBlocks(limit = 5) {
  const enabled = apiConfig.enableRecentBlocks;
  const [blocks, setBlocks] = useState<RecentBlock[]>(
    enabled && apiConfig.useMockData ? mockRecentBlocks.slice(0, limit) : [],
  );
  const [loading, setLoading] = useState(enabled && !apiConfig.useMockData);
  const [error, setError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    setRequestVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!enabled || apiConfig.useMockData) return;

    const controller = new AbortController();
    void fetchRecentBlocks(limit, controller.signal)
      .then((items) => {
        setBlocks(items);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Falha ao carregar os blocos.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [enabled, limit, requestVersion]);

  return { enabled, blocks, loading, error, refresh };
}
