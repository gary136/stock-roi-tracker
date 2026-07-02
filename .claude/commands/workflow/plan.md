Follow the Analysis & Planning workflow from `docs/standard/ANALYSIS_AND_PLANNING.md` for the task described above.

Work through all 5 steps in sequence. Do not skip steps or jump to solutions.

---

## Step 1 — Understand Requirements
- State the goal clearly in one sentence
- Define measurable success criteria (how do we know it's done?)
- Identify constraints (existing API shape, no breaking changes, etc.)

## Step 2 — Simulate Current Behavior
- Trace the relevant user action through the code
- List which files/components/hooks/routes are involved
- Document what currently happens and what the gap or problem is

## Step 3 — Create Flow Diagram
Draw **two** ASCII diagrams:
1. **Current flow** — what happens now (including the problem)
2. **Proposed flow** — how the requirements will be realized (the fix/feature)

Use this format:
```
┌─────────────────────────────┐
│ Step description             │
└────────────┬────────────────┘
             ▼
```

## Step 4 — Turn Requirements into Workable Actions
List concrete, actionable items derived from the proposed flow.
Each action = one specific thing to change/add/remove in the code.

## Step 5 — Break Actions into Phases

Apply these three gates **in order** to size each phase correctly.

### Gate 1 — Independent testability (hard rule, check first)
Can you write a meaningful test for this phase without the next phase existing?
If no → the phase boundary is wrong. Reshape it before continuing.

### Gate 2 — Cognitive load (one-sentence rule)
Describe the phase in one sentence without using "and".
- ✅ "Add processing flag to prevent duplicate fetch execution"
- ❌ "Add flag and implement deduplication and update route" → split into 3 phases

If you need "and", it is more than one phase.

### Gate 3 — Diff size (quantitative sanity check)
Estimate lines changed = additions + deletions, excluding test files.

| Size | Lines changed | Split if... |
|------|--------------|-------------|
| Small | < 150 | rarely needed |
| Medium (ideal) | 150–350 | — |
| Large (max) | 350–500 | prefer to split |
| Too large | > 500 | **always split** |

### Format for each phase
- Phase N: [name] — [one-sentence goal] — [~estimated lines changed]
  - Files: [list files to change]
  - Test: [how it will be tested independently]

## Completion Checklist
- [ ] Requirements clearly stated with success criteria
- [ ] Current behavior traced through actual code
- [ ] Both current and proposed flow diagrams created
- [ ] Workable actions listed
- [ ] Phases defined, each independently testable
- [ ] Files that need changes identified

**Do not start coding yet.** Present the plan and wait for confirmation before proceeding to `/implement`.
