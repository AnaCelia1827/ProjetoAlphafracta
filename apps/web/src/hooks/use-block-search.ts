'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchBlock } from '@/lib/api/fetch-block';
import type { BlockViewModel } from '@/types/blocks';

export type BlockSearchResult = {
  searchedBlock: BlockViewModel | null;
  searching: boolean;
  error: string | null;
  search: (identifier: string) => Promise<void>;
  backToLive: () => void;
};

export function useBlockSearch(): BlockSearchResult {
  const controllerRef = useRef<AbortController | null>(null);
  const [searchedBlock, setSearchedBlock] = useState<BlockViewModel | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (identifier: string) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setSearching(true);
    setError(null);
    setSearchedBlock(null);

    try {
      setSearchedBlock(await fetchBlock(identifier, controller.signal));
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') {
        return;
      }
      setError(reason instanceof Error ? reason.message : 'Não foi possível localizar o bloco.');
    } finally {
      if (!controller.signal.aborted) {
        setSearching(false);
      }
    }
  }, []);

  const backToLive = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setSearchedBlock(null);
    setSearching(false);
    setError(null);
  }, []);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return { searchedBlock, searching, error, search, backToLive };
}
