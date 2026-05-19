export type MarketId = 'tw' | 'us';

export interface Stock {
  rank: number;
  code: string;
  name: string;
  market_cap: number | null;
  roi_1y: number | null;
  roi_5y: number | null;
  industry: string | null;
}

export interface Benchmark {
  roi_1y: number;
  roi_5y: number;
}

export interface MarketConfig {
  market: MarketId;
  title: string;
  subtitle: string;
  benchmarkLabel: string;
  tickerLabel: string;
  searchPlaceholder: string;
  totalStocks: number;
  refreshNote: string;
  formatCap: (v: number | null) => string;
}
