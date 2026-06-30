# Open Questions & Decisions

This tracks the §15 questions from the spec, the owner's answers (already given), and the remaining `FOFO-DECISION` items that still need a concrete choice before they can be fully implemented. Per guardrail G-1, where a detail is under-specified the code leaves a `// FOFO-DECISION:` marker rather than inventing a solution.

---

## Resolved (owner decisions, SPEC §15)

| # | Question | Decision |
| --- | --- | --- |
| 1 | **Name** — keep FoFoDo, or rename? | **Keep FoFoDo.** |
| 2 | **License** — MIT for the core? | **Yes — MIT.** `LICENSE` is MIT; © 2026 Forrester Terry / Sweet Papa Technologies. |
| 3 | **FFN sign-in** — which integration path? | **Skip FFN for now, but leave room to add it later easily.** Implemented as a config flag (`FFN_AUTH_ENABLED`, default off) and absent from the OSS build. The exact OIDC/SDK path is deferred (see below). |
| 4 | **AI model** — default Gemini-on-Vertex? name a fallback. | **RESOLVED — `gemini-3.1-flash-lite` on Vertex AI.** Confirmed live in the FoFoApps project at the **`global`** location (NOT served from `us-central1`). Wired via `@genkit-ai/google-genai`'s `vertexAI` plugin; Genkit ref `vertexai/gemini-3.1-flash-lite`. Overridable via `FOFODO_AI_MODEL` / `FOFODO_AI_LOCATION`. |
| 5 | **Ads** — which network for the hosted free tier? | **House ads for now**, behind `ADS_ENABLED` (default off). Add hook-ins so common ad networks can be plugged in later. The adapter interface is still to be defined (see below). |
| 6 | **Reminder cadence** — 1-minute vs 5-minute tick? | **5 minutes** (cost over punctuality). Encoded as `CONFIG.REMINDER_SCHEDULE = "every 5 minutes"` and used by `fofodoScheduler`. |
| 7 | **Hat names** — keep Direction/Build/Distribution/Ops verbatim? | **No — friendlier, more universal labels.** Chosen names (stable keys unchanged): `direction` → **Steer**, `build` → **Build**, `distribution` → **Grow**, `ops` → **Run**. `ops`/Run is the default "Unsorted" landing hat. Self-host users may rename; the four-slot structure is fixed in v1. |

---

## Remaining `FOFO-DECISION` items

These have a placeholder or default in the code and need an explicit decision before the related feature is fully realized.

### D-1 — Exact Vertex model id for "Gemini 3.1 Flash Lite" — RESOLVED
Confirmed and shipped: **`gemini-3.1-flash-lite`**, served from the Vertex AI **`global`** location (verified live in `fofoapps-934be`; it is not available in `us-central1`). Driven through `@genkit-ai/google-genai`'s `vertexAI` plugin with the Genkit model ref `vertexai/gemini-3.1-flash-lite`. Defaults live in `config.ts` and are overridable via `FOFODO_AI_MODEL` / `FOFODO_AI_LOCATION`. Suggested fallback if `global` capacity is ever constrained: re-point `FOFODO_AI_MODEL` to a regional Flash-Lite in `us-central1`.

### D-2 — FCM token storage approach
Web-push delivery reads `users/{uid}.fcmTokens` (an array, pruned on dead delivery). Decide and document the client-side registration flow: when tokens are written, how multiple devices/browsers are represented, token-refresh handling, and whether tokens should move to a subcollection if per-token metadata (e.g. user-agent, last-seen) is wanted. Current shape is a simple array on the user doc.

### D-3 — FFN sign-in OIDC path
FFN sign-in is reserved behind `FFN_AUTH_ENABLED` but not implemented. Decide the integration path — an OIDC bridge into Firebase Auth vs. an existing FFN auth SDK — and point at the right FFN auth docs/repo. Must remain a hosted-only module that never ships in the OSS build (G-8).

### D-4 — Ad-network adapter interface
House ads only for v1, behind `ADS_ENABLED`. Define the adapter/hook-in interface so common networks can be added later without touching core: the slot contract (where ads render), the adapter API (init, request, render, teardown), and how a network is selected by config. Must be fully removable by flag so it never leaks into the OSS build.
