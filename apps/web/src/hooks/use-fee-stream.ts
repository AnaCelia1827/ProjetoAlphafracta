"use client";

import { useEffect, useState } from "react";
import { mockFeeSnapshot } from "@/mocks/fee-snapshot";
import type { ConnectionStatus, FeeSnapshot } from "@/types/fees";

const streamUrl = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/stream`;
const useMockData = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";

export function useFeeStream() {
  const [status, setStatus] = useState<ConnectionStatus>(useMockData ? "connected" : "connecting");
  const [snapshot, setSnapshot] = useState<FeeSnapshot | null>(useMockData ? mockFeeSnapshot : null);

  useEffect(() => {
    if (useMockData) return;

    let connectedOnce = false;
    const stream = new EventSource(streamUrl);

    stream.onopen = () => {
      connectedOnce = true;
      setStatus("connected");
    };

    stream.onmessage = (event) => {
      try {
        setSnapshot(JSON.parse(event.data) as FeeSnapshot);
      } catch {
        // Ignora mensagens que não seguem o contrato do snapshot.
      }
    };

    stream.onerror = () => {
      setStatus(connectedOnce ? "reconnecting" : "connecting");
    };

    const handleOffline = () => setStatus("disconnected");
    window.addEventListener("offline", handleOffline);

    return () => {
      stream.close();
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { snapshot, status };
}
