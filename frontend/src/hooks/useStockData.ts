import { useState, useEffect, useCallback } from 'react';
import type { MarketId, Stock, Benchmark } from '../types/market';
import { makeApiRequest } from '../utils/apiHelpers';

interface ApiData {
  benchmark: Benchmark | null;
  stocks: Stock[];
  captured_at: string | null;
  is_complete: boolean;
}

export function useStockData(market: MarketId) {
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    const result = await makeApiRequest<ApiData>(market, '/data');
    if (result.success && result.data) {
      setData(result.data);
      setError(null);
    } else {
      setError(result.message);
    }
    setLoading(false);
  }, [market]);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetchData();
  }, [fetchData]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await makeApiRequest(market, '/refresh', { method: 'POST' });

    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      const result = await makeApiRequest<ApiData>(market, '/data');
      if (result.success && result.data) {
        setData(result.data);
        if (result.data.is_complete) {
          clearInterval(poll);
          setRefreshing(false);
        }
      }
      if (attempts >= 300) {
        clearInterval(poll);
        setRefreshing(false);
      }
    }, 3000);
  }, [market]);

  return { data, loading, error, refreshing, refresh };
}
