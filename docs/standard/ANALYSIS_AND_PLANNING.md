# Analysis & Planning Standard

## Step 5 — Phase Sizing Rules

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

A 150-line hook with 5 `useEffect` dependencies is harder than a 400-line model.
When in doubt, apply Gate 2 first.

### Format for each phase
```
Phase N: [name] — [one-sentence goal] — [~estimated lines changed]
  Files: [list files to change]
  Test: [how it will be tested independently]
```
