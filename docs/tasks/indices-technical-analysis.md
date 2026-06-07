# Task: Benchmark Index Technical Analysis

**Status**: Approved with changes
**Created**: 2026-05-23
**Branch**: main

---

## 1. Requirements

### Goal
Add a `/indices` page displaying technical analysis snapshots (candlestick chart, MA overlays, bias Z-scores, volume Z-score, OBV) for benchmark indices such as ^SOX, with a daily/weekly/monthly timeframe toggle.

### Success criteria
- `curl "http://localhost:5001/api/index/%5ESOX/chart?interval=daily"` returns JSON with `candles` (15 bars), `ma` (5 periods), `bias` (Z-scores), `volume` (Z-score + OBV direction), `current` (price + change)
- `curl "...?interval=weekly"` returns MA periods 5/10/20/60/120 (not 200)
- `curl "...?interval=monthly"` returns ~10y of monthly data used for 120MA
- Navigating to `http://localhost:3000/indices` renders the ^SOX row with a candlestick chart and volume histogram
- Daily/Weekly/Monthly toggle re-fetches and re-renders all metrics (candles, MA lines, bias bars, volume Z-score, OBV arrow)
- Bias Z-score bars colored by zone: |Z|<1 gray, 1–2 orange, ≥2 red/green
- `CI=true npm run build` passes with zero TypeScript errors

### Out of scope
- Real-time / intraday data (daily close is sufficient)
- Persisting index data to the database (computed on request)
- Adding more indices beyond ^SOX in this task (architecture supports it via INDICES array)
- VWAP, Volume Profile, CMF (identified as overkill for this snapshot use case)

---

## 2. Current Behavior

The app has two pages: `/taiwan` and `/us`, each showing stock ROI tables. There is no indices page, no charting library, and no technical analysis endpoint.

### Current flow
```
User visits /indices → 404 (no route)
No /api/index/* endpoints exist
MarketNav shows: [Taiwan] [United States] — no Indices tab
```

---

## 3. Proposed Solution

Add a backend endpoint that fetches OHLCV data from yfinance for any index ticker, computes MAs, bias Z-scores, volume Z-score, and OBV direction on-the-fly (no DB storage), and returns it as JSON. Add a frontend `/indices` page using `lightweight-charts` (TradingView) that renders a full-width index row per ticker with a candlestick+MA chart, volume histogram, and bias Z-score bars.

### Proposed flow
```
User visits /indices
  → IndicesPage renders one IndexRow per INDICES list entry
  → Each IndexRow mounts → useIndexChart("^SOX", "daily") fires
  → GET /api/index/%5ESOX/chart?interval=daily
  → backend: yf.download("^SOX", period="1y", interval="1d", multi_level_index=False)
  → compute MAs [5,10,20,60,200], bias Z-scores, vol Z-score (null if vol=0), OBV (null if vol=0)
  → return { current, candles[15], ma{5 series}, bias{5 values}, volume{z,obv} }
  → lightweight-charts renders candlestick + 5 MA overlays + volume histogram
  → Bias bars rendered in CSS below chart
  → User clicks [Weekly] → useIndexChart re-fetches with interval=weekly
  → MA periods switch to [5,10,20,60,120], period="5y" (weekly) / period="max" (monthly), interval="1wk"/"1mo"
  → Chart and bars re-render with weekly data
```

### Key decisions
- **No DB storage**: index chart data is computed on every request — fast enough (~1–2s), avoids schema changes
- **lightweight-charts**: TradingView's library handles candlestick, line series (MAs), histogram (volume), and axes natively; ~40KB gzipped
- **Z-score for all deviation metrics**: bias vs MA and volume vs average both expressed in σ, consistent framework
- **MA periods by timeframe**: daily=5/10/20/60/200; weekly+monthly=5/10/20/60/120 (200-week/month MA not meaningful for snapshot)
- **15 candles**: enough to show recent trend without cluttering the compact row layout
- **`<string:ticker>` route** (Flask default): `^` is not a path separator; URL-encoded `%5ESOX` decodes correctly with the default string converter. `<path:ticker>` also works but is not needed and introduces ambiguity when `/chart` follows.
- **`multi_level_index=False`**: pass to `yf.download()` so columns are flat (`Close`, `High`, etc.) rather than a MultiIndex. Current yfinance always returns MultiIndex for single tickers; without this flag, `df["Close"]` is a `(N, 1)` DataFrame and scalar access emits a FutureWarning that will become a TypeError in a future pandas release.
- **Null-safe volume metrics**: index tickers (e.g. `^SOX`) report zero volume. When volume std == 0, return `null` for `volume.z_score` and `volume.obv_direction` rather than attempting the computation (which produces `NaN`, which is invalid JSON and causes `JSON.parse` to throw in the browser).
- **Monthly period = `"max"`**: `period="10y"` yields exactly 120 monthly rows, leaving the 120MA with only 1 valid data point and the bias Z-score degenerate (std=0 → NaN). Using `period="max"` (~385 rows for `^SOX`) gives 265 valid bias values and a meaningful Z-score.

---

## 4. Implementation Phases

### Phase 1 — Backend: index chart endpoint
**Goal**: Expose `/api/index/<ticker>/chart?interval=daily|weekly|monthly` returning all required technical analysis data.

**Files to change**:
- `backend/app.py` — add `MA_PERIODS`, `PERIOD_MAP`, `INTERVAL_MAP` constants and `index_chart(ticker)` route (~80 lines)

**Implementation notes**:
- Use `@app.route("/api/index/<ticker>/chart")` (default `string` converter — no `path:` needed; Flask decodes `%5E` → `^` automatically).
- Pass `multi_level_index=False` to `yf.download()` so columns are flat and scalar access is safe.
- For monthly interval use `period="max"` (not `"10y"`) so the 120MA has ~265 valid data points for a meaningful Z-score.
- Guard all Z-score computations: if `std == 0` or the series has fewer than 2 non-NaN values, emit `null` (Python `None`) rather than `float("nan")`. (`NaN` in Flask's JSON output is not valid JSON and causes `JSON.parse` to throw in the browser.)

**Estimated lines changed**: ~80

**Test criteria**: `curl "http://localhost:5001/api/index/%5ESOX/chart?interval=daily"` returns valid JSON with keys `current`, `candles` (15 items), `ma` (5 keys), `bias` (Z-score values or null), `volume` (`z_score: null`, `obv_direction: null` for ^SOX); weekly returns 120MA not 200MA; monthly returns valid Z-scores (not null) for all MA periods.

---

### Phase 2 — Frontend: chart hook + IndexRow component
**Goal**: Render a full-width index row with candlestick chart, MA overlays, volume histogram, and bias Z-score bars for a given ticker.

**Files to change**:
- `frontend/src/hooks/useIndexChart.ts` — fetch hook with `interval` state; re-fetches on toggle (~40 lines)
- `frontend/src/components/IndexRow.tsx` — full-width row: header (name/price/change/vol Z/OBV), lightweight-charts chart (candlestick + MA lines + volume histogram), bias Z-score CSS bars (~180 lines)

**Implementation notes**:
- `useIndexChart` must use raw `fetch()` (or a new helper), not `makeApiRequest`. The existing `makeApiRequest` in `apiHelpers.ts` is typed to `MarketId` and builds `/api/<market><endpoint>` — it cannot produce `/api/index/<ticker>/chart`.
- The `useEffect` that creates the lightweight-charts instance **must** return a cleanup function that calls `chart.remove()` to avoid leaking chart instances on re-render or unmount.
- `volume.z_score` and `volume.obv_direction` may be `null` (for pure index tickers). The `IndexRow` header should render a dash or "N/A" for these fields rather than crashing on `null`.

**Estimated lines changed**: ~220

**Test criteria**: `npm start` → navigating to `/indices` (once routed in Phase 3) shows ^SOX row with a rendered candlestick chart; clicking Daily/Weekly/Monthly tab re-fetches and chart updates.

---

### Phase 3 — Frontend: IndicesPage + routing
**Goal**: Wire the `/indices` route, IndicesPage, and MarketNav tab so the feature is accessible from the app.

**Files to change**:
- `frontend/src/pages/IndicesPage.tsx` — maps `INDICES` array to `<IndexRow>` components (~30 lines)
- `frontend/src/components/MarketNav.tsx` — add "Indices" NavLink → `/indices` (~5 lines)
- `frontend/src/App.tsx` — add `<Route path="/indices" element={<IndicesPage />} />` (~3 lines)

**Estimated lines changed**: ~40

**Test criteria**: `CI=true npm run build` passes; `http://localhost:3000/indices` loads without error; MarketNav shows three tabs with "Indices" tab active and blue-underlined when on `/indices`.

---

## 5. Review Notes
*(review agent fills this section — do not edit manually)*

**Decision**: Approved with changes

### Simulation findings

---

> **Flaw 1**: yfinance MultiIndex columns in `index_chart()` — Phase 1
>
> **What would happen**: Current yfinance always returns a MultiIndex even for a single ticker. Without `multi_level_index=False`, `df["Close"]` is a `(N, 1)` DataFrame, not a Series. Scalar access via `float(df["Close"].iloc[-1])` emits a FutureWarning today and will raise `TypeError` in a future pandas release, silently breaking the endpoint after a pandas upgrade.
>
> **Fix applied**: Added `multi_level_index=False` requirement to § 3 key decisions and Phase 1 implementation notes.

---

> **Flaw 2 (HIGH)**: Volume Z-score and OBV produce `NaN` for pure index tickers — Phase 1
>
> **What would happen**: `^SOX` (and most index tickers) report zero volume for every bar. Volume std == 0, so `(vol[-1] - mean) / std` produces `float("nan")`. Flask's `jsonify` emits the literal token `NaN` in the response body, which is not valid per RFC 7159. The browser's `JSON.parse()` throws a `SyntaxError`, crashing the frontend fetch and leaving the component in a permanent error state.
>
> **Fix applied**: Added null-safe volume guard to § 3 key decisions and Phase 1 implementation notes: when `vol_std == 0`, emit `null` (Python `None`) for both `volume.z_score` and `volume.obv_direction`. Updated Phase 2 implementation notes to render a dash/N-A for null volume fields.

---

> **Flaw 3 (HIGH)**: Monthly 120MA bias Z-score is `NaN` when `period="10y"` — Phase 1
>
> **What would happen**: `period="10y"` with `interval="1mo"` yields exactly 120 rows for `^SOX`. The 120-period rolling MA produces only 1 valid (non-NaN) data point — the last row. The bias series therefore has 1 non-NaN value, giving `std == 0` and a degenerate Z-score of `NaN`. Same invalid-JSON crash as Flaw 2.
>
> **Fix applied**: Changed the monthly period from `"10y"` to `"max"` in § 3 proposed flow and key decisions. With `period="max"`, `^SOX` returns ~385 monthly rows, yielding 265 valid bias values and a meaningful Z-score. Updated Phase 1 test criteria to assert non-null Z-scores for the monthly interval.

---

> **Flaw 4 (note)**: `useIndexChart` cannot reuse `makeApiRequest` — Phase 2
>
> **What would happen**: `makeApiRequest` in `apiHelpers.ts` is typed to `MarketId` and hard-codes the URL template `/api/<market><endpoint>`. The index endpoint URL `/api/index/<ticker>/chart` does not fit this template. Attempting to call `makeApiRequest` from `useIndexChart` would either produce a TypeScript error or silently hit the wrong URL.
>
> **Fix applied**: Added an implementation note to Phase 2 stating that `useIndexChart` must use raw `fetch()` (or a new helper function), not `makeApiRequest`.

---

**Reviewed by**: review agent
**Date**: 2026-05-23

---

## 6. Implementation Log
*(implementation agent fills this section — one entry per phase, after commit)*

### Phase 1 — Backend endpoint
**Status**: [ ] Pending  [ ] In Progress  [x] Complete
**Commit**: `60f0b61`
**Files changed**:
- `backend/app.py`

**Simulate review — manual test steps**:
1. `curl "http://localhost:5001/api/index/%5ESOX/chart?interval=daily"` → JSON with 15 candles ✅
2. `curl "...?interval=weekly"` → `ma` keys are `"5","10","20","60","120"` (not `"200"`) ✅
3. `curl "...?interval=monthly"` → returns valid data with non-null bias Z-scores ✅

**Success criteria**:
- [x] Daily endpoint returns 15 candles with correct OHLCV ✅
- [x] Weekly uses 5/10/20/60/120 MA periods ✅
- [x] `volume.z_score` and `volume.obv_direction` present in response (null for ^SOX — correct) ✅

### Phase 2 — IndexRow component
**Status**: [ ] Pending  [ ] In Progress  [ ] Complete
**Commit**: ``
**Files changed**:
- `frontend/src/hooks/useIndexChart.ts`
- `frontend/src/components/IndexRow.tsx`

**Simulate review — manual test steps**:
1. Navigate to `/indices` → ^SOX row renders with candlestick chart ✅/❌
2. Click Weekly → chart re-fetches and re-renders ✅/❌
3. Bias bars show correct sign (green right=above MA, red left=below) ✅/❌
4. Vol Z-score and OBV arrow visible in header ✅/❌

**Success criteria**:
- [ ] Candlestick chart with MA overlays renders ✅/❌
- [ ] Volume histogram visible below candlesticks ✅/❌
- [ ] Bias Z-score bars colored by zone ✅/❌

### Phase 3 — Routing
**Status**: [ ] Pending  [ ] In Progress  [ ] Complete
**Commit**: ``
**Files changed**:
- `frontend/src/pages/IndicesPage.tsx`
- `frontend/src/components/MarketNav.tsx`
- `frontend/src/App.tsx`

**Simulate review — manual test steps**:
1. `http://localhost:3000/indices` loads without error ✅/❌
2. MarketNav shows Indices tab with blue underline when active ✅/❌
3. Back button from `/indices` → `/taiwan` works ✅/❌

**Success criteria**:
- [ ] `CI=true npm run build` passes ✅/❌
- [ ] `/indices` route accessible via MarketNav ✅/❌

---

## 7. Final Verification
*(implementation agent fills after all phases)*

- [ ] All phases complete
- [ ] `CI=true npm run build` passes
- [ ] `python3 -c "import app"` passes (no import errors)

**Success criteria from § 1**:
- [ ] `curl .../chart?interval=daily` → 15 candles + 5 MA periods + bias Z-scores + volume ✅/❌
- [ ] `curl .../chart?interval=weekly` → MA periods 5/10/20/60/120 ✅/❌
- [ ] `/indices` renders ^SOX row with chart ✅/❌
- [ ] Timeframe toggle re-fetches and re-renders all metrics ✅/❌
- [ ] Bias bars colored by zone ✅/❌
- [ ] `CI=true npm run build` passes ✅/❌
