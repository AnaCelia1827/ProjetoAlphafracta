"use client";

import { useCallback, useEffect, useState } from "react";
import { apiConfig } from "@/lib/api/config";
import { fetchRecentBlocks } from "@/lib/api/fetch-recent-blocks";
import { mockRecentBlocks } from "@/mocks/recent-blocks";
import type { RecentBlock } from "@/types/blocks";
import type { NetworkFilter } from "@/types/fees";

export function useRecentBlocks(limit = 5, network: NetworkFilter = "all", search = "") {
  const enabled = true;
  const [blocks, setBlocks] = useState<RecentBlock[]>(
    enabled && apiConfig.useMockData ? mockRecentBlocks.slice(0, limit) : [],
  );
  const [loading, setLoading] = useState(enabled && !apiConfig.useMockData);
  const [error, setError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const refresh = useCallback(() => {
    if (apiConfig.useMockData) return;
    setLoading(true);
    setError(null);
    setRequestVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!enabled || apiConfig.useMockData) return;

    const controller = new AbortController();
    void fetchRecentBlocks(limit, network, search, controller.signal)
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
  }, [enabled, limit, network, requestVersion, search]);

  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const numericSearch = normalizedSearch.replace(/\D/g, "");
  const mockBlocks = mockRecentBlocks.slice(0, limit).filter((block) =>
    !normalizedSearch ||
    block.hash.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
    (numericSearch.length > 0 && String(block.number).includes(numericSearch)),
  );

  return {
    enabled,
    blocks: apiConfig.useMockData ? mockBlocks : blocks,
    loading,
    error,
    refresh,
  };
}
