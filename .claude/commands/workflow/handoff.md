Produce a structured handoff summary for this conversation so a new agent can resume without re-reading the full history.

Write the full summary in the chat AND save it to `docs/handoffs/HANDOFF-<task-slug>.md` where `<task-slug>` is the kebab-case name of the current task (e.g. `HANDOFF-railway-deploy.md`).

Both are mandatory. Skipping the file save defeats the purpose of the handoff.

---

## Summary format

Use this exact structure. Omit any section that has nothing to record.

---

### Active Task
One sentence: what the user is trying to achieve right now.
Include the success criteria if they were stated.

---

### Completed This Session
Bullet list — what was finished, including file paths changed.
Be specific: "Updated `backend/app.py` line 24 to replace `postgres://` with `postgresql://`"
not just "fixed database URL".

---

### In Progress
What was started but not finished.
Include the exact stopping point: last file edited, last command run, last test result seen.

---

### Next Steps
Ordered list of what to do next, specific enough that a new agent can act without asking.
Example: "1. Implement Phase 4 (APScheduler) per `docs/tasks/railway-vercel-deploy.md`"

---

### Files Changed This Session
List every file that was created, edited, or deleted.
Format: `path/to/file` — one-line description of change

---

### Key Decisions & Context
Decisions that are not obvious from reading the files — reasoning, tradeoffs, constraints discovered.
Example: "Railway injects `postgres://` scheme; SQLAlchemy 1.4+ requires `postgresql://` — fix must happen before `create_engine`"

---

### Known Issues / Blockers
Anything broken, incomplete, or requiring the user's input before proceeding.

---

### Test State
Last known results:
- Frontend build: passing / failing
- Backend startup: passing / failing
- Railway deploy: passing / failing / not yet deployed

---

### How to Resume
Two or three sentences a new agent can use as its opening prompt.
Example:
> "We are implementing Phase 4 of the Railway/Vercel deployment. Phases 1–3 are committed. The next step is to add APScheduler to `backend/app.py` and `backend/requirements.txt` per the plan in `docs/tasks/railway-vercel-deploy.md`."

---

## Rules for writing the summary

- **Concrete over vague.** File paths, line numbers, commit SHAs, exact error messages.
- **State, not narration.** Describe where things stand, not the story of how we got there.
- **Enough to act.** A new agent reading only this summary should be able to continue without asking clarifying questions.
- **No padding.** Skip sections with nothing to record.
