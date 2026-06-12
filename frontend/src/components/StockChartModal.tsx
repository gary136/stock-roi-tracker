import React, { useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  ColorType,
} from 'lightweight-charts';
import type { Stock } from '../types/market';
import { useIndexChart, type Interval } from '../hooks/useIndexChart';

const MA_COLORS: Record<string, string> = {
  '5':   '#9CA3AF',
  '10':  '#6EE7B7',
  '20':  '#60A5FA',
  '60':  '#FBBF24',
  '120': '#F87171',
  '200': '#F87171',
};

const INTERVALS: Interval[] = ['daily', 'weekly', 'monthly'];

interface Props { stock: Stock; onClose: () => void; }

function fmtZ(z: number | null): string {
  if (z === null) return '—';
  return `${z > 0 ? '+' : ''}${z.toFixed(2)}σ`;
}

function zoneColor(z: number | null): string {
  if (z === null) return 'text-gray-400';
  const abs = Math.abs(z);
  if (abs >= 2) return z > 0 ? 'text-red-500' : 'text-green-500';
  if (abs >= 1) return 'text-orange-400';
  return 'text-gray-400';
}

function zoneBg(z: number | null): string {
  if (z === null) return 'bg-gray-300';
  const abs = Math.abs(z);
  if (abs >= 2) return z > 0 ? 'bg-red-500' : 'bg-green-500';
  if (abs >= 1) return 'bg-orange-400';
  return 'bg-gray-400';
}

const StockChartModal: React.FC<Props> = ({ stock, onClose }) => {
  const ticker = stock.ticker_yf || stock.code;
  const { data, loading, error, interval, changeInterval } = useIndexChart(ticker);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Chart
  useEffect(() => {
    if (!data || !chartContainerRef.current) return;
    const container = chartContainerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 260,
      layout: { background: { type: ColorType.Solid, color: '#ffffff' }, textColor: '#374151' },
      grid: { vertLines: { color: '#F3F4F6' }, horzLines: { color: '#F3F4F6' } },
      timeScale: { borderColor: '#E5E7EB' },
      rightPriceScale: { borderColor: '#E5E7EB' },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22C55E', downColor: '#EF4444',
      borderUpColor: '#22C55E', borderDownColor: '#EF4444',
      wickUpColor: '#22C55E', wickDownColor: '#EF4444',
      priceScaleId: 'right',
    });
    candleSeries.setData(data.candles.map(c => ({
      time: c.time as unknown as import('lightweight-charts').Time,
      open: c.open, high: c.high, low: c.low, close: c.close,
    })));

    Object.entries(data.ma).forEach(([period, points]) => {
      if (points.length === 0) return;
      const maSeries = chart.addSeries(LineSeries, {
        color: MA_COLORS[period] ?? '#9CA3AF',
        lineWidth: 1,
        priceScaleId: 'right',
        lastValueVisible: false,
        priceLineVisible: false,
      });
      maSeries.setData(points.map(p => ({
        time: p.time as unknown as import('lightweight-charts').Time,
        value: p.value,
      })));
    });

    const hasVolume = data.candles.some(c => c.volume > 0);
    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volSeries.setData(data.candles.map(c => ({
      time: c.time as unknown as import('lightweight-charts').Time,
      value: hasVolume ? c.volume : 0,
      color: c.close >= c.open ? '#86EFAC80' : '#FCA5A580',
    })));

    chart.timeScale().fitContent();

    const handleResize = () => { chart.applyOptions({ width: container.clientWidth }); };
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); chart.remove(); };
  }, [data]);

  const maPeriods = data ? Object.keys(data.ma).sort((a, b) => Number(a) - Number(b)) : [];

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg w-[900px] max-w-[95vw] max-h-[90vh] overflow-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-gray-800 text-lg">{stock.code}</span>
            <span className="text-gray-500 text-sm">{stock.name}</span>
            {data && (
              <>
                <span className="font-semibold text-gray-900">
                  {data.current.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className={data.current.change >= 0 ? 'text-green-600 text-sm' : 'text-red-500 text-sm'}>
                  {data.current.change >= 0 ? '▲' : '▼'} {Math.abs(data.current.change).toFixed(2)} ({data.current.change_pct.toFixed(2)}%)
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {INTERVALS.map(iv => (
                <button
                  key={iv}
                  onClick={() => changeInterval(iv)}
                  className={`px-3 py-1 rounded text-xs font-medium capitalize transition-colors ${
                    interval === iv ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {iv.charAt(0).toUpperCase() + iv.slice(1)}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="ml-2 text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
          </div>
        </div>

        {/* Body: bias (28%) + chart (72%) */}
        <div className="flex gap-4 p-4">
          {/* Bias panel */}
          {data && maPeriods.length > 0 && (
            <div className="w-[28%] flex-shrink-0 flex flex-col gap-1 justify-center">
              <div className="text-xs text-gray-400 mb-1">Bias vs MA (Z-score)</div>
              {maPeriods.map(period => {
                const z = data.bias[period];
                const pct = z === null ? 0 : Math.min(Math.abs(z) / 3, 1) * 50;
                return (
                  <div key={period} className="flex items-center gap-2 text-xs">
                    <span className="w-10 text-right text-gray-500 font-mono">{period}MA</span>
                    <div className="flex-1 relative h-3 bg-gray-100 rounded overflow-hidden">
                      <div className="absolute inset-y-0 left-1/2 w-px bg-gray-300" />
                      {z !== null && (
                        <div
                          className={`absolute inset-y-0 ${zoneBg(z)} opacity-80`}
                          style={z >= 0 ? { left: '50%', width: `${pct}%` } : { right: '50%', width: `${pct}%` }}
                        />
                      )}
                    </div>
                    <span className={`w-14 font-mono ${zoneColor(z)}`}>{fmtZ(z)}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Chart */}
          <div className="flex-1 min-w-0">
            {loading && <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Loading chart...</div>}
            {error && <div className="h-64 flex items-center justify-center text-red-500 text-sm">{error}</div>}
            {!loading && !error && (
              <div className="relative">
                <div ref={chartContainerRef} className="w-full" />
                {data && !data.candles.some(c => c.volume > 0) && (
                  <div className="absolute bottom-1 left-2 text-xs text-gray-400 pointer-events-none">Volume N/A</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockChartModal;
