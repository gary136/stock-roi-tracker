# Task: Stock Technical Chart Modal

**Status**: Approved with changes
**Created**: 2026-06-12
**Branch**: main

---

## 1. Requirements

### Goal
Add a Vol Bias column to the Short Term table and a 📈 button per row that opens a 900px modal showing a 60-bar candlestick chart with MA overlays, volume histogram, and bias Z-score panel for that stock.

### Success criteria
- Short Term table has a new **Vol Bias** column (before 5MA Bias) showing volume Z-score colored by zone (|σ|<1 gray, 1–2 orange, ≥2 red/green)
- A 📈 icon button appears after 6M ROI in every Short Term row
- Clicking 📈 opens a 900px-wide modal for that stock
- Modal shows: ticker + name in header, Daily/Weekly/Monthly toggle, 28% bias panel (Z-score bars) on left, 72% lightweight-charts chart (candlestick + MA overlays + volume histogram) on right
- Modal timeframe toggle re-fetches and re-renders chart
- Clicking backdrop or ✕ button closes modal; ESC key also closes
- `CI=true npm run build` passes with zero TypeScript errors
- Vol Bias shows `—` for stocks not yet refreshed with new schema

### Out of scope
- Caching chart data (fetched fresh on each modal open)
- Adding the modal to Long Term view

---

## 2. Current Behavior

Short Term view shows: Rank | Code | Name | 5MA Bias | 20MA Bias | 1M ROI | 3M ROI | 6M ROI. There is no volume Z-score per stock and no way to see a price chart for an individual stock from the table.

### Current flow
```
User views Short Term table
  → 8 columns: Rank | Code | Name | 5MA Bias | 20MA Bias | 1M ROI | 3M ROI | 6M ROI
  → No volume column, no chart link
  → No per-stock chart endpoint that knows the yfinance ticker for Taiwan stocks
```

---

## 3. Proposed Solution

Extend `fetch_stock()` in both market modules to compute `vol_z` (20-period volume Z-score) and store the full yfinance ticker string (`ticker_yf`, e.g. `2330.TW`, `AAPL`) in StockData. Expose both in the API. On the frontend, add the Vol Bias column and 📈 button to StockTable, and build a `StockChartModal` component that reuses `useIndexChart` with `stock.ticker_yf` to call the existing `/api/index/<ticker>/chart` endpoint.

### Proposed flow
```
User views Short Term table (after next Refresh)
  → 10 columns: Rank | Code | Name | Vol Bias | 5MA Bias | 20MA Bias | 1M ROI | 3M ROI | 6M ROI | 📈
  → Vol Bias shows e.g. "+1.7σ" colored by zone

User clicks 📈 on a row
  → StockChartModal mounts with stock.ticker_yf (e.g. "2330.TW")
  → useIndexChart("2330.TW", "daily") fires
  → GET /api/index/2330.TW/chart?interval=daily
  → Modal renders: bias panel (left 28%) + candlestick + MA + volume histogram (right 72%)
  → User clicks [Weekly] → re-fetches weekly data, chart updates
  → User clicks ✕ or backdrop → modal unmounts
```

### Key decisions
- **Reuse `/api/index/<ticker>/chart`**: this endpoint already accepts any yfinance ticker string and handles `.TW`, `.TWO`, US tickers identically. No new backend chart endpoint needed.
- **Store `ticker_yf` in DB**: the full yfinance ticker (e.g. `2330.TW`) is known at fetch time in `fetch_stock`. Storing it avoids re-deriving the `.TW` vs `.TWO` suffix on the frontend, which doesn't know the exchange type.
- **`vol_z` null-safe**: stocks with zero or constant volume (rare for equities, common for indices) emit `None`; renders as `—`.
- **Modal uses `useIndexChart`**: identical hook to IndexRow — no new fetch logic needed.
- **Backdrop click and ESC close**: standard modal UX; implemented with `useEffect` on `keydown` and an `onClick` on the overlay div.
- **`colSpan` update**: Short Term empty-row colspan changes from 8 → 10 (adding Vol Bias + 📈 columns).

---

## 4. Implementation Phases

### Phase 1 — Backend + frontend table additions
**Goal**: Expose `vol_z` and `ticker_yf` from the API and render the Vol Bias column and 📈 button stub in the Short Term table.

**Files to change**:
- `backend/markets/taiwan.py` — add `vol_z` and `ticker_yf` to return dict and `_empty()`
- `backend/markets/us.py` — same
- `backend/app.py` — add `vol_z Float` and `ticker_yf String` columns to `StockData`, migration DDL; update `fetch_and_store`'s `StockData(...)` constructor call to pass `vol_z=r["vol_z"], ticker_yf=r["ticker_yf"]`; expose both in `/api/<market>/data` response serializer
- `frontend/src/components/StockChartModal.tsx` — create stub file (returns `null`) so Phase 1 build passes
- `frontend/src/types/market.ts` — add `vol_z` and `ticker_yf` to `Stock` interface
- `frontend/src/components/StockTable.tsx` — add Vol Bias column, 📈 button, `modalStock` state, `colSpan` update to 10

**Implementation notes**:
- `vol_z` computation in `fetch_stock` (both market modules), using `hist["Volume"]`:
  ```python
  vol = hist["Volume"].dropna()
  vol_z = None
  if len(vol) >= 20:
      vol_mean = vol.rolling(20).mean().iloc[-1]
      vol_std  = vol.rolling(20).std().iloc[-1]
      if pd.notna(vol_std) and float(vol_std) != 0:
          vol_z = round((float(vol.iloc[-1]) - float(vol_mean)) / float(vol_std), 2)
  ```
- `ticker_yf` in `fetch_stock`:
  - Taiwan: `ticker_str` variable already built as `code + suffix` — add to return dict
  - US: `stock["code"]`
- Update `_empty()` in both modules to include `"vol_z": None, "ticker_yf": ""`.
- Migration DDL to add to the startup block in `app.py`:
  ```python
  "ALTER TABLE stock_data ADD COLUMN vol_z FLOAT",
  "ALTER TABLE stock_data ADD COLUMN ticker_yf VARCHAR",
  ```
- In `fetch_and_store` (`app.py` lines ~144-158), update the `StockData(...)` constructor call to include:
  ```python
  vol_z=r["vol_z"],
  ticker_yf=r["ticker_yf"],
  ```
  Without this, the new DB columns are always stored as `NULL` regardless of what `fetch_stock` returns.
- In the `/api/<market>/data` serializer (the dict inside the `for r in rows` loop), add:
  ```python
  "vol_z":      r.vol_z,
  "ticker_yf":  r.ticker_yf,
  ```
- `StockChartModal.tsx` stub (create in Phase 1 so the import resolves during build):
  ```tsx
  import type { Stock } from '../types/market';
  interface Props { stock: Stock; onClose: () => void }
  const StockChartModal: React.FC<Props> = () => null;
  export default StockChartModal;
  ```
- `StockTable` Phase 1 changes:
  - Import `StockChartModal` from the stub above
  - Add `const [modalStock, setModalStock] = useState<Stock | null>(null)`
  - In short-term header: add `<th>Vol Bias</th>` before `5MA Bias`, add `<th></th>` after `6M ROI`
  - In short-term rows: add `<td>{fmtZ(s.vol_z)}</td>` before `5MA Bias`, add `<td><button onClick={() => setModalStock(s)}>📈</button></td>` after `6M ROI`
  - Update `colSpan` to `view === 'long' ? 7 : 10`

**Estimated lines changed**: ~90

**Test criteria**: `curl "http://localhost:5001/api/tw/data"` returns stocks with `vol_z` (float or null) and `ticker_yf` (e.g. `"2330.TW"`); Short Term table shows Vol Bias column and 📈 buttons; `CI=true npm run build` passes.

---

### Phase 2 — StockChartModal component
**Goal**: Render a 900px modal with bias Z-score panel and candlestick chart for the selected stock.

**Files to change**:
- `frontend/src/components/StockChartModal.tsx` — new component (~200 lines)
- `frontend/src/components/StockTable.tsx` — replace stub with real import and render `<StockChartModal>`

**Implementation notes**:
- Props: `{ stock: Stock; onClose: () => void }`
- Uses `useIndexChart(stock.ticker_yf || stock.code, 'daily')`
- Modal structure:
  ```
  <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
       onClick={onClose}>          ← backdrop click closes
    <div className="bg-white rounded-lg w-[900px] max-w-[95vw] max-h-[90vh] overflow-auto"
         onClick={e => e.stopPropagation()}>   ← prevent bubble
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <span>{stock.code} {stock.name}</span>
        <div className="flex gap-2">
          {/* Daily/Weekly/Monthly toggle */}
          <button onClick={onClose}>✕</button>
        </div>
      </div>
      {/* Body: 28/72 flex row */}
      <div className="flex gap-4 p-4">
        {/* Bias panel 28% */}
        {/* Chart 72% */}
      </div>
    </div>
  </div>
  ```
- ESC key handler via `useEffect`:
  ```typescript
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);
  ```
- Chart rendering: copy the `useEffect` chart creation block from `IndexRow.tsx` verbatim — same candlestick + MA line series + volume histogram + resize handler + `chart.remove()` cleanup.
- Bias panel: copy the bias Z-score bar rows from `IndexRow.tsx` — same `maPeriods`, `zoneBg`, `fmtZ` helpers.
- `ticker_yf` fallback: if `stock.ticker_yf` is empty string or undefined, fall back to `stock.code` (handles pre-refresh rows and US stocks where code == yfinance ticker).

**Estimated lines changed**: ~210

**Test criteria**: Clicking 📈 on a refreshed stock opens a 900px modal; chart renders with candlestick + MA overlays + volume histogram; timeframe toggle re-fetches; ESC and ✕ and backdrop click close the modal.

---

## 5. Review Notes
*(review agent fills this section — do not edit manually)*

**Decision**: [x] Approved with changes

### Simulation findings

**Reviewed by**: review agent
**Date**: 2026-06-12

Two flaws found and fixed in § 4:

**Flaw 1 — `app.py` `fetch_and_store` and data serializer not updated (would silently store NULL)**

The original plan listed `app.py` changes as "add columns to `StockData`, migration DDL, expose in response". The `fetch_and_store` function (lines ~144-158) builds `StockData(...)` by explicitly enumerating every keyword argument. Adding `vol_z`/`ticker_yf` to the SQLAlchemy model and migration DDL is not enough — the `StockData(...)` constructor call must also receive `vol_z=r["vol_z"]` and `ticker_yf=r["ticker_yf"]`. Without this fix, every stored row would have `vol_z=NULL` and `ticker_yf=NULL` regardless of what `fetch_stock` returns. Similarly, the `/api/<market>/data` serializer dict (the `for r in rows` loop) needed explicit entries for the two new fields.

**Fix applied**: Phase 1 notes in § 4 now explicitly call out both spots — the `StockData(...)` constructor update and the serializer dict — with the exact code to add.

**Flaw 2 — Phase 1 imports `StockChartModal` before the file exists; `CI=true npm run build` would fail**

The plan stated Phase 1 `StockTable` changes should `import StockChartModal` (to be created in Phase 2) with a "null render guard". But Phase 1 also lists `CI=true npm run build` as a pass criterion. A TypeScript import of a non-existent module is a hard compile error — the build cannot pass with the import present and no file on disk.

**Fix applied**: Phase 1 now lists `frontend/src/components/StockChartModal.tsx` as an explicit file to create in Phase 1 (as a 4-line stub that returns `null`). This makes the import valid and the build passes. Phase 2 then replaces the stub with the full implementation.

---

## 6. Implementation Log
*(implementation agent fills this section — one entry per phase, after commit)*

### Phase 1 — Backend + frontend table additions
**Status**: [ ] Pending  [ ] In Progress  [ ] Complete
**Commit**: ``
**Files changed**:
- `backend/markets/taiwan.py`
- `backend/markets/us.py`
- `backend/app.py`
- `frontend/src/types/market.ts`
- `frontend/src/components/StockChartModal.tsx` (stub)
- `frontend/src/components/StockTable.tsx`

**Simulate review — manual test steps**:
1. `curl "http://localhost:5001/api/tw/data"` → stocks have `vol_z` and `ticker_yf` ✅/❌
2. Short Term table → Vol Bias column visible ✅/❌
3. 📈 button visible in each row ✅/❌
4. `CI=true npm run build` passes ✅/❌

**Success criteria**:
- [ ] `vol_z` and `ticker_yf` in API response ✅/❌
- [ ] Vol Bias column renders with zone coloring ✅/❌
- [ ] 📈 button present per row ✅/❌

### Phase 2 — StockChartModal
**Status**: [ ] Pending  [ ] In Progress  [ ] Complete
**Commit**: ``
**Files changed**:
- `frontend/src/components/StockChartModal.tsx`
- `frontend/src/components/StockTable.tsx`

**Simulate review — manual test steps**:
1. Click 📈 → 900px modal opens with ticker in header ✅/❌
2. Chart renders candlesticks + MA lines + volume histogram ✅/❌
3. Click [Weekly] → chart re-fetches and updates ✅/❌
4. Press ESC → modal closes ✅/❌
5. Click backdrop → modal closes ✅/❌

**Success criteria**:
- [ ] Modal opens at 900px wide ✅/❌
- [ ] Bias panel 28% left, chart 72% right ✅/❌
- [ ] Timeframe toggle works ✅/❌
- [ ] All close interactions work ✅/❌

---

## 7. Final Verification
*(implementation agent fills after all phases)*

- [ ] All phases complete
- [ ] `CI=true npm run build` passes
- [ ] `python3 -c "import app"` passes

**Success criteria from § 1**:
- [ ] Vol Bias column in Short Term table ✅/❌
- [ ] 📈 button per row opens modal ✅/❌
- [ ] Modal: 900px, bias panel + chart, timeframe toggle ✅/❌
- [ ] ESC / ✕ / backdrop close modal ✅/❌
- [ ] `CI=true npm run build` passes ✅/❌
