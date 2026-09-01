'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBlockHistory } from '@/lib/api/fetch-block-history';
import type { BlockViewModel } from '@/types/blocks';

const PAGE_SIZE = 10;

type CatalogPage = {
  blocks: BlockViewModel[];
  nextCursor: string | null;
};

export type BlockCatalogState = {
  blocks: BlockViewModel[];
  pageNumber: number;
  itemRange: { from: number; to: number };
  canPrevious: boolean;
  canNext: boolean;
  loading: boolean;
  error: string | null;
  next(): Promise<void>;
  previous(): void;
  refresh(): Promise<void>;
};

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : 'Não foi possível carregar o catálogo.';
}

export function useBlockCatalog(): BlockCatalogState {
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const [pages, setPages] = useState<CatalogPage[]>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;

    void fetchBlockHistory({ limit: PAGE_SIZE, signal: controller.signal })
      .then((page) => {
        if (!mountedRef.current || controller.signal.aborted) return;
        setPages([page]);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!mountedRef.current || controller.signal.aborted) return;
        setError(errorMessage(reason));
      })
      .finally(() => {
        if (mountedRef.current && !controller.signal.aborted) setLoading(false);
      });

    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, []);

  const next = useCallback(async () => {
    if (loading) return;
    if (pages[pageIndex + 1]) {
      setPageIndex(pageIndex + 1);
      setError(null);
      return;
    }

    const cursor = pages[pageIndex]?.nextCursor;
    if (!cursor) return;

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);

    try {
      const page = await fetchBlockHistory({
        limit: PAGE_SIZE,
        cursor,
        signal: controller.signal,
      });
      if (!mountedRef.current || controller.signal.aborted) return;
      setPages((current) => [...current.slice(0, pageIndex + 1), page]);
      setPageIndex(pageIndex + 1);
    } catch (reason) {
      if (mountedRef.current && !controller.signal.aborted) {
        setError(errorMessage(reason));
      }
    } finally {
      if (mountedRef.current && !controller.signal.aborted) setLoading(false);
    }
  }, [loading, pageIndex, pages]);

  const previous = useCallback(() => {
    setPageIndex((current) => Math.max(0, current - 1));
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);

    try {
      const page = await fetchBlockHistory({
        limit: PAGE_SIZE,
        signal: controller.signal,
      });
      if (!mountedRef.current || controller.signal.aborted) return;
      setPages([page]);
      setPageIndex(0);
    } catch (reason) {
      if (mountedRef.current && !controller.signal.aborted) {
        setError(errorMessage(reason));
      }
    } finally {
      if (mountedRef.current && !controller.signal.aborted) setLoading(false);
    }
  }, []);

  const page = pages[pageIndex];
  const blocks = page?.blocks ?? [];
  const from = blocks.length === 0 ? 0 : pageIndex * PAGE_SIZE + 1;

  return {
    blocks,
    pageNumber: pageIndex + 1,
    itemRange: { from, to: from === 0 ? 0 : from + blocks.length - 1 },
    canPrevious: pageIndex > 0,
    canNext: pages[pageIndex + 1] !== undefined || page?.nextCursor != null,
    loading,
    error,
    next,
    previous,
    refresh,
  };
}
