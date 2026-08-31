import {
  BlockSummarySchema,
  FeeSnapshotSchema,
} from "@alphractal/contracts";

export const feeSnapshotFixture = FeeSnapshotSchema.parse({
  timestamp: "2026-08-31T03:00:00.000Z",
  metadata: { network: "ethereum-mainnet" },
  recommendationState: "current",
  recommendedMaxFeeGwei: 50,
  recommendedPriorityFeeGwei: 1.8,
  baseFeeGwei: 48.2,
  effectiveGasPriceGwei: 50,
  estimatedTransferCost: {
    status: "fresh",
    transactionType: "native-eth-transfer",
    gasUnits: 21000,
    maxCostEth: 0.00105,
    ethUsd: 2200,
    maxCostUsd: 2.31,
    priceUpdatedAt: "2026-08-31T02:59:55.000Z",
  },
  trend24h: {
    status: "available",
    windowMinutes: 5,
    percentChange: -3.2,
    currentMedianMaxFeeGwei: 50,
    previousMedianMaxFeeGwei: 51.65,
  },
  confidence: { level: "high", reasons: ["fresh-data"] },
  sampleSize: 120,
  dataAgeMs: 5000,
  sources: {
    mempool: "alchemy",
    ethereum: "alchemy",
    price: "coinbase",
  },
  sourceUpdatedAt: {
    mempool: "2026-08-31T02:59:58.000Z",
    ethereum: "2026-08-31T02:59:59.000Z",
    price: "2026-08-31T02:59:55.000Z",
  },
  status: {
    mempool: "fresh",
    ethereum: "fresh",
    price: "fresh",
    persistence: "available",
  },
});

export const blockFixture = BlockSummarySchema.parse({
  number: "23548192",
  hash: `0x${"a".repeat(64)}`,
  timestamp: "2026-08-31T02:59:48.000Z",
  finality: "latest",
  feeLevel: "normal",
  baseFeeGwei: 48.2,
  medianPriorityFeeGwei: 1.8,
  effectiveGasPriceGwei: 50,
  gasUsed: "15000000",
  gasLimit: "30000000",
  utilizationPercent: 50,
  transactionCount: 182,
  provider: "alchemy",
  etherscanUrl: "https://etherscan.io/block/23548192",
});
