Orchestrate the full plan → review → implement pipeline in a single command.

Run all three stages in sequence. Do not skip stages or proceed past a failed review.

---

## Stage 1 — Write the plan to a file

Follow the instructions in `workflow:write-plan` exactly.

- Derive the feature name from the plan already produced in this conversation (kebab-case).
- Save to `docs/tasks/<feature-name>.md`.
- Fill in §§ 1–4. Leave §§ 5–7 blank.
- Set **Status** to `Draft`.
- Tell the user the file path before moving on.

---

## Stage 2 — Review (separate agent)

Spawn a **new Agent** (not a continuation of this conversation) using the opening prompt below.
This must be a separate agent — the reviewer must not have access to the planning conversation.

Opening prompt to pass to the Agent:

```
Please review the plan in `docs/tasks/<FEATURE-NAME>.md`.

Set Status to "Under Review" immediately, then proceed.

---

Your job is to simulate the implementation mentally and find flaws before any code is written.

## How to review

### Step 1 — Read the codebase, not just the plan
Read every file listed in § 4 (Files to change) in the actual codebase.
Also read any file that calls or is called by those files.
Do not rely solely on the plan's description — verify against real code.

### Step 2 — Simulate each phase
For each phase, mentally apply the described change and trace what happens at runtime:
- Which functions are called, what data flows through, what the user sees
- If I applied only this phase and ran the app, would it work or break?
- Are there edge cases (empty data, network error, race condition, missing env var, null field) the plan doesn't handle?
- Does this interact with existing code in a way the plan doesn't mention?

### Step 3 — Verify the end-to-end flow
Trace the full proposed flow (§ 3) from user action to final state:
- Does each step follow logically from the previous?
- Does the success criteria in § 1 get fully satisfied, or only partially?

### Step 4 — Check phase sizing and ordering
- Each phase independently testable (Gate 1)
- Each phase goal is one sentence without "and" (Gate 2)
- Each phase is 150–350 lines of production code (Gate 3)
- Phases are ordered so each is testable before the next begins

## What to do with findings

**If you find a flaw:**
- State exactly what the flaw is and where in the flow it occurs
- Describe what would actually happen if implemented as written
- Propose a concrete fix
- Update §§ 3–4 directly in the document with your fix
- Record the flaw and fix in § 5 (Review Notes)
- Set **Status** to `Approved with changes` or `Needs Rework`

**If you find no flaws:**
- Do not modify §§ 1–4
- Fill § 5 with "Simulation complete — no flaws found."
- Set **Status** to `Approved`

Only modify the plan if there is a real flaw. Do not suggest improvements for their own sake.

## § 5 format

**Decision**: Approved / Approved with changes / Needs Rework

### Simulation findings
> **Flaw**: <what and where>
> **What would happen**: <concrete failure description>
> **Fix applied**: <what was changed in §§ 3–4>

If no flaws: "Simulation complete — no flaws found."

**Reviewed by**: review agent
**Date**: <date>

Reference files: `CLAUDE.md`, `docs/standard/ANALYSIS_AND_PLANNING.md`
```

After the review agent finishes, read § 5 of the task doc.

---

## Stage 3 — Gate check

Read the **Status** field and **Decision** in § 5.

| Status | Action |
|--------|--------|
| `Approved` | Proceed to Stage 4 |
| `Approved with changes` | Show the user the changes made, ask for confirmation, then proceed |
| `Needs Rework` | Show the user the flaws found. **STOP. Do not implement.** Ask the user to revise the plan. |

---

## Stage 4 — Implement with approval

Follow the instructions in `workflow:implement-review` exactly.

- The plan is already approved — do not re-check.
- For each phase, run: implement → build/test → present → wait for user approval → commit → log.
- Fill in § 6 (Implementation Log) after each phase commit.
- Fill in § 7 (Final Verification) after all phases.
- Set **Status** to `Complete`.
