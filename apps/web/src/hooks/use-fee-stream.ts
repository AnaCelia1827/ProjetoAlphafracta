"use client";

import { useCallback, useEffect, useState } from "react";
import { apiConfig } from "@/lib/api/config";
import { parseFeeSnapshot } from "@/lib/api/parsers";
import { mockFeeSnapshot } from "@/mocks/fee-snapshot";
import type { ConnectionStatus, FeeSnapshot } from "@/types/fees";

export function useFeeStream() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    apiConfig.useMockData ? "connected" : "connecting",
  );
  const [snapshot, setSnapshot] = useState<FeeSnapshot | null>(
    apiConfig.useMockData ? mockFeeSnapshot : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [connectionVersion, setConnectionVersion] = useState(0);

  const refresh = useCallback(() => {
    setError(null);
    if (apiConfig.useMockData) {
      setSnapshot({ ...mockFeeSnapshot, timestamp: new Date().toISOString() });
      return;
    }

    setConnectionStatus("connecting");
    setConnectionVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    if (apiConfig.useMockData) return;

    let connectedOnce = false;
    const stream = new EventSource(apiConfig.streamUrl);

    stream.onopen = () => {
      connectedOnce = true;
      setConnectionStatus("connected");
      setError(null);
    };

    const handleSnapshot = (event: MessageEvent<string>) => {
      try {
        const parsed = parseFeeSnapshot(JSON.parse(event.data) as unknown);
        if (!parsed) {
          setError("A API enviou um snapshot em formato inválido.");
          return;
        }

        setSnapshot(parsed);
        setError(null);
      } catch {
        setError("A API enviou uma mensagem que não pôde ser interpretada.");
      }
    };

    stream.onmessage = handleSnapshot;
    stream.addEventListener("snapshot", handleSnapshot as EventListener);

    stream.onerror = () => {
      setConnectionStatus(
        navigator.onLine
          ? connectedOnce
            ? "reconnecting"
            : "connecting"
          : "disconnected",
      );
    };

    const handleOffline = () => setConnectionStatus("disconnected");
    const handleOnline = () =>
      setConnectionStatus(connectedOnce ? "reconnecting" : "connecting");
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      stream.close();
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, [connectionVersion]);

  return { snapshot, connectionStatus, error, refresh };
}
