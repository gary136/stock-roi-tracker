Run a complete validation of the current implementation against its success criteria.

---

## 1. Build Verification

```bash
# Frontend
cd frontend && CI=true npm run build

# Backend startup check
python app.py &
sleep 3 && curl -s http://localhost:5001/api/tw/status | python3 -m json.tool
kill %1
```

Frontend build must complete with zero errors. ESLint warnings are errors in CI.
Backend must start without exceptions and return valid JSON.

## 2. TypeScript Check

Build output confirms no type errors. Flag any `any` types added without justification.

## 3. Success Criteria Verification

For each criterion defined before implementation, verify:

```
## Verification Results

### Functional Requirements
- ✅/❌ [Criterion]: [how verified] — [result]

### Technical Requirements
- ✅/❌ Frontend build: pass / fail
- ✅/❌ Backend startup: pass / fail
- ✅/❌ TypeScript: clean / errors

### Acceptance Conditions
- ✅/❌ [Condition]: [evidence]

**Overall**: ✅ Ready to proceed / ❌ Issues found
```

## 4. Code Quality Check

Review the changed files for:
- [ ] No API calls directly in components — all data fetching in hooks
- [ ] No object/array references in `useEffect` deps (use primitives)
- [ ] Every Flask route has try/except with `app.logger.exception` on 500s
- [ ] Response shape consistent: `{ success, message, data? }` not used here — Flask returns direct JSON; verify shape matches frontend expectations
- [ ] No secrets or hardcoded credentials
- [ ] No `console.log` in production frontend paths
- [ ] No `print()` in production backend paths (use `app.logger`)
- [ ] `DATABASE_URL` used for DB — no hardcoded paths

## 5. API Smoke Tests (curl)

Requires `python app.py` running locally on port 5001.

```bash
# Market status
curl -s http://localhost:5001/api/tw/status | python3 -m json.tool
curl -s http://localhost:5001/api/us/status | python3 -m json.tool

# Market data (latest snapshot)
curl -s http://localhost:5001/api/tw/data | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('benchmark:', d.get('benchmark'))
print('stocks count:', len(d.get('stocks',[])))
"

# Index chart
curl -s "http://localhost:5001/api/index/^GSPC/chart?interval=daily" | python3 -c "
import sys,json; d=json.load(sys.stdin)
print('candles:', len(d.get('candles',[])))
print('bias:', d.get('bias'))
"
```

Report each result as: `✅ expected output` or `❌ unexpected — [actual output]`.

## 6. Manual Testing Steps

Provide step-by-step instructions for the user to manually verify the feature:
1. Start backend: `python app.py`
2. Start frontend: `cd frontend && npm start`
3. Action steps with expected outcomes
4. Edge cases to check

## Output Summary

- What passed ✅
- What failed ❌ (with specific details)
- What needs manual verification by user
- Whether the implementation is ready to proceed/ship
