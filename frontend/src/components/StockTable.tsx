import React, { useState, useMemo } from 'react';
import type { Stock, Benchmark, MarketConfig } from '../types/market';
import StockChartModal from './StockChartModal';

interface Props {
  stocks: Stock[];
  benchmark: Benchmark;
  config: MarketConfig;
}

type SortKey = 'rank' | 'roi_1y' | 'roi_5y' | 'market_cap' | 'vol_z' | 'bias_5ma_z' | 'bias_20ma_z' | 'roi_1m' | 'roi_3m' | 'roi_6m';
type View = 'long' | 'short';

function fmtRoi(v: number | null | undefined, beats: boolean) {
  if (v == null) return <span className="text-gray-400">—</span>;
  const sign = v >= 0 ? '+' : '';
  const color = v >= 0 ? 'text-green-700' : 'text-red-600';
  return (
    <span className={color}>
      {sign}{v.toFixed(1)}%{beats ? ' ★' : ''}
    </span>
  );
}

function fmtZ(v: number | null | undefined) {
  if (v == null || Math.abs(v) < 2) return <span className="text-gray-400">—</span>;
  const color = v > 0 ? 'text-red-500' : 'text-green-600';
  return <span className={color}>{v > 0 ? '+' : ''}{v.toFixed(2)}σ</span>;
}

const StockTable: React.FC<Props> = ({ stocks, benchmark, config }) => {
  const [query, setQuery] = useState('');
  const [beatFilter, setBeatFilter] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'rank', asc: true });
  const [view, setView] = useState<View>('long');
  const [modalStock, setModalStock] = useState<Stock | null>(null);

  const visible = useMemo(() => {
    let list = stocks;

    if (beatFilter) {
      if (view === 'long') {
        list = list.filter(s =>
          (s.roi_5y != null && s.roi_5y > benchmark.roi_5y) ||
          (s.roi_1y != null && s.roi_1y > benchmark.roi_5y)
        );
      } else {
        const base = benchmark.roi_6m ?? 0;
        list = list.filter(s =>
          (s.roi_1m != null && s.roi_1m > base) ||
          (s.roi_3m != null && s.roi_3m > base) ||
          (s.roi_6m != null && s.roi_6m > base)
        );
      }
    }

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(s =>
        s.code.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
      );
    }

    list = [...list].sort((a, b) => {
      const av = a[sort.key] ?? (sort.asc ? Infinity : -Infinity);
      const bv = b[sort.key] ?? (sort.asc ? Infinity : -Infinity);
      return sort.asc ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });

    return list;
  }, [stocks, beatFilter, query, sort, benchmark, view]);

  function toggleSort(key: SortKey) {
    setSort(prev => prev.key === key ? { key, asc: !prev.asc } : { key, asc: key === 'rank' });
  }

  function sortIcon(key: SortKey) {
    if (sort.key !== key) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-blue-500 ml-1">{sort.asc ? '↑' : '↓'}</span>;
  }

  const colSpan = view === 'long' ? 7 : 10;

  return (
    <>
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder={config.searchPlaceholder}
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={() => setBeatFilter(f => !f)}
          className={`px-4 py-2 text-sm font-medium rounded-md border transition-colors ${
            beatFilter
              ? 'bg-yellow-400 border-yellow-500 text-yellow-900'
              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          ★ Beat the Market
        </button>
        <span className="text-sm text-gray-500">
          Showing {visible.length} of {stocks.length} stocks
        </span>
        <div className="ml-auto flex gap-1">
          {(['short', 'long'] as View[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                view === v
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {v === 'long' ? 'Long Term' : 'Short Term'}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100 select-none" onClick={() => toggleSort('rank')}>
                Rank{sortIcon('rank')}
              </th>
              <th className="px-4 py-3 text-left">{config.tickerLabel}</th>
              <th className="px-4 py-3 text-left">Name</th>
              {view === 'long' ? (
                <>
                  <th className="px-4 py-3 text-left">Industry</th>
                  <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-100 select-none" onClick={() => toggleSort('market_cap')}>
                    Mkt Cap{sortIcon('market_cap')}
                  </th>
                  <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-100 select-none" onClick={() => toggleSort('roi_1y')}>
                    1Y ROI{sortIcon('roi_1y')}
                  </th>
                  <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-100 select-none" onClick={() => toggleSort('roi_5y')}>
                    5Y ROI{sortIcon('roi_5y')}
                  </th>
                </>
              ) : (
                <>
                  <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-100 select-none" onClick={() => toggleSort('vol_z')}>Vol Bias{sortIcon('vol_z')}</th>
                  <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-100 select-none" onClick={() => toggleSort('bias_5ma_z')}>5MA Bias{sortIcon('bias_5ma_z')}</th>
                  <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-100 select-none" onClick={() => toggleSort('bias_20ma_z')}>20MA Bias{sortIcon('bias_20ma_z')}</th>
                  <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-100 select-none" onClick={() => toggleSort('roi_1m')}>1M ROI{sortIcon('roi_1m')}</th>
                  <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-100 select-none" onClick={() => toggleSort('roi_3m')}>3M ROI{sortIcon('roi_3m')}</th>
                  <th className="px-4 py-3 text-right cursor-pointer hover:bg-gray-100 select-none" onClick={() => toggleSort('roi_6m')}>6M ROI{sortIcon('roi_6m')}</th>
                  <th className="px-4 py-3"></th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.map(s => {
              const base6m = benchmark.roi_6m ?? 0;
              return (
                <tr key={s.code} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500">{s.rank}</td>
                  <td className="px-4 py-2 font-mono font-semibold text-gray-800">{s.code}</td>
                  <td className="px-4 py-2 text-gray-800">{s.name}</td>
                  {view === 'long' ? (
                    <>
                      <td className="px-4 py-2 text-gray-500 text-xs">{s.industry ?? '—'}</td>
                      <td className="px-4 py-2 text-right text-gray-700">{config.formatCap(s.market_cap)}</td>
                      <td className="px-4 py-2 text-right">{fmtRoi(s.roi_1y, s.roi_1y != null && s.roi_1y > benchmark.roi_5y)}</td>
                      <td className="px-4 py-2 text-right">{fmtRoi(s.roi_5y, s.roi_5y != null && s.roi_5y > benchmark.roi_5y)}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-2 text-right">{fmtZ(s.vol_z)}</td>
                      <td className="px-4 py-2 text-right">{fmtZ(s.bias_5ma_z)}</td>
                      <td className="px-4 py-2 text-right">{fmtZ(s.bias_20ma_z)}</td>
                      <td className="px-4 py-2 text-right">{fmtRoi(s.roi_1m, s.roi_1m != null && s.roi_1m > base6m)}</td>
                      <td className="px-4 py-2 text-right">{fmtRoi(s.roi_3m, s.roi_3m != null && s.roi_3m > base6m)}</td>
                      <td className="px-4 py-2 text-right">{fmtRoi(s.roi_6m, s.roi_6m != null && s.roi_6m > base6m)}</td>
                      <td className="px-4 py-2 text-center">
                        <button onClick={() => setModalStock(s)} className="text-blue-500 hover:text-blue-700 text-base" title="View chart">📈</button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="px-4 py-8 text-center text-gray-400">
                  No stocks match the current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>

    {modalStock && (
      <StockChartModal stock={modalStock} onClose={() => setModalStock(null)} />
    )}
    </>
  );
};

export default StockTable;
