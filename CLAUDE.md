# stock-roi-tracker — Project Conventions

## Stack

**Backend:** Python 3.10 · Flask · SQLAlchemy · SQLite (dev) / PostgreSQL (prod) · yfinance · APScheduler
**Frontend:** React 18 · TypeScript · Tailwind CSS · lightweight-charts v5 · react-router-dom v6
**Deploy:** Railway (backend, root dir = `backend/`) · Vercel (frontend, root dir = `frontend/`)

---

## Directory Structure

```
stock-roi-tracker/
├── backend/
│   ├── app.py              — Flask app, all routes, SQLAlchemy models, fetch_and_store()
│   ├── markets/
│   │   ├── taiwan.py       — GoodInfo top-300 scraper + yfinance ROI
│   │   └── us.py           — companiesmarketcap.com top-700 scraper + yfinance ROI
│   ├── requirements.txt
│   ├── Procfile            — gunicorn entry point for Railway
│   └── railway.toml        — Railway deployment config
└── frontend/
    └── src/
        ├── App.tsx
        ├── components/
        │   ├── common/
        │   │   ├── Header.tsx         — page header, optional Refresh button (dev only)
        │   │   └── ErrorBoundary.tsx
        │   ├── BenchmarkBar.tsx       — 1M/3M/6M/1Y/5Y benchmark returns
        │   ├── StockTable.tsx         — sortable table, Long/Short term toggle
        │   ├── IndexRow.tsx           — candlestick chart + MA + bias panel
        │   └── StockChartModal.tsx    — per-stock chart modal (900px)
        ├── hooks/
        │   ├── useStockData.ts        — fetches /api/<market>/data, polls on refresh
        │   └── useIndexChart.ts       — fetches /api/index/<ticker>/chart
        ├── pages/
        │   ├── TaiwanMarket.tsx       — market='tw', TAIEX benchmark
        │   ├── UsMarket.tsx           — market='us', S&P 500 benchmark
        │   └── IndicesPage.tsx        — 3 index rows
        ├── types/market.ts            — Stock, Benchmark, MarketConfig, MarketId
        └── utils/apiHelpers.ts        — makeApiRequest(), reads REACT_APP_API_URL
```

---

## API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/<market>/status` | Latest snapshot metadata |
| GET | `/api/<market>/data` | Full stock list + benchmark |
| POST | `/api/<market>/refresh` | Kick off background fetch_and_store() |
| GET | `/api/index/<ticker>/chart?interval=daily\|weekly\|monthly` | Candlestick + MA + bias |

`market` is `tw` or `us`.

---

## Frontend Conventions

- All data fetching lives in hooks (`useStockData`, `useIndexChart`) — never in components
- `useEffect` deps must be primitives, not objects or arrays
- No hardcoded API URLs — use `process.env.REACT_APP_API_URL` via `apiHelpers.ts`
- `process.env.NODE_ENV === 'development'` gates dev-only UI (e.g. Refresh button)
- No `any` types without justification
- No `console.log` in production paths

## Backend Conventions

- Every Flask route has try/except; 500s use `app.logger.exception()`
- Response shape: direct JSON object (not `{ success, message }` — Flask returns domain data directly)
- `DATABASE_URL` env var for DB — no hardcoded paths
- `postgres://` → `postgresql://` replacement before `create_engine` (Railway compat)
- Background fetch thread uses `_fetch_running` / `_fetch_lock` for deduplication
- `app.logger` used for all logging — no `print()` in production paths
- SQLite for local dev; `os.makedirs("data")` runs at module level before engine creation

---

## Environment Variables

**Backend (Railway):**
- `DATABASE_URL` — auto-set by Railway PostgreSQL addon
- `FRONTEND_URL` — set to Vercel URL to unblock CORS

**Frontend (Vercel):**
- `REACT_APP_API_URL` — Railway backend URL (empty string in dev = CRA proxy)

---

## Local Dev

```bash
# Backend
cd backend && python3 app.py        # runs on port 5001

# Frontend
cd frontend && npm start            # runs on port 3000, proxies /api/* to 5001
```

## Build Commands

```bash
# Frontend production build
cd frontend && CI=true npm run build

# Backend startup check
cd backend && python3 app.py        # Ctrl+C after confirming no errors
```

---

## Known Patterns

- `ticker_yf` stored in DB so frontend never constructs `.TW` / `.TWO` suffixes
- `fetch_stock` returns a dict (not a tuple) to avoid positional unpacking fragility
- `useIndexChart` uses raw `fetch()` directly (not `makeApiRequest`) — typed for `MarketId` only
- `period="max"` used for monthly interval to avoid degenerate std=0 on 120MA
- `multi_level_index=False` passed to `yf.download()` for flat column access
