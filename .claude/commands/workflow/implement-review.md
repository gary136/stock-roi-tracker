Implement the plan in `docs/tasks/<FEATURE-NAME>.md` with manual approval between each phase.

The plan must be Approved in § 5 before starting.

For each phase, run this cycle:

1. State success criteria before writing any code.
2. Implement the phase following conventions in `CLAUDE.md`.
3. Run frontend build (`CI=true npm run build`) and backend startup check (`python app.py`).
4. Present to the user: what changed, build/test results, success criteria (✅/❌), manual test steps they can follow.
5. **STOP. Wait for explicit user approval** ("proceed", "approved", "looks good", or similar).
   - Do NOT assume silence = approval.
   - If feedback is given, make changes, re-test, present again.
6. After approval: **commit** the phase with message format `[type](scope): description`.
7. Fill in § 6 (Implementation Log) for the phase.
8. Proceed to the next phase (repeat from step 1).

After all phases:
9. Fill in § 7 Final Verification.
10. Update the **Status** to `Complete`.
