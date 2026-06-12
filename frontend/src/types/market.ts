export type MarketId = 'tw' | 'us';

export interface Stock {
  rank: number;
  code: string;
  name: string;
  market_cap: number | null;
  roi_1y: number | null;
  roi_5y: number | null;
  roi_1m?: number | null;
  roi_3m?: number | null;
  roi_6m?: number | null;
  bias_5ma_z?: number | null;
  bias_20ma_z?: number | null;
  vol_z?: number | null;
  ticker_yf?: string | null;
  industry: string | null;
}

export interface Benchmark {
  roi_1y: number;
  roi_5y: number;
  roi_6m?: number | null;
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
