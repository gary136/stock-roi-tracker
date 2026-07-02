Commit all uncommitted changes and push to origin/main.

---

## Phase 1 — Commit all uncommitted changes

1. Run `git status` to see what is untracked or modified.
2. Stage and commit in logical groups — one commit per concern. Do not batch unrelated changes into a single commit.
3. Follow the conventional commit style: `type(scope): description`
   - `feat(backend):`, `feat(frontend):`, `fix(deploy):`, `chore(workflow):`, `docs(tasks):` etc.
4. Never commit: `.env` files, secrets, `__pycache__/`, or build artifacts (`frontend/build/`).
5. After all commits, run `git status` to confirm the working tree is clean.

## Phase 2 — Push

Run `git push origin main`.

Confirm the push succeeds and report the final commit hash and how many commits were pushed.
