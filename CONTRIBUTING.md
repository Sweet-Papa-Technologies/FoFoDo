# Contributing to FoFoDo

FoFoDo is built the Way of the FoFo: **fight for simplicity, deterministic-first,
security is not delegated.** Please read `SPEC.MD` §0 (guardrails) and `DESIGN.md`
before opening a PR.

## Ground rules (from SPEC §0)

- **G-1 — Build only what's specified.** No new libraries/services/features
  without a spec line. If something's missing, leave a `// FOFO-DECISION:` marker
  and add a note to `OPEN-QUESTIONS.md` instead of inventing a solution.
- **G-3 — Deterministic-first.** AI is additive sugar. Every flow must work fully
  with AI disabled. No core path may depend on a model call succeeding.
- **G-5 — Security is not delegated.** Touching task writes, auth, API keys, or
  Security Rules requires a test and a reviewer call-out.
- **G-7 — Tests are the safety net.** The five mandatory suites (capture parse,
  WIP-3, reminder scheduling, key-quota, Security Rules) must stay green.

## Workflow & PR etiquette

1. **Branch** off `main`: `feat/<area>-<short-desc>` or `fix/<area>-<short-desc>`.
2. **Reference REQ-IDs** in commits and the PR description (e.g. `REQ-FOS-01`).
   Every behavioural change maps to a requirement or an open question.
3. **Keep PRs small and single-purpose.** One concern per PR. Split refactors
   from behaviour changes.
4. **Tests before merge.** `cd functions && npx vitest run` is green; new
   behaviour ships with a test. Security-Rules changes run the emulator suite.
5. **No secrets in the diff.** API keys are hashed at rest; nothing sensitive in
   the client bundle. Hosted-only code stays behind config flags (G-8).
6. **Conventional-ish commits**: `feat:`, `fix:`, `docs:`, `test:`, `chore:`,
   `refactor:` with a REQ-ID where relevant.
7. **Review checklist** (reviewer): does it honour WIP-3 server-side? does AI-off
   still work? are rules/tests updated? is it the smallest change that works?

## Local dev

```bash
# Backend
cd functions && npm ci && npm run build && npx vitest run
# Frontend
cd app && npm ci && npm run dev
# Emulators (incl. Security-Rules tests)
firebase emulators:start
```

See `SELF-HOST.md` for a full clone-to-running walkthrough.
