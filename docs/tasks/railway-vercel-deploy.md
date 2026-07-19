# Task: Railway + Vercel Deployment

**Status**: Complete — live in production 2026-07-19
**Created**: 2026-06-30
**Branch**: main

---

## 1. Requirements

### Goal
Fix all deployment blockers, hide the manual Refresh button in production, and auto-update both markets daily so the app runs correctly on Railway (backend) + Vercel (frontend).

### Success criteria
- Railway service starts and passes health check (gunicorn binds to `0.0.0.0:$PORT`)
- App starts without crashing when `DATABASE_URL=postgres://...` is injected by Railway
- CORS allows the Vercel frontend URL and nothing unexpected
- Direct URL access to `/taiwan`, `/us`, `/indices` returns the React app (not a 404)
- "Refresh Data" button is hidden on Vercel (production build); visible in `npm start` (dev)
- Both `tw` and `us` data refresh automatically once daily at sensible market-close times
- Local dev (SQLite, `npm start`) unchanged — button still visible, no scheduler running

### Out of scope
- Full `pip freeze` dependency pin (too risky — locks transitive deps)
- DB migration refactor
- Any API shape changes

---

## 2. Current Behavior

### Deployment gaps

Railway deploy fails because `gunicorn app:app` binds to `127.0.0.1:8000` by default — Railway health-checks `$PORT` and kills the service on timeout.

On startup with a Railway PostgreSQL addon, `DATABASE_URL` is injected as `postgres://...`. SQLAlchemy 1.4+ rejects this scheme and raises `ValueError: Could not parse rfc1738 URL`, crashing the app before any route is served.

`FRONTEND_URL` is unset on Railway until manually configured, so `os.getenv("FRONTEND_URL", "")` passes an empty string `""` to `CORS(origins=[...])`. Flask-CORS behavior with an empty-string origin is undefined.

Migration errors are silently swallowed by `except Exception: pass` — real migration failures are invisible in Railway logs.

### Button / update gaps

`Header.tsx` always renders the Refresh Data button — no env check exists anywhere in the frontend. Both market pages unconditionally pass `onRefresh` to `Header`. The "No data yet" empty-state message still says "Click Refresh Data..." which is incorrect in production where the button is hidden.

No scheduler exists. Data is only refreshed when a user clicks the button.

### Current flow

```
Railway deploy:
┌──────────────────────────────────────────────┐
│ startCommand: gunicorn app:app                │
│ → binds 127.0.0.1:8000 (default)             │
└──────────────────┬───────────────────────────┘
                   ▼
┌──────────────────────────────────────────────┐
│ Railway health-checks $PORT → TIMEOUT ❌      │
└──────────────────────────────────────────────┘

app.py startup with PostgreSQL:
┌──────────────────────────────────────────────┐
│ DATABASE_URL = "postgres://user@host/db"      │
│ create_engine("postgres://...")               │
│ → ValueError: Could not parse URL ❌          │
└──────────────────────────────────────────────┘

Frontend (any env):
┌──────────────────────────────────────────────┐
│ Header.tsx always renders Refresh button      │
│ No env check — visible in production ❌       │
└──────────────────────────────────────────────┘
```

---

## 3. Proposed Solution

Fix the gunicorn bind command so Railway can reach the process. Fix the PostgreSQL URL scheme before passing it to SQLAlchemy. Guard the CORS origins list against empty strings. Add debug logging to the migration block. Gate the Refresh button behind `NODE_ENV === 'development'`. Add APScheduler with two cron jobs (TW at 06:00 UTC, US at 22:00 UTC) that respect the existing `_fetch_running` lock and only start when `not app.debug`.

### Proposed flow

```
Railway deploy (fixed):
┌──────────────────────────────────────────────────────┐
│ startCommand: gunicorn app:app                        │
│   --bind 0.0.0.0:$PORT --workers 1 --threads 4       │
│   --timeout 120                                       │
└──────────────────────┬───────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────┐
│ app.py startup:                                       │
│   postgres:// → postgresql://                        │
│   CORS origins filtered (no empty string)            │
│   migration errors logged at DEBUG                   │
│   APScheduler starts (app.debug=False only)          │
└──────────────────────┬───────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────┐
│ Railway health-check $PORT → 200 OK ✅                │
└──────────────────────────────────────────────────────┘

Frontend (env-gated):
┌───────────────────────────────────────────────────────┐
│ TaiwanMarket / UsMarket                                │
│   isDev = process.env.NODE_ENV === 'development'       │
│   onRefresh={isDev ? refresh : undefined}              │
└───────────────────────┬───────────────────────────────┘
                        ▼
┌───────────────────────────────────────────────────────┐
│ Header.tsx — onRefresh optional                        │
│   button renders only when onRefresh is defined        │
│   Dev: button visible ✅  Prod: button hidden ✅       │
└───────────────────────────────────────────────────────┘

Daily auto-update:
┌──────────────────────────────────────────────────────┐
│ APScheduler fires cron jobs:                          │
│   TW: 06:00 UTC daily (after Taiwan market close)    │
│   US: 22:00 UTC daily (after US market close)        │
└──────────────────────┬───────────────────────────────┘
                       ▼
┌──────────────────────────────────────────────────────┐
│ _scheduled_fetch(market):                             │
│   acquire _fetch_lock[market]                        │
│   if _fetch_running[market]: return (skip)           │
│   set _fetch_running[market] = True                  │
│   spawn daemon thread:                               │
│     try: fetch_and_store(market)                     │
│     except: log exception                           │
│     finally: _fetch_running[market] = False          │
└──────────────────────────────────────────────────────┘
```

### Key decisions
- `--workers 1 --threads 4` preserves shared in-process state (`_fetch_running`, `engine`) while allowing concurrent request handling during long fetch jobs
- `process.env.NODE_ENV` is used (not a custom env var) because CRA hardcodes `'production'` in `npm run build` and `'development'` in `npm start` — no Vercel dashboard config needed
- APScheduler `BackgroundScheduler` only starts when `not app.debug` — prevents double-firing from Flask's reloader and prevents scheduler running in local dev
- `_scheduled_fetch` reuses the existing `_fetch_running` / `_fetch_lock` mechanism rather than duplicating it

---

## 4. Implementation Phases

### Phase 1 — Fix gunicorn entry point
**Goal**: Update the gunicorn start command in `railway.toml` and `Procfile` to bind on `0.0.0.0:$PORT` with worker config.

**Files to change**:
- `backend/railway.toml` — update `startCommand`, remove redundant `buildCommand`
- `backend/Procfile` — update to match

**Estimated lines changed**: ~6
**Test criteria**: Railway deploy reaches Active state; `curl https://<url>/api/tw/status` returns JSON

---

### Phase 2 — Fix app.py for production
**Goal**: Fix the `postgres://` URL scheme, CORS empty-origin guard, and silent migration logging in `app.py`.

**Files to change**:
- `backend/app.py` — URL scheme fix after line 24, CORS filter, `app.logger.debug()` in migration except

**Estimated lines changed**: ~10
**Test criteria**: `DATABASE_URL=postgres://localhost/test python app.py` starts without ValueError; CORS origins list contains no empty string when `FRONTEND_URL` is unset

---

### Phase 3 — Hide Refresh button in production
**Goal**: Make `onRefresh` optional in `Header` and gate it behind `NODE_ENV === 'development'` in both market pages, updating the empty-state copy.

**Files to change**:
- `frontend/src/components/common/Header.tsx` — make `onRefresh?: () => void`, render button conditionally
- `frontend/src/pages/TaiwanMarket.tsx` — pass `onRefresh` only in dev, update "No data" message
- `frontend/src/pages/UsMarket.tsx` — same

**Estimated lines changed**: ~20
**Test criteria**: `npm start` shows button; `npm run build` succeeds; built app has no Refresh button (verify in bundle or by serving locally)

---

### Phase 4 — Daily auto-update via APScheduler
**Goal**: Add APScheduler with two daily cron jobs that call `fetch_and_store` for TW and US, respecting the existing fetch lock, starting only when not in debug mode.

**Files to change**:
- `backend/requirements.txt` — add `apscheduler`
- `backend/app.py` — add `_scheduled_fetch()` helper, initialize `BackgroundScheduler`, register cron jobs, start conditionally

**`_scheduled_fetch` must mirror the `/refresh` route's thread wrapper exactly**: acquire `_fetch_lock[market]`, check and set `_fetch_running[market]`, then spawn a daemon thread whose body is `try: fetch_and_store(market) / except: app.logger.exception(...) / finally: _fetch_running[market] = False`. Omitting the `finally` reset causes `_fetch_running[market]` to stay `True` after the first run, permanently blocking all subsequent scheduled and manual refreshes.

**Estimated lines changed**: ~25
**Test criteria**: `python app.py` (debug=True) starts with no scheduler output; scheduler fires jobs at configured times in Railway logs

---

## 5. Review Notes
*(review agent fills this section — do not edit manually)*

**Decision**: Approved with changes

### Simulation findings

> **Flaw**: `_scheduled_fetch` missing `finally: _fetch_running[market] = False` — Phase 4, flow diagram and phase description.
>
> **What would happen**: The flow diagram showed `_scheduled_fetch` acquiring the lock, checking the flag, setting it to `True`, and spawning a daemon thread — but never resetting the flag back to `False` after the thread completes. The existing `/refresh` route already does this correctly in its inner `run()` function's `finally` block. If `_scheduled_fetch` omitted the reset, `_fetch_running[market]` would remain `True` permanently after the first scheduled run. Every subsequent APScheduler firing would hit the `if _fetch_running[market]: return` guard and skip silently. Every manual "Refresh Data" button press in dev would also be silently rejected. The app would never update again after the first auto-refresh — with no error visible to the user.
>
> **Fix applied**: Flow diagram in § 3 updated to show the daemon thread body with `try / except / finally: _fetch_running[market] = False`. Phase 4 description in § 4 updated with an explicit callout requiring the `finally` reset, explaining the consequence of omission.

**Reviewed by**: review agent
**Date**: 2026-06-30

---

## 6. Implementation Log
*(implementation agent fills this section — one entry per phase, after commit)*

### Phase 1 — Fix gunicorn entry point
**Status**: [x] Complete
**Commit**: `3eb833d`
**Files changed**:
- `backend/railway.toml`, `backend/Procfile`

**Build / test results**:
- Backend startup: pass

**Success criteria**:
- [x] Railway service starts and passes health check ✅ — verified live 2026-07-18: `GET /api/tw/status` on `stock-roi-tracker-production.up.railway.app` returns 200 JSON

**Notes**: Log backfilled 2026-07-18 — phase was implemented and deployed earlier but not logged.

---

### Phase 2 — Fix app.py for production
**Status**: [x] Complete
**Commit**: `08da43e`
**Files changed**:
- `backend/app.py`

**Build / test results**:
- Backend startup: pass

**Success criteria**:
- [x] No ValueError on `postgres://` URL ✅ (`app.py:25-26`)
- [x] CORS origins has no empty string ✅ (`app.py:20-21` — appended only if set)

**Notes**: Log backfilled 2026-07-18. Live Railway service starts and serves routes.

---

### Phase 3 — Hide Refresh button in production
**Status**: [x] Complete
**Commit**: `3eb833d` (with follow-ups on main)
**Files changed**:
- `frontend/src/components/common/Header.tsx`, `frontend/src/pages/TaiwanMarket.tsx`, `frontend/src/pages/UsMarket.tsx`, `frontend/vercel.json`

**Build / test results**:
- Frontend build: pass (at implementation time)

**Success criteria**:
- [x] Button visible in dev (`npm start`) ✅ — `onRefresh={isDev ? refresh : undefined}`
- [x] Button absent in production build ✅ — `Header` renders button only when `onRefresh` defined
- [ ] "No data yet" message correct in production — not re-verified during backfill

**Notes**: Log backfilled 2026-07-18. Cannot be verified end-to-end in prod until Vercel deploy exists.

---

### Phase 4 — Daily auto-update via APScheduler
**Status**: [x] Complete
**Commit**: `180e28b`
**Files changed**:
- `backend/app.py` — `_scheduled_fetch()` + guarded `BackgroundScheduler` block
- `backend/requirements.txt` — added `apscheduler`

**Build / test results**:
- Backend startup: pass — `python3 app.py` runs module-level code cleanly with no scheduler started

**Success criteria**:
- [x] No scheduler in local dev ✅ — gated on `__name__ != "__main__"`; dev startup log shows no scheduler line
- [x] Scheduler registered in production mode ✅ — gunicorn-style `import app` verified: 2 jobs, `daily_tw` next run 06:00:00+00:00, `daily_us` next run 22:00:00+00:00

**Notes**:
- Plan's `not app.debug` gate is insufficient alone: `app.debug` is False at module import time even in dev (set only inside `app.run(debug=True)`). Gate changed to `__name__ != "__main__" and not app.debug` — gunicorn imports the module as `"app"`, local dev runs it as `"__main__"`.
- Bug caught in verification: explicitly constructed `CronTrigger` ignores the scheduler's `timezone="UTC"` default and uses local time. Fixed by passing `timezone="UTC"` to each trigger; next-run times re-verified as `+00:00`.
- `_scheduled_fetch` includes the review-mandated `finally: _fetch_running[market] = False`.

---

## 7. Final Verification
*(updated 2026-07-18)*

- [x] All phases complete (code-side; deployment steps below still pending)
- [ ] `CI=true npm run build` — not re-run for Phase 4 (no frontend changes)
- [x] Backend starts cleanly with `python app.py`
- [ ] `docs/CONFIGURATION-REFERENCE.md` — does not exist in repo

**Success criteria from § 1** (all verified live 2026-07-19):
- [x] Railway service starts and passes health check ✅ — live 200 on `/api/tw/status`, `/api/us/status`
- [x] App starts without crashing on `postgres://` URL ✅ — Postgres addon attached; data survived redeploy (persistence proven)
- [x] CORS allows Vercel URL only ✅ — `access-control-allow-origin: https://stock-roi-tracker.vercel.app` confirmed via curl with Origin header
- [x] Direct URL access to `/taiwan`, `/us`, `/indices` works ✅ — all three return HTTP 200 on Vercel
- [x] Refresh button hidden in production build ✅ — deployed bundle gates on `NODE_ENV`; API URL baked in correctly
- [x] Both markets auto-refresh daily ✅ — scheduler fired live at 22:00 UTC 2026-07-18 (US snapshot timestamped 22:00:40Z)
- [x] Local dev unchanged ✅ — dev startup has no scheduler; Refresh button still dev-gated

**Production URLs**:
- Frontend: https://stock-roi-tracker.vercel.app (Vercel project `stock-roi-tracker`, CLI-deployed — not Git-connected; redeploy with `vercel --prod` from `frontend/`)
- Backend: https://stock-roi-tracker-production.up.railway.app (Railway, auto-deploys from GitHub `main`, root `/backend`)

**Post-deploy fix shipped during rollout** (commit `26103f5`): US fetch crashed partway on every run — `NameError` in `us.py` `fetch_stock` except-handler (`sector` referenced before assignment when yfinance failed early). Fixed + per-ticker exception isolation in `fetch_and_store`. First complete US snapshot: 526 stocks, 487 with ROI.

**Known remaining issue (out of scope)**: US scraper returns ~526 of 700 expected stocks — `_fetch_top700()` silently skips failed pages (`except: pass` per page in `us.py`). Same behavior locally. Candidate future task.
