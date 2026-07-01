# Task: Railway + Vercel Deployment

**Status**: Approved with changes
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
**Status**: [ ] Pending  [ ] In Progress  [ ] Complete
**Commit**: ``
**Files changed**:
-

**Build / test results**:
- Backend startup: pass / fail
- Build: pass / fail

**Success criteria**:
- [ ] Railway service starts and passes health check ✅/❌

**Notes**:

---

### Phase 2 — Fix app.py for production
**Status**: [ ] Pending  [ ] In Progress  [ ] Complete
**Commit**: ``
**Files changed**:
-

**Build / test results**:
- Backend startup: pass / fail

**Success criteria**:
- [ ] No ValueError on `postgres://` URL ✅/❌
- [ ] CORS origins has no empty string ✅/❌

**Notes**:

---

### Phase 3 — Hide Refresh button in production
**Status**: [ ] Pending  [ ] In Progress  [ ] Complete
**Commit**: ``
**Files changed**:
-

**Build / test results**:
- Frontend build: pass / fail

**Success criteria**:
- [ ] Button visible in dev (`npm start`) ✅/❌
- [ ] Button absent in production build ✅/❌
- [ ] "No data yet" message correct in production ✅/❌

**Notes**:

---

### Phase 4 — Daily auto-update via APScheduler
**Status**: [ ] Pending  [ ] In Progress  [ ] Complete
**Commit**: ``
**Files changed**:
-

**Build / test results**:
- Backend startup: pass / fail

**Success criteria**:
- [ ] No scheduler in local dev (debug=True) ✅/❌
- [ ] Scheduler registered in production mode ✅/❌

**Notes**:

---

## 7. Final Verification
*(implementation agent fills after all phases)*

- [ ] All phases complete
- [ ] `CI=true npm run build` passes
- [ ] Backend starts cleanly with `python app.py`
- [ ] `docs/CONFIGURATION-REFERENCE.md` updated if config changed

**Success criteria from § 1**:
- [ ] Railway service starts and passes health check ✅/❌
- [ ] App starts without crashing on `postgres://` URL ✅/❌
- [ ] CORS allows Vercel URL only ✅/❌
- [ ] Direct URL access to `/taiwan`, `/us`, `/indices` works ✅/❌
- [ ] Refresh button hidden in production build ✅/❌
- [ ] Both markets auto-refresh daily ✅/❌
- [ ] Local dev unchanged ✅/❌
