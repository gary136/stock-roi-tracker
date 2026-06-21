import React from 'react';
import type { Benchmark } from '../types/market';

interface Props {
  benchmark: Benchmark;
  label: string;
}

function fmt(v: number) {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}

function fmtOpt(v: number | null | undefined) {
  if (v == null) return <span className="text-blue-300">—</span>;
  return <span className={v >= 0 ? 'text-green-700' : 'text-red-600'}>{fmt(v)}</span>;
}

const BenchmarkBar: React.FC<Props> = ({ benchmark, label }) => (
  <div className="bg-blue-50 border border-blue-200 rounded-lg px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
    <div className="font-semibold text-blue-800 text-sm">{label} Benchmark</div>
    <div className="flex gap-6">
      <div>
        <span className="text-xs text-blue-600 uppercase tracking-wide">1M Return</span>
        <div className="text-lg font-bold">{fmtOpt(benchmark.roi_1m)}</div>
      </div>
      <div>
        <span className="text-xs text-blue-600 uppercase tracking-wide">3M Return</span>
        <div className="text-lg font-bold">{fmtOpt(benchmark.roi_3m)}</div>
      </div>
      <div>
        <span className="text-xs text-blue-600 uppercase tracking-wide">6M Return</span>
        <div className="text-lg font-bold">{fmtOpt(benchmark.roi_6m)}</div>
      </div>
      <div className="border-l border-blue-200 pl-6">
        <span className="text-xs text-blue-600 uppercase tracking-wide">1Y Return</span>
        <div className={`text-lg font-bold ${benchmark.roi_1y >= 0 ? 'text-green-700' : 'text-red-600'}`}>
          {fmt(benchmark.roi_1y)}
        </div>
      </div>
      <div>
        <span className="text-xs text-blue-600 uppercase tracking-wide">5Y Return</span>
        <div className={`text-lg font-bold ${benchmark.roi_5y >= 0 ? 'text-green-700' : 'text-red-600'}`}>
          {fmt(benchmark.roi_5y)}
        </div>
      </div>
    </div>
    <div className="text-xs text-blue-500 sm:ml-auto">
      Beat the Market filter compares both periods vs. {label} 5Y return ({fmt(benchmark.roi_5y)})
    </div>
  </div>
);

export default BenchmarkBar;
