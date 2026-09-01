export type BlockViewModel = {
  number: string;
  hash: string;
  timestamp: string;
  finality: 'latest' | 'safe' | 'finalized';
  feeLevel: 'low' | 'normal' | 'elevated' | 'high' | 'unavailable';
  baseFeeGwei: number;
  priorityFeeGwei: number;
  effectiveGasPriceGwei: number;
  utilizationPercent: number;
  transactionCount: number;
  provider: 'alchemy';
  etherscanUrl: string;
};
