"use client";

import { useEffect, useState } from "react";
import { apiConfig } from "@/lib/api/config";
import type { DataStatus, FeeSnapshot } from "@/types/fees";

function calculateAge(snapshot: FeeSnapshot | null, now: number): number | null {
  if (!snapshot) return null;
  const timestampAge = Math.max(0, now - Date.parse(snapshot.timestamp));
  return Math.max(snapshot.dataAgeMs, timestampAge);
}

export function useDataAge(snapshot: FeeSnapshot | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!snapshot) return;

    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [snapshot]);

  const ageMs = calculateAge(snapshot, now);

  const dataStatus: DataStatus =
    ageMs === null
      ? "unavailable"
      : ageMs >= apiConfig.staleAfterMs
        ? "stale"
        : "fresh";

  return { ageMs, dataStatus };
}
