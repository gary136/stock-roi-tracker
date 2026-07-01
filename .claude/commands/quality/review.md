Review the code described or shown above against taiwan-roi-tracker project conventions.

This is a read-only review — suggest changes, do not apply them unless asked.

---

## 1. Correctness
- Does it do what it's supposed to do?
- Are there logic errors or edge cases not handled?
- Are error states handled (network failure, empty data, yfinance timeout, TWSE 404)?
- Is the ROI formula correct? `(end - start + dividends) / start * 100`
- Is the outperformance filter condition correct? `roi_5y > benchmark_5y OR roi_1y > benchmark_5y`

## 2. Project Conventions

### Frontend checks
- [ ] Component uses functional style + TypeScript props interface
- [ ] No API calls directly in components — all data fetching is in `useStockData` hook
- [ ] `useEffect` deps are primitives or refs, not objects/arrays
- [ ] Loading and error states shown in UI
- [ ] No hardcoded API URLs — use `getApiBaseUrl()` from `apiHelpers.ts`
- [ ] No `any` types in TypeScript without justification

### Backend checks
- [ ] Every Flask route has try/except
- [ ] Response shape is always `{ success: bool, message: str, data?: any }`
- [ ] HTTP status codes are correct (200/400/500)
- [ ] `DATABASE_URL` env var used for DB connection — no hardcoded paths in production
- [ ] Background thread has proper exception logging (`app.logger.exception`)
- [ ] No secrets or hardcoded credentials

### General checks
- [ ] No `console.log` in production frontend paths
- [ ] No `print()` in production backend paths (use `app.logger`)
- [ ] No committed `.env` files
- [ ] New logic has corresponding tests or curl verification

## 3. Security
- [ ] No user input passed directly to DB queries (SQLAlchemy ORM handles this)
- [ ] CORS restricted to known origins in production
- [ ] No sensitive data in API responses

## 4. Performance
- [ ] yfinance batch download used (`yf.download(tickers_list, ...)`) not per-ticker loop
- [ ] DB query fetches only the latest snapshot, not all historical data
- [ ] No unnecessary re-renders (check `useEffect` deps in frontend)

## 5. Output Format

For each issue found:
```
**[File:line]** — [Category: Correctness | Convention | Security | Performance]
Issue: [what's wrong]
Suggestion: [specific fix]
Severity: High | Medium | Low
```
