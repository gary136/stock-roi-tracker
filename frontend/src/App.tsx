import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MarketNav from './components/MarketNav';
import TaiwanMarket from './pages/TaiwanMarket';
import UsMarket from './pages/UsMarket';
import IndicesPage from './pages/IndicesPage';
import ErrorBoundary from './components/common/ErrorBoundary';

const App: React.FC = () => (
  <ErrorBoundary>
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <MarketNav />
        <Routes>
          <Route path="/taiwan"  element={<TaiwanMarket />} />
          <Route path="/us"      element={<UsMarket />} />
          <Route path="/indices" element={<IndicesPage />} />
          <Route path="/"        element={<Navigate to="/taiwan" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  </ErrorBoundary>
);

export default App;
