'use client';

import type { BlockSummaryDto, FeeSnapshotDto, LiveEventDto } from '@alphractal/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiConfig } from '@/lib/api/config';
import { ApiClientError } from '@/lib/api/errors';
import { fetchCurrentFee } from '@/lib/api/fetch-current-fee';
import { fetchRecentBlocks } from '@/lib/api/fetch-recent-blocks';
import { parseLiveMessage } from '@/lib/api/parsers';
import { toBlockViewModel, toFeeViewModel } from '@/lib/api/view-models';
import { reduceLiveEvent, type LiveMonitorState } from '@/lib/live/live-reducer';
import { mockFeeSnapshot } from '@/mocks/fee-snapshot';
import { mockRecentBlocks } from '@/mocks/recent-blocks';
import type { BlockViewModel } from '@/types/blocks';
import type { FeeViewModel, LiveConnection } from '@/types/fees';

export type UseLiveMonitorResult = {
  fee: FeeViewModel | null;
  blocks: BlockViewModel[];
  connection: LiveConnection;
  bootstrapLoading: boolean;
  feeError: ApiClientError | null;
  blocksError: ApiClientError | null;
  refresh: () => Promise<void>;
};

function asApiClientError(reason: unknown, fallback: string) {
  if (reason instanceof ApiClientError) {
    return reason;
  }

  return new ApiClientError(reason instanceof Error ? reason.message : fallback, 0);
}

function isAbortError(reason: unknown) {
  return reason instanceof DOMException && reason.name === 'AbortError';
}

export function useLiveMonitor(): UseLiveMonitorResult {
  const bootstrapControllerRef = useRef<AbortController | null>(null);
  const bootstrapInFlightRef = useRef(false);
  const pendingLiveEventsRef = useRef<LiveEventDto[]>([]);
  const streamOpenRef = useRef(false);
  const resourceErrorsRef = useRef({ fee: false, blocks: false });
  const [liveState, setLiveState] = useState<LiveMonitorState>({
    fee: apiConfig.useMockData ? mockFeeSnapshot : null,
    blocks: apiConfig.useMockData ? mockRecentBlocks : [],
  });
  const [connection, setConnection] = useState<LiveConnection>(() =>
    apiConfig.useMockData
      ? 'live'
      : typeof navigator !== 'undefined' && !navigator.onLine
        ? 'offline'
        : 'connecting',
  );
  const [bootstrapLoading, setBootstrapLoading] = useState(!apiConfig.useMockData);
  const [feeError, setFeeError] = useState<ApiClientError | null>(null);
  const [blocksError, setBlocksError] = useState<ApiClientError | null>(null);

  const bootstrap = useCallback(async (signal?: AbortSignal) => {
    if (apiConfig.useMockData) {
      setLiveState((current) => ({
        ...current,
        fee: {
          ...mockFeeSnapshot,
          timestamp: new Date().toISOString(),
          dataAgeMs: 0,
        },
      }));
      setConnection('live');
      return;
    }

    if (signal?.aborted) {
      return;
    }

    bootstrapControllerRef.current?.abort();
    const controller = new AbortController();
    bootstrapControllerRef.current = controller;
    const abortFromCaller = () => controller.abort();
    if (signal?.aborted) {
      controller.abort();
    } else {
      signal?.addEventListener('abort', abortFromCaller, { once: true });
    }

    bootstrapInFlightRef.current = true;
    pendingLiveEventsRef.current = [];
    setBootstrapLoading(true);

    try {
      const [feeResult, blocksResult] = await Promise.allSettled([
        fetchCurrentFee(controller.signal),
        fetchRecentBlocks(controller.signal),
      ]);

      if (controller.signal.aborted || bootstrapControllerRef.current !== controller) {
        return;
      }

      let nextFee: FeeSnapshotDto | undefined;
      let nextBlocks: BlockSummaryDto[] | undefined;
      let degraded = false;

      if (feeResult.status === 'fulfilled') {
        nextFee = feeResult.value;
        resourceErrorsRef.current.fee = false;
        setFeeError(null);
      } else if (!isAbortError(feeResult.reason)) {
        degraded = true;
        resourceErrorsRef.current.fee = true;
        setFeeError(asApiClientError(feeResult.reason, 'Falha ao carregar as taxas.'));
      }

      if (blocksResult.status === 'fulfilled') {
        nextBlocks = blocksResult.value;
        resourceErrorsRef.current.blocks = false;
        setBlocksError(null);
      } else if (!isAbortError(blocksResult.reason)) {
        degraded = true;
        resourceErrorsRef.current.blocks = true;
        setBlocksError(asApiClientError(blocksResult.reason, 'Falha ao carregar os blocos.'));
      }

      if (nextFee !== undefined || nextBlocks !== undefined) {
        const eventsToReplay = [...pendingLiveEventsRef.current];
        setLiveState((current) =>
          eventsToReplay.reduce(reduceLiveEvent, {
            fee: nextFee ?? current.fee,
            blocks: nextBlocks ?? current.blocks,
          }),
        );
      }

      if (degraded) {
        setConnection((current) => (current === 'offline' ? current : 'degraded'));
      } else if (streamOpenRef.current) {
        setConnection('live');
      }
    } finally {
      signal?.removeEventListener('abort', abortFromCaller);
      if (bootstrapControllerRef.current === controller) {
        bootstrapControllerRef.current = null;
        bootstrapInFlightRef.current = false;
        pendingLiveEventsRef.current = [];
        setBootstrapLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (apiConfig.useMockData) {
      return;
    }

    const controller = new AbortController();
    let openedOnce = false;
    queueMicrotask(() => void bootstrap(controller.signal));
    const stream = new EventSource(apiConfig.streamUrl);

    const handleOpen = () => {
      streamOpenRef.current = true;
      setConnection(
        resourceErrorsRef.current.fee || resourceErrorsRef.current.blocks ? 'degraded' : 'live',
      );
      if (openedOnce) {
        void bootstrap(controller.signal);
      }
      openedOnce = true;
    };

    const handleEvent = (eventName: string) => (event: Event) => {
      const message = event as MessageEvent<string>;

      try {
        const parsed = parseLiveMessage(
          eventName,
          message.lastEventId,
          JSON.parse(message.data) as unknown,
        );
        if (bootstrapInFlightRef.current) {
          pendingLiveEventsRef.current.push(parsed);
        }
        setLiveState((current) => reduceLiveEvent(current, parsed));

        if (parsed.event === 'fee-snapshot') {
          resourceErrorsRef.current.fee = false;
          setFeeError(null);
        } else {
          resourceErrorsRef.current.blocks = false;
          setBlocksError(null);
        }
        setConnection(
          resourceErrorsRef.current.fee || resourceErrorsRef.current.blocks ? 'degraded' : 'live',
        );
      } catch (reason) {
        const error = asApiClientError(reason, 'A API enviou um evento ao vivo inválido.');
        if (eventName === 'fee-snapshot') {
          resourceErrorsRef.current.fee = true;
          setFeeError(error);
        } else {
          resourceErrorsRef.current.blocks = true;
          setBlocksError(error);
        }
        setConnection('degraded');
      }
    };

    const handleFee = handleEvent('fee-snapshot');
    const handleBlockAdded = handleEvent('block-added');
    const handleBlockStatus = handleEvent('block-status-changed');
    const handleError = () => {
      streamOpenRef.current = false;
      setConnection(navigator.onLine ? 'degraded' : 'offline');
    };
    const handleOffline = () => {
      streamOpenRef.current = false;
      setConnection('offline');
    };
    const handleOnline = () => setConnection('connecting');

    stream.addEventListener('open', handleOpen);
    stream.addEventListener('error', handleError);
    stream.addEventListener('fee-snapshot', handleFee);
    stream.addEventListener('block-added', handleBlockAdded);
    stream.addEventListener('block-status-changed', handleBlockStatus);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      controller.abort();
      bootstrapControllerRef.current?.abort();
      streamOpenRef.current = false;
      stream.close();
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [bootstrap]);

  const fee = useMemo(
    () => (liveState.fee ? toFeeViewModel(liveState.fee) : null),
    [liveState.fee],
  );
  const blocks = useMemo(() => liveState.blocks.map(toBlockViewModel), [liveState.blocks]);

  return {
    fee,
    blocks,
    connection,
    bootstrapLoading,
    feeError,
    blocksError,
    refresh: bootstrap,
  };
}
