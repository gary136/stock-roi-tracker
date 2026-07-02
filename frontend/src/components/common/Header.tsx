import React from 'react';

interface HeaderProps {
  title: string;
  subtitle: string;
  lastUpdated?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const Header: React.FC<HeaderProps> = ({ title, subtitle, lastUpdated, onRefresh, isRefreshing }) => (
  <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
    <div>
      <h1 className="text-xl font-bold text-gray-900">{title}</h1>
      <p className="text-sm text-gray-500">
        {subtitle} · {lastUpdated ? `Last updated: ${lastUpdated}` : 'No data yet'}
      </p>
    </div>
    {onRefresh && (
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
      </button>
    )}
  </header>
);

export default Header;
