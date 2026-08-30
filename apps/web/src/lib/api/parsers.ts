import type { RecentBlock, RecentBlocksResponse } from "@/types/blocks";
import type {
  FeeHistoryPoint,
  FeeHistoryResponse,
  FeeSnapshot,
  ServiceHealth,
  ServiceStatus,
} from "@/types/fees";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

const serviceStatuses = new Set<ServiceStatus>([
  "connected",
  "reconnecting",
  "stale",
  "unavailable",
]);

function parseServiceHealth(value: unknown): ServiceHealth | undefined {
  if (!isRecord(value)) return undefined;

  const { mempool, price, persistence } = value;
  if (
    typeof mempool !== "string" ||
    typeof price !== "string" ||
    typeof persistence !== "string" ||
    !serviceStatuses.has(mempool as ServiceStatus) ||
    !serviceStatuses.has(price as ServiceStatus) ||
    !serviceStatuses.has(persistence as ServiceStatus)
  ) {
    return undefined;
  }

  return {
    mempool: mempool as ServiceStatus,
    price: price as ServiceStatus,
    persistence: persistence as ServiceStatus,
  };
}

export function parseFeeSnapshot(value: unknown): FeeSnapshot | null {
  if (!isRecord(value) || !isRecord(value.metadata) || !isRecord(value.sources)) {
    return null;
  }

  if (
    !isIsoDate(value.timestamp) ||
    value.metadata.network !== "ethereum-mainnet" ||
    !isFiniteNumber(value.recommendedMaxFeeGwei) ||
    !isFiniteNumber(value.recommendedPriorityFeeGwei) ||
    !isFiniteNumber(value.ethUsd) ||
    !isFiniteNumber(value.sampleSize) ||
    !isFiniteNumber(value.dataAgeMs) ||
    value.sources.mempool !== "alchemy" ||
    value.sources.price !== "coinbase"
  ) {
    return null;
  }

  const health = parseServiceHealth(value.health);
  return {
    timestamp: value.timestamp,
    metadata: { network: "ethereum-mainnet" },
    recommendedMaxFeeGwei: value.recommendedMaxFeeGwei,
    recommendedPriorityFeeGwei: value.recommendedPriorityFeeGwei,
    ethUsd: value.ethUsd,
    sampleSize: value.sampleSize,
    dataAgeMs: value.dataAgeMs,
    sources: { mempool: "alchemy", price: "coinbase" },
    ...(health ? { health } : {}),
  };
}

function parseFeeHistoryPoint(value: unknown): FeeHistoryPoint | null {
  if (
    !isRecord(value) ||
    !isIsoDate(value.timestamp) ||
    !isFiniteNumber(value.recommendedMaxFeeGwei) ||
    !isFiniteNumber(value.recommendedPriorityFeeGwei)
  ) {
    return null;
  }

  return {
    timestamp: value.timestamp,
    recommendedMaxFeeGwei: value.recommendedMaxFeeGwei,
    recommendedPriorityFeeGwei: value.recommendedPriorityFeeGwei,
  };
}

export function parseFeeHistoryResponse(value: unknown): FeeHistoryResponse | null {
  const values = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.items)
      ? value.items
      : null;

  if (!values) return null;
  const items = values.map(parseFeeHistoryPoint);
  if (items.some((item) => item === null)) return null;

  return { items: items as FeeHistoryPoint[] };
}

function parseRecentBlock(value: unknown): RecentBlock | null {
  if (
    !isRecord(value) ||
    !isFiniteNumber(value.number) ||
    typeof value.hash !== "string" ||
    !isIsoDate(value.timestamp) ||
    !isFiniteNumber(value.transactionCount) ||
    !isFiniteNumber(value.baseFeeGwei)
  ) {
    return null;
  }

  return {
    number: value.number,
    hash: value.hash,
    timestamp: value.timestamp,
    transactionCount: value.transactionCount,
    baseFeeGwei: value.baseFeeGwei,
  };
}

export function parseRecentBlocksResponse(value: unknown): RecentBlocksResponse | null {
  const values = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.items)
      ? value.items
      : null;

  if (!values) return null;
  const items = values.map(parseRecentBlock);
  if (items.some((item) => item === null)) return null;

  return { items: items as RecentBlock[] };
}
