Implement **one phase at a time**. Complete the full cycle — including commit — before moving to the next phase.

---

## Cycle per Phase: Implement → Test → Simulate Review → Commit

### 1. Before Coding — Define Success Criteria

State these BEFORE writing any code:

```
## Phase [N] Success Criteria
### Functional Requirements
- [ ] [what must work]
### Technical Requirements
- [ ] CI=true npm run build succeeds (frontend)
- [ ] python app.py starts without errors (backend)
- [ ] No TypeScript errors
### Acceptance Conditions
- [ ] [measurable condition]
```

### 2. Implement & Test

**Code changes**:
- Make the minimal changes needed for this phase only
- Follow existing patterns (`useStockData` hook for data fetching, Flask routes with try/except)
- Add comments only where logic is non-obvious

**Build checks**:
```bash
# Frontend
cd frontend && CI=true npm run build

# Backend
python app.py   # confirm no startup errors, then Ctrl+C

# Quick API smoke test
curl http://localhost:5001/api/tw/status
curl http://localhost:5001/api/us/status
```

Verify all success criteria are met. Fix failures before proceeding.

### 3. Simulate User Review

Act as the user doing a review. You are no longer the implementer.

**Review the code**:
- Does it follow project conventions (`CLAUDE.md`)?
- Are all success criteria from step 1 met?
- Any logic errors, missing error handling, or security issues?
- Does it integrate cleanly with existing code?

**Simulate manual testing** — trace each step through the code:
```
Manual test steps:
1. [User action] → trace which hook/route handles this
2. [Expected result] → trace what the code would actually return/render
3. Determine: would the user see the expected result? Yes / No
```
Fix any step that produces the wrong result before proceeding.

### 4. Present Results

Show what was done:
- What was changed and why
- Build status (frontend + backend)
- Success criteria verification (✅/❌ each one)
- Manual test simulation results

**Manual verification checklist** — anything that cannot be confirmed by code tracing:
- Visual rendering (chart layout, table sorting, modal sizing)
- Real yfinance data fetching end-to-end
- Refresh Data polling behavior

### 5. Commit
```
[type](scope): brief description

- Change 1
- Change 2
```

### 6. Log — update § 6 of the task doc for this phase

After committing, fill in the phase entry in § 6 of the task doc with:
- **Commit SHA**
- **Files changed**
- **Build results** — frontend build pass/fail, backend startup pass/fail
- **Simulate review — manual test steps** marked ✅/❌
- **Success criteria** — each criterion marked ✅/❌
- **Notes** — anything unexpected or deviating from the plan

After logging, update the phase **Status** to `[x] Complete`.

Then proceed to the next phase.

---

## After All Phases — Fill § 7 Final Verification

- Check off each item in the verification checklist
- Copy each success criterion from § 1 and mark ✅/❌ with evidence
- Set the task doc **Status** to `Complete`

**Do not implement multiple phases in one response.**
