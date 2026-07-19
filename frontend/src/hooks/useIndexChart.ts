import { useState, useEffect, useCallback } from 'react';

import { getApiBase } from '../utils/apiHelpers';

export type Interval = 'daily' | 'weekly' | 'monthly';

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MaPoint { time: string; value: number; }

export interface IndexChartData {
  ticker: string;
  interval: Interval;
  current: { price: number; change: number; change_pct: number };
  candles: Candle[];
  ma: Record<string, MaPoint[]>;
  bias: Record<string, number | null>;
  volume: { z_score: number | null; obv_direction: 'up' | 'down' | null };
}

export function useIndexChart(ticker: string, initialInterval: Interval = 'daily') {
  const [interval, setInterval] = useState<Interval>(initialInterval);
  const [data, setData] = useState<IndexChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (iv: Interval) => {
    setLoading(true);
    setError(null);
    try {
      const encoded = encodeURIComponent(ticker);
      const res = await fetch(`${getApiBase()}/api/index/${encoded}/chart?interval=${iv}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: IndexChartData = await res.json();
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load chart data');
    } finally {
      setLoading(false);
    }
  }, [ticker]);

  useEffect(() => { fetchData(interval); }, [interval, fetchData]);

  const changeInterval = useCallback((iv: Interval) => { setInterval(iv); }, []);

  return { data, loading, error, interval, changeInterval };
}
