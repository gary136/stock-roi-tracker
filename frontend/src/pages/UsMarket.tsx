import React from 'react';
import type { MarketConfig } from '../types/market';
import { useStockData } from '../hooks/useStockData';
import Header from '../components/common/Header';
import BenchmarkBar from '../components/BenchmarkBar';
import StockTable from '../components/StockTable';

const config: MarketConfig = {
  market: 'us',
  title: 'US Stock ROI Tracker',
  subtitle: 'Top 700 by Market Cap',
  benchmarkLabel: 'S&P 500',
  tickerLabel: 'Ticker',
  searchPlaceholder: 'Search by ticker or name...',
  totalStocks: 700,
  refreshNote: '2–5 minutes',
  formatCap: (v) => {
    if (v == null) return '—';
    if (v >= 1000) return `$${(v / 1000).toFixed(2)}T`;
    return `$${v.toFixed(1)}B`;
  },
};

function formatDate(iso: string | null) {
  if (!iso) return undefined;
  return new Date(iso).toLocaleString();
}

const UsMarket: React.FC = () => {
  const { data, loading, error, refreshing, refresh } = useStockData('us');

  return (
    <div>
      <Header
        title={config.title}
        subtitle={config.subtitle}
        lastUpdated={formatDate(data?.captured_at ?? null)}
        onRefresh={refresh}
        isRefreshing={refreshing}
      />
      <main className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-6">
        {loading && (
          <div className="text-center py-16 text-gray-400">Loading data...</div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}
        {refreshing && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700">
            Loading {data?.stocks.length ?? 0} of {config.totalStocks} stocks... this takes {config.refreshNote}.
          </div>
        )}
        {!loading && !error && !data?.benchmark && !refreshing && (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg font-medium">No data yet.</p>
            <p className="text-sm mt-1">
              Click <strong>Refresh Data</strong> to fetch the latest US stock ROI data.
              This takes about {config.refreshNote}.
            </p>
          </div>
        )}
        {data?.benchmark && (
          <>
            <BenchmarkBar benchmark={data.benchmark} label={config.benchmarkLabel} />
            <StockTable stocks={data.stocks} benchmark={data.benchmark} config={config} />
          </>
        )}
      </main>
    </div>
  );
};

export default UsMarket;
