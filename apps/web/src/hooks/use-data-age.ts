"use client";

import { useEffect, useState } from "react";
import { apiConfig } from "@/lib/api/config";
import type { DataStatus, FeeViewModel } from "@/types/fees";

type Clock = { startedAt: number; now: number };

const initialClock: Clock = { startedAt: 0, now: 0 };

function calculateAge(snapshot: FeeViewModel | null, clock: Clock): number | null {
  if (!snapshot) return null;

  if (clock.now === 0) return snapshot.dataAgeMs;
  if (apiConfig.useMockData) {
    return snapshot.dataAgeMs + (clock.now - clock.startedAt);
  }

  const timestampAge = Math.max(0, clock.now - Date.parse(snapshot.timestamp));
  return Math.max(snapshot.dataAgeMs, timestampAge);
}

export function useDataAge(snapshot: FeeViewModel | null) {
  const [clock, setClock] = useState<Clock>(initialClock);

  useEffect(() => {
    if (!snapshot) return;

    const startedAt = Date.now();
    const update = () => setClock({ startedAt, now: Date.now() });
    const firstUpdate = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 1_000);

    return () => {
      window.clearTimeout(firstUpdate);
      window.clearInterval(interval);
    };
  }, [snapshot]);

  const ageMs = calculateAge(snapshot, clock);

  const dataStatus: DataStatus =
    ageMs === null
      ? "unavailable"
      : ageMs >= apiConfig.staleAfterMs
        ? "stale"
        : "fresh";

  return { ageMs, dataStatus };
}
