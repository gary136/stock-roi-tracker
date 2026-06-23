import React from 'react';
import IndexRow from '../components/IndexRow';

const ROW_GROUPS = [
  [
    { ticker: 'TSM',  name: 'Taiwan Semiconductor (TSMC)' },
    { ticker: '^SOX', name: 'PHLX Semiconductor' },
  ],
  [
    { ticker: '^TWII', name: 'Taiwan Weighted Index' },
    { ticker: '^GSPC', name: 'S&P 500' },
  ],
  [
    { ticker: '^N225', name: 'Nikkei 225' },
    { ticker: '^KS11', name: 'KOSPI' },
  ],
];

const IndicesPage: React.FC = () => (
  <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col gap-4">
    {ROW_GROUPS.map((group, i) => (
      <div key={i} className="flex gap-4">
        {group.map(({ ticker, name }) => (
          <div key={ticker} className="flex-1 min-w-0">
            <IndexRow ticker={ticker} name={name} />
          </div>
        ))}
      </div>
    ))}
  </div>
);

export default IndicesPage;
