# Task: Short-Term View Toggle for Stock Tables

**Status**: Approved with changes
**Created**: 2026-06-07
**Branch**: main

---

## 1. Requirements

### Goal
Add a Long Term / Short Term toggle to the Taiwan and US stock tables so users can switch between the existing 5-year/1-year ROI view and a new short-term view showing 5MA/20MA bias Z-scores and 1M/3M/6M ROI.

### Success criteria
- Toggle buttons [Long Term ●] [Short Term] appear in the filter bar above the stock table on both /taiwan and /us
- Long Term view is unchanged: Industry | Mkt Cap | 1Y ROI | 5Y ROI columns
- Short Term view shows: 5MA Bias (Z-score) | 20MA Bias (Z-score) | 1M ROI | 3M ROI | 6M ROI (no Mkt Cap or Industry)
- Beat Market in Short Term mode filters: 1M ROI > benchmark_6m OR 3M ROI > benchmark_6m OR 6M ROI > benchmark_6m
- `curl "http://localhost:5001/api/tw/data"` returns `roi_1m`, `roi_3m`, `roi_6m`, `bias_5ma_z`, `bias_20ma_z` for each stock and `benchmark_6m` in `benchmark`
- `CI=true npm run build` passes with zero TypeScript errors
- Short-term columns show `—` (not crash) when data is null (stock not yet refreshed with new schema)

### Out of scope
- Persisting the toggle state in the URL or localStorage
- Sortable columns in short-term view (can be added later)
- Short-term data for the benchmark bar (BenchmarkBar component unchanged)

---

## 2. Current Behavior

Both /taiwan and /us show a single fixed table with columns: Rank | Ticker | Name | Industry | Mkt Cap | 1Y ROI | 5Y ROI. The Beat Market filter checks `roi_1y > benchmark_5y OR roi_5y > benchmark_5y`. There is no short-term data stored or returned by the API.

### Current flow
```
User visits /taiwan
  → useStockData fetches /api/tw/data
  → StockTable renders: Industry | Mkt Cap | 1Y ROI | 5Y ROI
  → Beat Market: roi_1y > benchmark_5y OR roi_5y > benchmark_5y
  → No toggle, no short-term columns
```

---

## 3. Proposed Solution

Extend `fetch_stock()` in both market modules to compute and return 5 new metrics from the existing 5y price history (no extra yfinance calls needed). Store them in 5 new nullable columns on `StockData`. Add `benchmark_6m` to `Snapshot`. Handle DB migration for existing SQLite databases with `ALTER TABLE ... ADD COLUMN` at startup. On the frontend, add a `view` state toggle inside `StockTable` and render different columns depending on the active view.

### Proposed flow
```
User visits /taiwan (after next Refresh)
  → /api/tw/data returns stocks with roi_1m/roi_3m/roi_6m/bias_5ma_z/bias_20ma_z
     and benchmark.benchmark_6m
  → StockTable renders with [Long Term ●] [Short Term] toggle (Long Term default)
  → User clicks [Short Term]
    → Columns switch to: 5MA Bias | 20MA Bias | 1M ROI | 3M ROI | 6M ROI
    → Beat Market filter: roi_1m > benchmark_6m OR roi_3m > benchmark_6m OR roi_6m > benchmark_6m
  → User clicks [Long Term]
    → Columns revert to original view
```

### Key decisions
- **No extra yfinance calls**: all short-term metrics computed from the existing `obj.history(period="5y")` call in `fetch_stock`. No fetch time increase.
- **Return dict not tuple**: `fetch_stock` currently returns `(roi_1y, roi_5y, sector)`. Changing to a dict avoids fragile positional unpacking as more fields are added. `app.py` unpack updated accordingly.
- **Timestamp-based ROI cutoffs**: use `now_utc - timedelta(days=30/91/182)` consistent with how 1Y/5Y ROI are computed, not fixed index offsets.
- **SQLite migration**: `Base.metadata.create_all` does not add columns to existing tables. A startup migration block runs `ALTER TABLE ... ADD COLUMN` in a try/except (no-op if column already exists). New columns are nullable so existing rows with null values are valid until next Refresh.
- **Bias Z-score null-safety**: if rolling std == 0 or fewer than N non-NaN values, emit `None` (same pattern as index chart endpoint).
- **Beat Market baseline**: 6M benchmark ROI used as the single baseline for all three short-term ROI comparisons, per requirements.
- **Toggle lives in StockTable**: view state (`'long' | 'short'`) is local to StockTable — no prop drilling to parent pages needed.

---

## 4. Implementation Phases

### Phase 1 — Backend: short-term metrics in fetch pipeline and API
**Goal**: Compute and store 5MA/20MA bias Z-scores and 1M/3M/6M ROI for every stock, expose them in the data API alongside `benchmark_6m`.

**Files to change**:
- `backend/app.py` — add 5 columns to `StockData` model, `benchmark_6m` to `Snapshot`, startup migration block, update `fetch_and_store` dict unpack, update `/api/<market>/data` response
- `backend/markets/taiwan.py` — update `fetch_stock` to return dict with 8 keys; add ROI and bias Z-score computation
- `backend/markets/us.py` — same changes as taiwan.py

**Implementation notes**:
- New `StockData` columns (all `nullable=True`): `roi_1m Float`, `roi_3m Float`, `roi_6m Float`, `bias_5ma_z Float`, `bias_20ma_z Float`
- New `Snapshot` column: `benchmark_6m Float nullable=True`
- Startup migration (after `Base.metadata.create_all(engine)`):
  ```python
  from sqlalchemy import text
  with engine.connect() as conn:
      for ddl in [
          "ALTER TABLE stock_data ADD COLUMN roi_1m FLOAT",
          "ALTER TABLE stock_data ADD COLUMN roi_3m FLOAT",
          "ALTER TABLE stock_data ADD COLUMN roi_6m FLOAT",
          "ALTER TABLE stock_data ADD COLUMN bias_5ma_z FLOAT",
          "ALTER TABLE stock_data ADD COLUMN bias_20ma_z FLOAT",
          "ALTER TABLE snapshots ADD COLUMN benchmark_6m FLOAT",
      ]:
          try:
              conn.execute(text(ddl)); conn.commit()
          except Exception:
              pass
  ```
- `fetch_stock` return dict:
  ```python
  return {
      "roi_1y": roi_1y, "roi_5y": roi_5y, "sector": sector,
      "roi_1m": roi_1m, "roi_3m": roi_3m, "roi_6m": roi_6m,
      "bias_5ma_z": bias_5ma_z, "bias_20ma_z": bias_20ma_z,
  }
  ```
- **All return paths in `fetch_stock` must return a dict** — including the two early exits (`hist.empty`, `len(prices) < 2`) and the exception handler. Using bare tuples on any path causes a crash in `app.py` when it dict-unpacks `future.result()`. (Fix for Flaw 1.)

  Early-exit and exception template:
  ```python
  _EMPTY = lambda sector: {
      "roi_1y": None, "roi_5y": None, "sector": sector,
      "roi_1m": None, "roi_3m": None, "roi_6m": None,
      "bias_5ma_z": None, "bias_20ma_z": None,
  }
  # use: return _EMPTY(sector)   at hist.empty, len(prices) < 2, and except
  ```
- Short-term ROI cutoffs (use timestamp-based slicing, consistent with 1Y/5Y — not index offsets which are wrong for irregular calendars). (Fix for Flaw 4.)
  ```python
  cutoff_1m = pd.Timestamp(now_utc - timedelta(days=30)).tz_convert(p_tz)
  cutoff_3m = pd.Timestamp(now_utc - timedelta(days=91)).tz_convert(p_tz)
  cutoff_6m = pd.Timestamp(now_utc - timedelta(days=182)).tz_convert(p_tz)

  p1m = prices[prices.index >= cutoff_1m]
  p3m = prices[prices.index >= cutoff_3m]
  p6m = prices[prices.index >= cutoff_6m]

  roi_1m = _compute_roi(p1m, 0)
  roi_3m = _compute_roi(p3m, 0)
  roi_6m = _compute_roi(p6m, 0)
  ```
- Bias Z-score computation (uses existing `prices` Series):
  ```python
  last = float(prices.iloc[-1])
  result = {"roi_1y": ..., "roi_5y": ..., "sector": ..., "roi_1m": roi_1m, "roi_3m": roi_3m, "roi_6m": roi_6m}
  for n, key in [(5, "bias_5ma_z"), (20, "bias_20ma_z")]:
      ma = prices.rolling(n).mean().iloc[-1]
      std = prices.rolling(n).std().iloc[-1]
      result[key] = round((last - float(ma)) / float(std), 2) if pd.notna(std) and float(std) != 0 else None
  ```
- `benchmark_6m` in `fetch_and_store` — compute as a percentage ROI, not a raw price (same pattern as `bench_1y`/`bench_5y`):
  ```python
  if len(bench) > 126:
      bench_6m = float((bench.iloc[-1] - bench.iloc[-126]) / bench.iloc[-126] * 100)
  else:
      bench_6m = None
  ```
  Store on the `Snapshot` record and include in the `/api/<market>/data` response as `benchmark.benchmark_6m`.
  (Fix for Flaw 2: prior wording `bench.iloc[-126]` omitted the ROI formula — storing raw price would break the Beat Market filter.)

**Estimated lines changed**: ~90

**Test criteria**: `curl "http://localhost:5001/api/tw/data"` after a Refresh returns stocks with `roi_1m`, `roi_3m`, `roi_6m`, `bias_5ma_z`, `bias_20ma_z` (non-null for liquid stocks) and `benchmark.benchmark_6m` as a float.

---

### Phase 2 — Frontend: view toggle and short-term column rendering in StockTable
**Goal**: Render the Long Term / Short Term toggle and switch columns and Beat Market logic based on the active view.

**Files to change**:
- `frontend/src/types/market.ts` — add 5 optional fields to `Stock`, add `benchmark_6m` to `Benchmark`
- `frontend/src/components/StockTable.tsx` — add `view` state, toggle buttons in filter bar, short-term column headers/cells, updated Beat Market filter

**Implementation notes**:
- New types:
  ```typescript
  // Stock interface additions
  roi_1m?: number | null;
  roi_3m?: number | null;
  roi_6m?: number | null;
  bias_5ma_z?: number | null;
  bias_20ma_z?: number | null;

  // Benchmark interface addition
  benchmark_6m?: number | null;
  ```
- Toggle buttons (same style as IndexRow interval buttons):
  ```tsx
  {['long', 'short'].map(v => (
    <button key={v} onClick={() => setView(v as View)}
      className={view === v ? 'bg-blue-600 text-white ...' : 'bg-gray-100 ...'}>
      {v === 'long' ? 'Long Term' : 'Short Term'}
    </button>
  ))}
  ```
- Short-term Beat Market filter:
  ```typescript
  if (view === 'short') {
    const base = benchmark.benchmark_6m ?? 0;
    list = list.filter(s =>
      (s.roi_1m != null && s.roi_1m > base) ||
      (s.roi_3m != null && s.roi_3m > base) ||
      (s.roi_6m != null && s.roi_6m > base)
    );
  }
  ```
- Short-term columns: 5MA Bias Z | 20MA Bias Z | 1M ROI | 3M ROI | 6M ROI
- Z-score cell coloring: same zone logic as IndexRow (|Z|<1 gray, 1–2 orange, ≥2 red/green)
- All short-term fields are optional — render `—` when null/undefined (existing data from before this feature)
- `colSpan` in the empty-row fallback: **7 for long term, 8 for short term** — short term has 8 columns (Rank + Code + Name + 5 short-term columns). Use a computed value to avoid the visual gap bug (Flaw 3 fix):
  ```tsx
  <td colSpan={view === 'long' ? 7 : 8} className="px-4 py-8 text-center text-gray-400">
  ```

**Estimated lines changed**: ~110

**Test criteria**: Navigating to /taiwan, clicking [Short Term] switches columns to 5MA Bias / 20MA Bias / 1M ROI / 3M ROI / 6M ROI; Beat Market filters correctly; clicking [Long Term] restores original columns; `CI=true npm run build` passes.

---

## 5. Review Notes
*(review agent fills this section — do not edit manually)*

**Decision**: [x] Approved with changes

### Simulation findings

**Reviewed by**: review agent
**Date**: 2026-06-07

---

#### Flaw 1 — Early-return tuples in `fetch_stock` not converted to dict (CRASH)

**Where**: `backend/markets/taiwan.py` lines 85–88 and 87–88; `backend/markets/us.py` lines 80–82 and 83–84.

**What would happen**: After changing `fetch_stock` to return a dict, `app.py` dict-unpacks `future.result()`. But the two early-exit paths (`if hist.empty` and `if len(prices) < 2`) still return bare tuples `(None, None, sector)`. When any stock triggers those paths, `app.py` receives a tuple instead of a dict — causing a `TypeError: 'tuple' object is not a subscriptable` or wrong-key `KeyError` crash in the batch-write loop. This would silently abort the entire Refresh for that market.

**Fix**: Both early-exit returns in each file must also be changed to dicts.

```python
# taiwan.py — inside fetch_stock, after the two guards
if hist.empty:
    return {"roi_1y": None, "roi_5y": None, "sector": sector,
            "roi_1m": None, "roi_3m": None, "roi_6m": None,
            "bias_5ma_z": None, "bias_20ma_z": None}
if len(prices) < 2:
    return {"roi_1y": None, "roi_5y": None, "sector": sector,
            "roi_1m": None, "roi_3m": None, "roi_6m": None,
            "bias_5ma_z": None, "bias_20ma_z": None}
```
Apply the same pattern to `us.py` (where the empty/short-history guards also return tuples). The exception handler must also return a dict (already noted in the plan, but needs to be applied consistently alongside these guards).

**Plan fix**: Added to Phase 1 implementation notes below.

---

#### Flaw 2 — `benchmark_6m` stored as raw price, not as a percentage ROI (WRONG VALUE)

**Where**: Phase 1, implementation notes, `benchmark_6m` bullet.

**What would happen**: The plan says "`benchmark_6m` in `fetch_and_store`: `bench.iloc[-126]`" without stating the ROI formula. An implementer reading literally would store the raw index price (e.g. 18,000 for TAIEX) rather than a percentage return. The Beat Market filter on the frontend would then compare stock ROIs (~20%) against a raw price (~18,000), meaning every stock fails the filter.

**Fix**: The plan must show the full ROI formula, consistent with how `bench_1y` and `bench_5y` are computed:

```python
if len(bench) > 126:
    bench_6m = float((bench.iloc[-1] - bench.iloc[-126]) / bench.iloc[-126] * 100)
else:
    bench_6m = None
```

Store `bench_6m` on the `Snapshot` record and include it in the JSON response as `benchmark.benchmark_6m`.

**Plan fix**: Updated Phase 1 implementation notes below.

---

#### Flaw 3 — `colSpan` for short-term empty row is wrong (VISUAL BUG)

**Where**: Phase 2, implementation notes, final bullet.

**What would happen**: The plan states "colSpan … 7 for short term (same column count)". But short-term has 8 columns: Rank + Code + Name + 5MA Bias Z + 20MA Bias Z + 1M ROI + 3M ROI + 6M ROI. Using `colSpan={7}` leaves the "No stocks match" row one cell short, producing a broken table layout.

**Fix**: When `view === 'short'`, use `colSpan={8}`. Implement as a computed value:

```tsx
<td colSpan={view === 'long' ? 7 : 8} className="px-4 py-8 text-center text-gray-400">
  No stocks match the current filter.
</td>
```

**Plan fix**: Updated Phase 2 implementation notes below.

---

#### Flaw 4 — Missing code snippet for short-term ROI cutoffs in `fetch_stock` (AMBIGUITY)

**Where**: Phase 1, implementation notes — bias Z-score snippet is provided, but the 1M/3M/6M ROI computation code is absent.

**What would happen**: An implementer following only the snippets given could use wrong index-based slicing (e.g. `prices.iloc[-21:]`) instead of timestamp-based cutoffs, which would silently produce wrong values for stocks with irregular trading calendars.

**Fix**: Add a code snippet parallel to the existing 1Y/5Y pattern:

```python
cutoff_1m  = pd.Timestamp(now_utc - timedelta(days=30)).tz_convert(p_tz)
cutoff_3m  = pd.Timestamp(now_utc - timedelta(days=91)).tz_convert(p_tz)
cutoff_6m  = pd.Timestamp(now_utc - timedelta(days=182)).tz_convert(p_tz)

p1m = prices[prices.index >= cutoff_1m]
p3m = prices[prices.index >= cutoff_3m]
p6m = prices[prices.index >= cutoff_6m]

roi_1m = _compute_roi(p1m, 0)
roi_3m = _compute_roi(p3m, 0)
roi_6m = _compute_roi(p6m, 0)
```

**Plan fix**: Added to Phase 1 implementation notes below.

---

## 6. Implementation Log
*(implementation agent fills this section — one entry per phase, after commit)*

### Phase 1 — Backend
**Status**: [ ] Pending  [ ] In Progress  [ ] Complete
**Commit**: ``
**Files changed**:
- `backend/app.py`
- `backend/markets/taiwan.py`
- `backend/markets/us.py`

**Simulate review — manual test steps**:
1. Start backend → no migration errors in console ✅/❌
2. `curl "http://localhost:5001/api/tw/data"` before Refresh → existing stocks have null short-term fields ✅/❌
3. Trigger Refresh → `curl` again → stocks have non-null `roi_1m`, `bias_5ma_z` etc. ✅/❌
4. `benchmark.benchmark_6m` is a float ✅/❌

**Success criteria**:
- [ ] API returns `roi_1m`, `roi_3m`, `roi_6m`, `bias_5ma_z`, `bias_20ma_z` per stock ✅/❌
- [ ] API returns `benchmark.benchmark_6m` ✅/❌
- [ ] No crash on existing DB (migration is idempotent) ✅/❌

### Phase 2 — Frontend
**Status**: [ ] Pending  [ ] In Progress  [ ] Complete
**Commit**: ``
**Files changed**:
- `frontend/src/types/market.ts`
- `frontend/src/components/StockTable.tsx`

**Simulate review — manual test steps**:
1. /taiwan → [Long Term] active, columns unchanged ✅/❌
2. Click [Short Term] → columns switch to 5MA Bias / 20MA Bias / 1M ROI / 3M ROI / 6M ROI ✅/❌
3. Click ★ Beat the Market in Short Term → filtered by 6M benchmark ✅/❌
4. Click [Long Term] → original columns restored ✅/❌

**Success criteria**:
- [ ] Toggle renders in filter bar ✅/❌
- [ ] Short-term columns render with correct Z-score coloring ✅/❌
- [ ] Beat Market uses benchmark_6m baseline in short term ✅/❌
- [ ] `CI=true npm run build` passes ✅/❌

---

## 7. Final Verification
*(implementation agent fills after all phases)*

- [ ] All phases complete
- [ ] `CI=true npm run build` passes
- [ ] `python3 -c "import app"` passes (no import errors)

**Success criteria from § 1**:
- [ ] Toggle [Long Term] / [Short Term] appears on /taiwan and /us ✅/❌
- [ ] Short Term columns: 5MA Bias Z | 20MA Bias Z | 1M ROI | 3M ROI | 6M ROI ✅/❌
- [ ] Beat Market in Short Term uses benchmark_6m baseline ✅/❌
- [ ] Null short-term fields render as `—` not crash ✅/❌
- [ ] `CI=true npm run build` passes ✅/❌
