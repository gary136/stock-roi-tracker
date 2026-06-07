import React from 'react';
import IndexRow from '../components/IndexRow';

const INDICES = [
  { ticker: '^SOX', name: 'PHLX Semiconductor' },
  { ticker: 'TSM', name: 'Taiwan Semiconductor (TSMC)' },
];

const IndicesPage: React.FC = () => (
  <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-4">
    {INDICES.map(({ ticker, name }) => (
      <IndexRow key={ticker} ticker={ticker} name={name} />
    ))}
  </div>
);

export default IndicesPage;
