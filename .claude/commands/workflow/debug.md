Follow this debugging workflow for the issue described above.

Do not guess or jump to fixes. Diagnose first.

---

## Step 1 — Reproduce & Define the Problem
- State the exact symptom (error message, wrong behavior, what was expected vs actual)
- Identify when it occurs (which action, which route, which component)
- Confirm it's reproducible or note the pattern if intermittent

## Step 2 — Trace the Code Path

For **frontend bugs**:
- Which component renders the wrong output?
- Which hook provides the data? What does it return?
- Which API call fetches it? What does the response look like?
- Are there any `useEffect` dependency issues causing stale data or infinite loops?

For **backend bugs**:
- Which Flask route is called?
- What does the SQLAlchemy query return?
- Is the yfinance download returning empty data or raising an exception?
- Is the background thread failing silently (check `app.logger` output)?

For **data pipeline bugs** (`fetch_and_store`):
- Is `mod.scrape()` returning 0 stocks? Check scraper HTML structure / cookie expiry
- Is the yfinance ticker suffix correct (`.TW` vs `.TWO` for Taiwan OTC)?
- Is the ThreadPoolExecutor swallowing exceptions? Add `future.result()` to surface them
- Is the snapshot stuck in `status="in_progress"`? Worker may have crashed without cleanup

## Step 3 — Form a Hypothesis
State the suspected root cause as a specific, falsifiable claim:
> "The bug is caused by X in Y file at line ~Z because..."

## Step 4 — Verify the Hypothesis
Read the suspected code. Check:
- Is the hypothesis consistent with the symptom?
- Are there other explanations?
- What evidence confirms or refutes it?

Do NOT apply a fix until the root cause is confirmed.

## Step 5 — Fix
- Make the minimal change that addresses the root cause
- Do not refactor surrounding code unless directly related
- Follow existing patterns (no new abstractions for a bug fix)

## Step 6 — Verify the Fix
```bash
# Backend startup
python3 app.py

# Quick smoke test
curl http://localhost:5001/api/tw/status
curl http://localhost:5001/api/us/status

# Frontend build
cd frontend && CI=true npm run build
```
Confirm the original symptom no longer occurs and no regressions in related functionality.

---

## Common Bug Patterns

| Symptom | Likely Cause |
|---------|-------------|
| Frontend infinite re-render / 429s | `useEffect` dep is object/array — use primitive (e.g. `market` string) |
| `StockChartModal` shows no data | `ticker_yf` is null (pre-column DB rows) — user must click Refresh Data |
| `benchmark_1m` shows `—` | Snapshot from before short-term columns were added — refresh needed |
| Snapshot stuck `in_progress` | Background thread crashed — check Railway logs for exception |
| yfinance returns empty DataFrame | Ticker suffix wrong (`.TW` vs `.TWO`), market closed, or rate-limited |
| `postgres://` ValueError on startup | Railway injects `postgres://`; fix: replace with `postgresql://` before `create_engine` |
| CORS error in production | `FRONTEND_URL` env var not set on Railway |
| SQLite `unable to open database file` | `data/` directory doesn't exist — `os.makedirs` must run before `create_engine` |
| GoodInfo scraper returns 0 stocks | Cookie expired or HTML structure changed — inspect scraper response |
| `CI=true npm run build` fails locally | ESLint warning treated as error — fix the warning, don't suppress |
