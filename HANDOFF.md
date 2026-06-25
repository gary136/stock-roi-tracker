# Stock ROI Tracker — Agent Handoff

## What this app is

A full-stack stock ROI tracker with two markets (Taiwan top-300, US top-700) and an Indices technical analysis page. Users can view ROI performance vs benchmark, filter/sort stocks, and view per-stock candlestick charts with MA overlays.

**Live stack:** Flask backend (port 5001) + React/TypeScript frontend (port 3000, proxied to 5001). SQLite in dev, PostgreSQL in prod. Deployed on Render (backend) + Netlify or similar (frontend).

---

## Repository

```
/Users/gary/Web-Applications/stock-roi-tracker/
├── backend/
│   ├── app.py              — Flask app, all routes, SQLAlchemy models, fetch_and_store()
│   ├── markets/
│   │   ├── taiwan.py       — scrape GoodInfo top-300, fetch yfinance ROI per stock
│   │   └── us.py           — scrape companiesmarketcap.com top-700, fetch yfinance ROI
│   ├── requirements.txt    — flask, flask-cors, sqlalchemy, psycopg2-binary, yfinance, pandas, requests, python-dotenv, gunicorn
│   └── Procfile            — gunicorn entry point for Render
└── frontend/
    └── src/
        ├── App.tsx          — BrowserRouter, 3 routes: /taiwan /us /indices
        ├── components/
        │   ├── MarketNav.tsx        — top nav: Taiwan | United States | Indices
        │   ├── BenchmarkBar.tsx     — shows 1M/3M/6M/1Y/5Y benchmark returns
        │   ├── StockTable.tsx       — sortable table with Long Term / Short Term toggle
        │   ├── IndexRow.tsx         — candlestick chart + MA + bias panel for one index
        │   └── StockChartModal.tsx  — 900px modal: per-stock chart (reuses useIndexChart)
        ├── pages/
        │   ├── TaiwanMarket.tsx     — market='tw', TAIEX benchmark
        │   ├── UsMarket.tsx         — market='us', S&P 500 benchmark
        │   └── IndicesPage.tsx      — 3 rows of index pairs
        ├── hooks/
        │   ├── useStockData.ts      — fetches /api/<market>/data, polls on refresh
        │   └── useIndexChart.ts     — fetches /api/index/<ticker>/chart?interval=...
        ├── types/market.ts          — Stock, Benchmark, MarketConfig, MarketId types
        └── utils/apiHelpers.ts      — makeApiRequest(), reads REACT_APP_API_URL
```

---

## Backend API routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/<market>/status` | Latest snapshot metadata |
| GET | `/api/<market>/data` | Full stock list + benchmark for latest snapshot |
| POST | `/api/<market>/refresh` | Kick off background fetch_and_store() |
| GET | `/api/index/<ticker>/chart?interval=daily\|weekly\|monthly` | Candlestick + MA + bias Z-scores for any yfinance ticker |

`market` is `tw` or `us`.

---

## Database models (SQLite / PostgreSQL)

**Snapshot**
- `id`, `market` (tw/us), `captured_at`, `status` (in_progress/complete)
- `benchmark_1y`, `benchmark_5y`, `benchmark_1m`, `benchmark_3m`, `benchmark_6m`

**StockData**
- `id`, `snapshot_id` (FK), `code`, `name`, `market_cap`, `market_cap_rank`
- `roi_1y`, `roi_5y`, `roi_1m`, `roi_3m`, `roi_6m`
- `bias_5ma_z`, `bias_20ma_z`, `vol_z`
- `ticker_yf`, `industry`

Migration: `app.py` runs `ALTER TABLE ADD COLUMN` with try/except on startup (idempotent for SQLite).

---

## Stock data pipeline (fetch_and_store)

1. `mod.scrape()` — returns list of `{rank, code, name, market_cap, industry}`
2. yfinance benchmark download (5y period) — computes 1m/3m/6m/1y/5y returns
3. Create Snapshot with `status="in_progress"`
4. ThreadPoolExecutor (CONCURRENCY=3 TW, 10 US) — `mod.fetch_stock(s, now_utc)`
5. Each `fetch_stock` returns dict: `{roi_1y, roi_5y, roi_1m, roi_3m, roi_6m, bias_5ma_z, bias_20ma_z, vol_z, ticker_yf, sector}`
6. Batch write to DB every 50 stocks
7. Mark Snapshot `status="complete"`

**Taiwan scraper:** GoodInfo.tw top-300 by market cap. Requires cookie. Ticker suffix `.TW` (TWSE) or `.TWO` (OTC).
**US scraper:** companiesmarketcap.com pages 1–7 (100 per page = 700 stocks).

---

## Frontend: StockTable views

**Long Term** (default shown second in toggle): Industry | Mkt Cap | 1Y ROI | 5Y ROI
**Short Term** (shown first in toggle): Vol Bias | 5MA Bias | 20MA Bias | 1M ROI | 3M ROI | 6M ROI | 📈

Toggle order in UI: `[Short Term] [Long Term]`

**Beat Market filter:**
- Long Term: `roi_5y > benchmark.roi_5y OR roi_1y > benchmark.roi_5y`
- Short Term: `roi_1m > benchmark.roi_6m OR roi_3m > benchmark.roi_6m OR roi_6m > benchmark.roi_6m`

**fmtZ rule:** Show exact Z-score (e.g. `+2.34σ`) ONLY when `|Z| ≥ 2`, show `—` otherwise.

**StockChartModal:** opens on 📈 click; 900px wide; uses `stock.ticker_yf || stock.code` as ticker; Daily interval by default; same chart logic as IndexRow.

---

## Frontend: IndicesPage

Three rows, two indices per row:

```typescript
const ROW_GROUPS = [
  [{ ticker: 'TSM',   name: 'Taiwan Semiconductor (TSMC)' },
   { ticker: '^SOX',  name: 'PHLX Semiconductor' }],
  [{ ticker: '^TWII', name: 'Taiwan Weighted Index' },
   { ticker: '^GSPC', name: 'S&P 500' }],
  [{ ticker: '^N225', name: 'Nikkei 225' },
   { ticker: '^KS11', name: 'KOSPI' }],
];
```

**Note on ^KS11 (KOSPI):** yfinance data for Korean markets lags 1–2 days and can show stale prices. Known limitation, not a code bug.

---

## IndexRow chart spec

- Chart height: 200px
- 60 candles shown
- Layout: 28% bias panel (left) | 72% chart (right)
- Volume histogram: `volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })` — this is the correct lightweight-charts v5 API
- MA periods: daily=[5,10,20,60,200], weekly/monthly=[5,10,20,60,120]
- "Volume N/A" overlay when all volumes are 0 (e.g. ^SOX)

**MA color convention:**
| MA | Color |
|----|-------|
| 5  | `#9CA3AF` gray |
| 10 | `#6EE7B7` teal |
| 20 | `#60A5FA` blue |
| 60 | `#FBBF24` amber |
| 120/200 | `#F87171` red |

---

## Key technical decisions (context for future changes)

- `useIndexChart` uses raw `fetch()` directly (not `makeApiRequest`) because `makeApiRequest` is typed to `MarketId` only
- `period="max"` used for monthly interval in `/api/index/<ticker>/chart` — avoids degenerate std=0 on 120MA with only 10y data
- `multi_level_index=False` passed to `yf.download()` for flat column access
- `ticker_yf` stored in DB so frontend never needs to know `.TW` vs `.TWO` suffix
- `_empty(sector)` helper in both market modules returns all-None dict consistently
- `fetch_stock` returns a dict (not a tuple) to avoid positional unpacking fragility

---

## Environment variables

**Backend:**
- `DATABASE_URL` — SQLite default: `sqlite:///data/stock_roi.db`
- `FRONTEND_URL` — added to CORS origins

**Frontend:**
- `REACT_APP_API_URL` — empty string in dev (uses CRA proxy), set to backend URL in prod

---

## Git history (recent)
```
dc6bc3e feat(indices): add Nikkei 225 (^N225) and KOSPI (^KS11)
52138df feat: add 1M/3M/6M benchmark returns + short-term view toggle reorder
5bc8f84 feat(short-term): vol bias column, ticker_yf, and stock chart modal
b71073e feat(indices): add ^TWII/^GSPC row, reduce chart height, tune bias ratio
efbd4a0 feat(indices): add /indices page with candlestick charts
60f0b61 feat(backend): add /api/index/<ticker>/chart endpoint
d6b3138 feat: initial stock-roi-tracker — merged TW + US trackers
```

---

## Known issues / open items

1. **^KS11 (KOSPI) price lag** — yfinance returns 1–2 day old data for Korean markets. No fix at the code level; consider replacing with `EWY` ETF if accuracy matters.
2. **Vol Bias / ticker_yf null in DB** — if the DB was populated before the `ticker_yf`/`vol_z` columns were added, those fields will be null until the user clicks "Refresh Data" to re-fetch.
3. **`benchmark_1m` / `benchmark_3m` null** — same situation: DB rows from before these columns were added will show `—` in BenchmarkBar until refreshed.

---

## How to run locally

```bash
# Backend
cd backend
pip install -r requirements.txt
python app.py        # runs on port 5001

# Frontend
cd frontend
npm install
npm start            # runs on port 3000, proxies /api/* to 5001
```
