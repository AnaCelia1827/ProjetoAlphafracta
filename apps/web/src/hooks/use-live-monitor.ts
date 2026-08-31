"use client";

import type {
  BlockSummaryDto,
  FeeSnapshotDto,
} from "@alphractal/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiConfig } from "@/lib/api/config";
import { ApiClientError } from "@/lib/api/errors";
import { fetchCurrentFee } from "@/lib/api/fetch-current-fee";
import { fetchRecentBlocks } from "@/lib/api/fetch-recent-blocks";
import { parseLiveMessage } from "@/lib/api/parsers";
import { toBlockViewModel, toFeeViewModel } from "@/lib/api/view-models";
import {
  reduceLiveEvent,
  type LiveMonitorState,
} from "@/lib/live/live-reducer";
import { mockFeeSnapshot } from "@/mocks/fee-snapshot";
import { mockRecentBlocks } from "@/mocks/recent-blocks";
import type { BlockViewModel } from "@/types/blocks";
import type { FeeViewModel, LiveConnection } from "@/types/fees";

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

  return new ApiClientError(
    reason instanceof Error ? reason.message : fallback,
    0,
  );
}

function isAbortError(reason: unknown) {
  return reason instanceof DOMException && reason.name === "AbortError";
}

export function useLiveMonitor(): UseLiveMonitorResult {
  const [liveState, setLiveState] = useState<LiveMonitorState>({
    fee: apiConfig.useMockData ? mockFeeSnapshot : null,
    blocks: apiConfig.useMockData ? mockRecentBlocks : [],
  });
  const [connection, setConnection] = useState<LiveConnection>(() =>
    apiConfig.useMockData
      ? "live"
      : typeof navigator !== "undefined" && !navigator.onLine
      ? "offline"
      : "connecting",
  );
  const [bootstrapLoading, setBootstrapLoading] = useState(
    !apiConfig.useMockData,
  );
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
      setConnection("live");
      return;
    }

    setBootstrapLoading(true);

    const [feeResult, blocksResult] = await Promise.allSettled([
      fetchCurrentFee(signal),
      fetchRecentBlocks(20, signal),
    ]);

    if (signal?.aborted) {
      return;
    }

    let nextFee: FeeSnapshotDto | undefined;
    let nextBlocks: BlockSummaryDto[] | undefined;
    let degraded = false;

    if (feeResult.status === "fulfilled") {
      nextFee = feeResult.value;
      setFeeError(null);
    } else if (!isAbortError(feeResult.reason)) {
      degraded = true;
      setFeeError(
        asApiClientError(feeResult.reason, "Falha ao carregar as taxas."),
      );
    }

    if (blocksResult.status === "fulfilled") {
      nextBlocks = blocksResult.value;
      setBlocksError(null);
    } else if (!isAbortError(blocksResult.reason)) {
      degraded = true;
      setBlocksError(
        asApiClientError(blocksResult.reason, "Falha ao carregar os blocos."),
      );
    }

    if (nextFee !== undefined || nextBlocks !== undefined) {
      setLiveState((current) => ({
        fee: nextFee ?? current.fee,
        blocks: nextBlocks ?? current.blocks,
      }));
    }

    if (degraded) {
      setConnection((current) =>
        current === "offline" ? current : "degraded",
      );
    }
    setBootstrapLoading(false);
  }, []);

  useEffect(() => {
    if (apiConfig.useMockData) {
      return;
    }

    const controller = new AbortController();
    let openedOnce = false;
    const stream = new EventSource(apiConfig.streamUrl);

    const bootstrapTimer = window.setTimeout(
      () => void bootstrap(controller.signal),
      0,
    );

    const handleOpen = () => {
      setConnection("live");
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
        setLiveState((current) => reduceLiveEvent(current, parsed));

        if (parsed.event === "fee-snapshot") {
          setFeeError(null);
        } else {
          setBlocksError(null);
        }
      } catch (reason) {
        const error = asApiClientError(
          reason,
          "A API enviou um evento ao vivo inválido.",
        );
        if (eventName === "fee-snapshot") {
          setFeeError(error);
        } else {
          setBlocksError(error);
        }
        setConnection("degraded");
      }
    };

    const handleFee = handleEvent("fee-snapshot");
    const handleBlockAdded = handleEvent("block-added");
    const handleBlockStatus = handleEvent("block-status-changed");
    const handleError = () =>
      setConnection(navigator.onLine ? "degraded" : "offline");
    const handleOffline = () => setConnection("offline");
    const handleOnline = () => setConnection("connecting");

    stream.addEventListener("open", handleOpen);
    stream.addEventListener("error", handleError);
    stream.addEventListener("fee-snapshot", handleFee);
    stream.addEventListener("block-added", handleBlockAdded);
    stream.addEventListener("block-status-changed", handleBlockStatus);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.clearTimeout(bootstrapTimer);
      controller.abort();
      stream.close();
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [bootstrap]);

  const fee = useMemo(
    () => (liveState.fee ? toFeeViewModel(liveState.fee) : null),
    [liveState.fee],
  );
  const blocks = useMemo(
    () => liveState.blocks.map(toBlockViewModel),
    [liveState.blocks],
  );

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
