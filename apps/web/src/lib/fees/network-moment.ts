import type { FeeHistoryPoint } from "@/types/fees";

export type NetworkMomentLevel =
  | "cheap"
  | "normal"
  | "expensive"
  | "analyzing";

export type NetworkMoment = {
  level: NetworkMomentLevel;
  label: string;
  message: string;
};

const COPY: Record<NetworkMomentLevel, Omit<NetworkMoment, "level">> = {
  cheap: { label: "Barato", message: "Bom momento para transacionar" },
  normal: { label: "Normal", message: "Custo dentro da faixa habitual" },
  expensive: {
    label: "Caro",
    message: "Considere aguardar se não for urgente",
  },
  analyzing: {
    label: "Analisando condições",
    message: "Construindo uma referência recente confiável",
  },
};

function result(level: NetworkMomentLevel): NetworkMoment {
  return { level, ...COPY[level] };
}

export function classifyNetworkMoment(
  currentUsd: number | undefined,
  history: readonly FeeHistoryPoint[],
): NetworkMoment {
  const priced = history.filter(
    (point): point is FeeHistoryPoint & { maxCostUsd: number } =>
      point.maxCostUsd !== undefined,
  );
  const first = priced[0];
  const last = priced.at(-1);
  const spanMs =
    first && last
      ? Date.parse(last.timestamp) - Date.parse(first.timestamp)
      : 0;
  if (
    currentUsd === undefined ||
    priced.length < 12 ||
    spanMs < 5 * 60_000
  ) {
    return result("analyzing");
  }

  const values = priced
    .map((point) => point.maxCostUsd)
    .sort((a, b) => a - b);
  const p33 = values[Math.floor((values.length - 1) * 0.33)]!;
  const p67 = values[Math.floor((values.length - 1) * 0.67)]!;
  if (currentUsd <= p33) return result("cheap");
  if (currentUsd >= p67) return result("expensive");
  return result("normal");
}
