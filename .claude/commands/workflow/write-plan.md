Create a task document at `docs/tasks/<FEATURE-NAME>.md` that carries a plan through three agents: planner → reviewer → implementer.

This skill is for the **planning agent**. Companion instructions for reviewer and implementer are embedded in the document template below and in the opening prompts in § Passing to the next agent.

---

## When to use this skill

Use after `/plan` has produced a complete analysis. The task document replaces informal chat summaries — it is the single artifact passed between agents and updated throughout the lifecycle.

---

## Step 1 — Create the document

Save to `docs/tasks/<FEATURE-NAME>.md`. Use kebab-case for the filename.
Example: `docs/tasks/condo-search-filters.md`

Fill in every section from the plan you just produced. Sections marked *(planning agent)* are your responsibility now. Leave sections marked *(review agent)* and *(implementation agent)* blank — they are filled by the next agent.

---

## Document template

```markdown
# Task: <Feature Name>

**Status**: Draft
**Created**: <date>
**Branch**: <branch name, if known>

---

## 1. Requirements

### Goal
<One sentence — what this feature/fix achieves.>

### Success criteria
- <Measurable outcome 1>
- <Measurable outcome 2>

### Out of scope
- <Anything explicitly not included>

---

## 2. Current Behavior

<Describe what the system does today. Be concrete — user action → system response → outcome.>

### Current flow
\`\`\`
<ASCII or Mermaid diagram of the current flow>
\`\`\`

---

## 3. Proposed Solution

<Describe the approach. Focus on what changes and why.>

### Proposed flow
\`\`\`
<ASCII or Mermaid diagram of the proposed flow>
\`\`\`

### Key decisions
- <Decision and reasoning>
- <Constraint discovered>

---

## 4. Implementation Phases

Each phase must pass Gate 1 (independently testable), Gate 2 (one-sentence goal without "and"), and Gate 3 (150–350 lines of production code changed). See `docs/standard/ANALYSIS_AND_PLANNING.md` § Step 5 for sizing rules.

### Phase 1 — <Title>
**Goal**: <One sentence, no "and">
**Files to change**:
- `path/to/file.ts` — <what changes>

**Estimated lines changed**: ~<N> (excluding tests)
**Test criteria**: <What a passing test proves>

### Phase 2 — <Title>
**Goal**: <One sentence>
**Files to change**:
- `path/to/file.ts` — <what changes>

**Estimated lines changed**: ~<N>
**Test criteria**: <What a passing test proves>

<!-- repeat for each phase -->

---

## 5. Review Notes
*(review agent fills this section — do not edit manually)*

**Decision**: [ ] Approved  [ ] Approved with changes  [ ] Needs rework

### Simulation findings
<!--
For each flaw found:
  Flaw: <what the problem is and where in the flow>
  What would happen: <concrete description of the failure>
  Fix applied: <what was changed in § 3 or § 4>

If no flaws: "Simulation complete — no flaws found."
-->

**Reviewed by**: <review agent>
**Date**: <date>

---

## 6. Implementation Log
*(implementation agent fills this section — one entry per phase, after commit)*

### Phase 1 — <Title>
**Status**: [ ] Pending  [ ] In Progress  [ ] Complete
**Commit**: `<sha>`
**Files changed**:
- `path/to/file.ts`

**Unit / functional tests**:
- Frontend: X passed / Y failed
- Backend: X passed / Y failed
- Build: pass / fail

**Simulate review — manual test steps**:
1. [User action] → [function/route that handles it] → [actual result] ✅/❌
2. [Next step] → ... ✅/❌

**Success criteria**:
- [ ] <criterion from § 1> ✅/❌
- [ ] <criterion from § 1> ✅/❌

**Notes**: <anything unexpected, blockers, deviations from plan>

<!-- repeat for each phase -->

---

## 7. Final Verification
*(implementation agent fills after all phases)*

- [ ] All phases complete
- [ ] `CI=true npm run build` passes
- [ ] Frontend failures ≤ 1 (pre-existing baseline)
- [ ] Backend failures ≤ 11 (pre-existing baseline)
- [ ] `docs/CONFIGURATION-REFERENCE.md` updated (if config changed)

**Success criteria from § 1** — verify each one end-to-end:
- [ ] <copy each criterion from § 1 here> ✅/❌
```

---

## Step 2 — Passing to the next agent

### → Review agent opening prompt

```
Please review the plan in `docs/tasks/<FEATURE-NAME>.md`.

Set Status to "Under Review" immediately, then proceed.

---

Your primary job is to simulate the implementation mentally and find flaws before any code is written.

## How to review

### Step 1 — Read the codebase, not just the plan
Read every file listed in § 4 (Files to change) in the actual codebase.
Also read any file that calls or is called by those files.
Do not rely solely on the plan's description — verify against real code.

### Step 2 — Simulate the implementation phase by phase
For each phase, mentally execute the change:
- Apply the described change to the file in your head
- Trace what happens at runtime: which functions are called, what data flows through, what the user sees
- Check whether the change in this phase is self-contained or silently depends on a later phase

Ask yourself for each phase:
- If I applied only this phase and ran the app, would it work or break?
- Does the proposed change actually produce the described outcome?
- Are there edge cases (empty data, network error, race condition, auth state, missing field) the plan doesn't handle?
- Does this interact with existing code in a way the plan doesn't mention?

### Step 3 — Verify the flow end-to-end
Trace the full proposed flow (§ 3) from user action to final state:
- Does each step logically follow from the previous?
- Is there a gap where the plan assumes something works but doesn't explain how?
- Does the success criteria in § 1 actually get satisfied by this flow, or only partially?

### Step 4 — Check phase sizing and ordering
- Each phase must be independently testable (Gate 1)
- Each phase goal must be expressible in one sentence without "and" (Gate 2)
- Each phase must be 150–350 lines of production code (Gate 3)
- Phases must be in an order that makes each one testable before the next begins

---

## What to do with findings

**If you find a flaw:**
- State exactly what the flaw is and where in the flow it occurs
- Describe what would actually happen if the plan were implemented as written
- Propose a concrete fix (revised flow, additional step, file change, phase restructure)
- Update § 3 (Proposed Solution) or § 4 (Implementation Phases) directly in the document with your fix
- Record the flaw and your fix in § 5 (Review Notes)

**If you find no flaws:**
- Do not modify §§ 1–4
- Fill in § 5 with "Approved — no issues found" and set Status to "Approved"

**Only modify the plan if there is a real flaw. Do not suggest improvements for their own sake.**

---

## Output format for § 5

Fill in the Review Notes section like this:

**Decision**: Approved / Approved with changes / Needs rework

### Simulation findings
For each flaw found:
> **Flaw**: <what the problem is and where in the flow>
> **What would happen**: <concrete description of the failure>
> **Fix applied**: <what was changed in § 3 or § 4>

If no flaws: write "Simulation complete — no flaws found."

**Reviewed by**: review agent
**Date**: <date>

---

Reference files:
- `CLAUDE.md` — project conventions and code patterns
- `docs/standard/ANALYSIS_AND_PLANNING.md` — phase sizing rules
```

### → Implementation agent opening prompt (`/implement` — default)

Use this when the user said "implement" without requesting phase-by-phase approval.

```
Please implement the plan in `docs/tasks/<FEATURE-NAME>.md`.

The plan is approved (§ 5 shows Approved). For each phase, run this cycle:

1. State success criteria before writing any code.
2. Implement the phase following conventions in `CLAUDE.md`.
3. Run `CI=true npm test -- --watchAll=false` and `CI=true npm run build`.
4. Simulate a user review — trace each change through the code. Fix any issues found.
5. **Commit** the phase with message format `[type](scope): description`.
6. Fill in § 6 (Implementation Log) for the phase with commit SHA, files changed, and test results.
7. Proceed to the next phase immediately — no waiting.

After all phases:
8. Fill in § 7 Final Verification.
9. Update the **Status** field in the document header to `Complete`.

**HARD RULES — never override these:**
- Commit after every phase — do not batch phases into one commit
- Never skip the self-review step (step 4) before committing
- Never wait for user approval between phases — that is `/implement-review` behavior
```

---

### → Implementation agent opening prompt (`/implement-review` — manual approval)

Use this when the user explicitly asked to review and approve each phase before it is committed.

```
Please implement the plan in `docs/tasks/<FEATURE-NAME>.md`.

The plan is approved (§ 5 shows Approved). For each phase, run this cycle:

1. State success criteria before writing any code.
2. Implement the phase following conventions in `CLAUDE.md`.
3. Run `CI=true npm test -- --watchAll=false` and `CI=true npm run build`.
4. Present to the user: what changed, test results, build status, success criteria (✅/❌), manual test steps they can follow.
5. **STOP. Wait for explicit user approval** ("proceed", "approved", "looks good", or similar).
   - Do NOT assume silence = approval.
   - If feedback is given, make changes, re-test, present again.
6. After approval: **commit** the phase with message format `[type](scope): description`.
7. Fill in § 6 (Implementation Log) for the phase with commit SHA, files changed, and test results.
8. Proceed to the next phase (repeat from step 1).

After all phases:
9. Fill in § 7 Final Verification.
10. Update the **Status** field in the document header to `Complete`.
```

---

## Step 3 — Updating status

Update the **Status** field in the document header as it moves through the lifecycle:

| Status | Set by | Meaning |
|--------|--------|---------|
| `Draft` | Planning agent | Document created, not yet reviewed |
| `Under Review` | Review agent | Review in progress |
| `Approved` | Review agent | Ready to implement |
| `Needs Rework` | Review agent | Planning agent must revise § 3–4 |
| `In Progress` | Implementation agent | Implementation underway |
| `Complete` | Implementation agent | All phases done, § 7 checklist passed |
