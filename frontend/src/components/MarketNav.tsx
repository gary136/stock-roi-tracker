import React from 'react';
import { NavLink } from 'react-router-dom';

const MarketNav: React.FC = () => (
  <nav className="bg-white border-b border-gray-200 px-6 flex gap-0">
    {[
      { to: '/taiwan', label: 'Taiwan' },
      { to: '/us', label: 'United States' },
      { to: '/indices', label: 'Indices' },
    ].map(({ to, label }) => (
      <NavLink
        key={to}
        to={to}
        className={({ isActive }) =>
          `px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
            isActive
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`
        }
      >
        {label}
      </NavLink>
    ))}
  </nav>
);

export default MarketNav;
