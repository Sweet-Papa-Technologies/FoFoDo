# FoFoDo — Requirements & Build Spec

> **Working name:** FoFoDo (a FoFo + To-Do). Final name is FoFo's call.
> **Owner:** Forrester "FoFo" Terry — Sweet Papa Technologies (SPT)
> **GCP project:** FoFoApps
> **Version:** 1.0 (v1 scope)
> **Status:** Phase 0 input for the FoFo Agentic SDLC. Hand this to FOREMAN.
> **One-line:** A deliberately-constrained task tracker that enforces *what not to open*, with a clean API + MCP, open-source self-host, and a free ad-supported hosted tier.

---

## 0. Read This First (Guardrails for FOREMAN)

These are non-negotiable build constraints. They encode the Way of the FoFo. Treat violations as defects.

- **G-1 — Build ONLY what is specified here.** Do not introduce libraries, services, infrastructure, or "nice to have" features that are not named in this doc. If something seems missing or under-specified, leave a `// FOFO-DECISION:` marker and a short note in `OPEN-QUESTIONS.md` instead of inventing a solution.
- **G-2 — Fight for simplicity.** Prefer the smallest number of moving parts. One Cloud Functions surface, one frontend, one datastore. No microservice sprawl. No orchestration framework. If you find yourself writing 10+ scripts, stop and consolidate.
- **G-3 — Deterministic-first.** AI features are additive sugar on top of a fully-working deterministic app. The app MUST be 100% usable with every AI feature disabled. No core flow may depend on a model call succeeding.
- **G-4 — Design for failure.** Every AI call, every network call, every push delivery must have a defined failure path that degrades gracefully and never blocks capture or task editing. Offline is a first-class state, not an error.
- **G-5 — Security is not delegated.** Firestore Security Rules are part of the deliverable, not an afterthought. API keys are hashed at rest. No secrets in the client bundle. Per-user data isolation enforced at the rules layer, not just the app layer.
- **G-6 — Documentation is memory.** Ship `README.md`, `DESIGN.md`, `SELF-HOST.md`, `API.md`, `MCP.md`, and `OPEN-QUESTIONS.md`. Every REQ below maps to code; reference REQ-IDs in commits and tests.
- **G-7 — Tests are the safety net.** Unit tests for capture parsing, WIP-3 enforcement, reminder scheduling, API-key quota logic, and Security Rules. These five are mandatory; broader coverage welcome.
- **G-8 — Open-source clean.** Core repo must run on a fresh Firebase project with no SPT/FFN-specific code. Hosted-only concerns (FFN sign-in, ads, key quotas) live behind a config flag / separate module so the OSS build never ships them.

---

## 1. Why This Exists (Problem Statement)

FoFo runs a portfolio of projects across Stanford (EED) and SPT and self-identifies as a "loose cannon, bad at schedules." Generic todo apps fail him in two directions: they let him pile on infinite work (fragmentation), and they nag without making the *real* problem visible — which is **what he keeps avoiding**, not what he forgets.

FoFoDo is not a productivity maximizer. It is a **constraint instrument**. Its job is to make it easy to capture anything, hard to over-commit, and impossible to ignore what you're dodging — while staying frictionless enough that a loose cannon actually opens it.

It is also a clean, hackable, API/MCP-first task backend that other developers can self-host and that other FoFo apps (and FOREMAN) can drive programmatically.

---

## 2. Design Principles (the differentiators — do not water these down)

- **P-1 — Constraint over capability.** The headline feature is the *limit*, not the feature list. WIP-3 is enforced, not advisory.
- **P-2 — Frictionless capture.** Getting a thought in must be sub-2-second and possible from one box. Triage happens later.
- **P-3 — Make avoidance visible.** Automate the weekly avoidance audit. Surface the hat with no activity and the task that keeps getting pushed.
- **P-4 — Celebration over shame.** Nudges are kind and curious ("Distribution's been quiet — worth a 10-min poke?"), never scolding. No streak-guilt, no red overdue walls of shame.
- **P-5 — Loose coupling / surge & back-off.** Whole projects can be paused or snoozed guilt-free and resumed later. Backing off is a valid, first-class action.
- **P-6 — Your data is yours.** Full export anytime. Self-host is a real, supported path, not a teaser.
- **P-7 — Deterministic-first, AI-additive.** (See G-3.)

---

## 3. Users

- **U-1 — FoFo (primary).** Power user. Drives via UI, MCP (from Claude Code / FOREMAN / other FoFo apps), and API. Uses the full SPT Operating System layer.
- **U-2 — Self-hosting developer.** Clones the repo, brings their own Firebase project, `firebase deploy`, done. Wants the API + MCP for their own tooling. May or may not use the Hats layer.
- **U-3 — Hosted free user.** Signs in (incl. FFN) on the hosted site, gets the app free with ads and rate-limited API keys.

---

## 4. Core Concepts (Domain Model)

- **Task** — the atomic unit. Has: title, optional notes (markdown), `hatId`, optional `projectId`, `status`, optional `due`, optional reminder config, `createdAt`, `completedAt`, `order`.
- **Status** (task lifecycle): `inbox` → `next` → `active` → `done`; plus `snoozed`. **`active` is WIP-3-limited.** `inbox` = uncaptured/untriaged; `next` = triaged, ready; `active` = committed (max 3); `snoozed` = deliberately backed off with optional wake date.
- **Hat** — one of the four SPT roles: **Direction**, **Build**, **Distribution**, **Ops**. Every task and project carries exactly one hat (default `Ops` / "Unsorted" until triaged). Hats power the avoidance audit. Self-host users may rename hats but the four-slot structure is fixed in v1.
- **Project** — a loosely-coupled initiative/area grouping tasks. Has: name, `hatId`, `status` (`active` | `paused` | `snoozed`), optional notes. Pausing a project hides its tasks from default views without deleting them.
- **Active Bet** — exactly one project (or task) flagged as the current top priority, with a free-text **leading indicator** ("the one number that tells me it's working"). Always pinned in the UI.
- **Reminder** — attached to a task: a fire time + one or more channels (`push`, `webhook`). Simple, non-recurring in v1 (recurring is a non-goal, see §15).
- **Activity event** — append-only log of meaningful actions (task created/completed, hat touched, project resumed) used to compute the dashboard + avoidance audit. Low-cardinality, cheap.

---

## 5. Functional Requirements

REQ-IDs are stable. Each has an acceptance criterion (AC).

### 5.1 Capture (CAP)

- **REQ-CAP-01 — One-box quick add.** A single always-reachable input creates a task in `inbox` instantly. AC: from app open to task saved is ≤2 interactions and works offline.
- **REQ-CAP-02 — Natural-language parse (AI, optional).** Quick-add text like "call Jamie tomorrow 3pm #distribution" parses into title + due + hat. AC: parsing failure or AI-off falls back to saving the raw text as the title with no error (G-3/G-4).
- **REQ-CAP-03 — Voice capture.** Quick-add supports speech-to-text via the browser Web Speech API where available, feeding REQ-CAP-02. AC: unsupported browsers simply hide the mic button; no crash.
- **REQ-CAP-04 — Inbox triage.** An Inbox view lets the user assign hat/project/status to captured items. AC: a task can go from inbox to next/active in one screen.

### 5.2 Tasks & Lists (TASK)

- **REQ-TASK-01 — CRUD.** Create, read, update, complete, delete, restore tasks. AC: all reflected in real time across open clients and persisted offline.
- **REQ-TASK-02 — Markdown notes.** Tasks have an optional markdown notes body. AC: rendered safely (no XSS) on display.
- **REQ-TASK-03 — Reorder.** Tasks within a list are manually orderable (drag). AC: order persists per user.
- **REQ-TASK-04 — Views.** At minimum: **Today/Active**, **Next**, **Inbox**, **By Hat**, **By Project**, **Done (recent)**, **Snoozed**. AC: each view filters correctly and respects paused-project hiding.
- **REQ-TASK-05 — Snooze.** Any task can be snoozed with optional wake date; wakes back to `next`. AC: snoozed tasks leave active views and return on/after wake date.

### 5.3 FoFo OS Layer (FOS) — the heart of the app

- **REQ-FOS-01 — WIP-3 hard limit.** No more than 3 tasks may be in `active` at once. AC: attempting a 4th is blocked with a kind prompt to bump an existing active task; the limit is enforced server-side in Security Rules / a transaction, not just client UI.
- **REQ-FOS-02 — Hats everywhere.** Every task/project has exactly one hat. AC: untriaged items default to a clearly-labeled "Unsorted/Ops" hat and are surfaced for triage.
- **REQ-FOS-03 — Active Bet.** User designates one Active Bet + a free-text leading indicator; it is pinned at the top of the home dashboard. AC: exactly one can be set; changing it is one action.
- **REQ-FOS-04 — Four-tile dashboard.** Home shows four tiles: **Active Bet** (+indicator), **Your 3** (current active tasks), **Hat balance this week** (per-hat activity counts), **Needs attention** (overdue/aging/avoided). AC: loads from local cache instantly, refreshes from server.
- **REQ-FOS-05 — Cadence prompts.** Lightweight Daily ("pick your 3"), Weekly (avoidance audit + review), Monthly, Quarterly review surfaces. Dismissible, never blocking. AC: prompts can be fully turned off in settings.
- **REQ-FOS-06 — Avoidance audit (AI-assisted).** On the weekly cadence, compute and present: hats with little/no activity, the project paused longest, and the task pushed/snoozed the most times. AI writes a short, kind summary + one suggested 10-minute nudge. AC: with AI off, the deterministic stats still render; only the prose summary is omitted (G-3).

### 5.4 Search (SRCH)

- **REQ-SRCH-01 — Global search bar.** Fuzzy full-text search across task titles, notes, and project names. AC: returns results as-you-type; works offline against the local cache (client-side Fuse.js over synced data). Server-side search is a non-goal for v1.

### 5.5 Reminders & Notifications (REM)

- **REQ-REM-01 — Browser push reminders.** A task reminder fires a browser notification via FCM (web push) at the set time. AC: delivered within a reasonable window of the fire time when the user has granted notification permission; gracefully no-ops if permission denied.
- **REQ-REM-02 — Webhook reminders.** A reminder may POST a JSON payload to a user-configured webhook URL at fire time. AC: payload includes task id, title, due, and a signature/secret header the user configures; failures are retried a bounded number of times then logged.
- **REQ-REM-03 — Scheduling engine.** A scheduled Cloud Function (via Cloud Scheduler) runs on a fixed cadence, finds due reminders, dispatches channels, and marks them fired. AC: no reminder fires twice; missed-window reminders (e.g., server was idle) still fire on next run.

### 5.6 AI Features (AI) — all optional, all behind a toggle

Implemented with **Firebase Genkit** flows deployed as Cloud Functions.

- **REQ-AI-01 — NL capture parse.** (Backs REQ-CAP-02.)
- **REQ-AI-02 — Auto-triage suggestion.** Suggest a hat (and project, if obvious) for inbox items. AC: suggestion only; user confirms. Never auto-applies destructively.
- **REQ-AI-03 — Avoidance summary.** (Backs REQ-FOS-06.)
- **REQ-AI-04 — "What now?"** Given current time, a user-stated energy/time budget, and the Active Bet, suggest which of the 3 active tasks (or a next task) to do now, with a one-sentence why. AC: deterministic fallback = show the Active-Bet-aligned task.
- **REQ-AI-05 — Break it down.** Expand a large task into suggested next-actions the user can accept individually. AC: accepted items become normal tasks; rejected suggestions leave no trace.
- **REQ-AI-06 — Global AI kill switch.** A single setting disables all AI features app-wide. AC: with it off, no model calls are made and all deterministic flows still work (G-3).

### 5.7 API (API)

- **REQ-API-01 — REST API.** Authenticated REST endpoints for tasks, projects, hats, reminders, search, and dashboard. AC: documented in `API.md` + an OpenAPI spec file in the repo.
- **REQ-API-02 — Auth.** Two auth modes: Firebase ID token (for first-party app) and **API keys** (for external/programmatic use, incl. MCP and FOREMAN). AC: both resolve to the same per-user authorization; keys are scoped to one user.
- **REQ-API-03 — API keys.** Users can create/revoke named API keys. Keys are shown once, stored hashed. AC: a revoked key is rejected immediately; key never recoverable in plaintext after creation.
- **REQ-API-04 — Quotas (hosted).** Hosted tier enforces per-key rate limits + daily caps tracked in Firestore. AC: over-limit requests return 429 with reset info; self-host build defaults to unlimited.

### 5.8 MCP Server (MCP)

- **REQ-MCP-01 — MCP endpoint.** Expose an MCP server (Streamable-HTTP transport, stateless, running on the same Cloud Functions surface) so Claude Code / FOREMAN / other MCP clients can drive FoFoDo. AC: connects and lists tools from a standard MCP client.
- **REQ-MCP-02 — Tools.** At minimum: `capture_task`, `list_tasks` (by view/hat/project), `update_task`, `complete_task`, `set_active` (respecting WIP-3), `snooze_task`, `search`, `get_dashboard` (Active Bet + the 3 + hat balance), `set_reminder`. AC: each tool maps to the same authorization + WIP-3 rules as the API (no backdoors around constraints — G-5).
- **REQ-MCP-03 — Auth via API key.** MCP authenticates with a FoFoDo API key. AC: same key model as REQ-API-03; quota applies on hosted.

### 5.9 Auth & Accounts (AUTH)

- **REQ-AUTH-01 — Firebase Auth.** Email/password + Google sign-in via Firebase Authentication. AC: standard secure flows; per-user data isolation enforced in Security Rules.
- **REQ-AUTH-02 — FFN sign-in (hosted only).** Hosted tier additionally offers FoFo Network sign-in. AC: lives behind the hosted config flag; absent from the OSS build (G-8). Integration details: see `OPEN-QUESTIONS.md`.

### 5.10 Hosted / Monetization (HOST) — hosted build only

- **REQ-HOST-01 — Ad slots.** Defined, unobtrusive ad slot(s) in the hosted UI, behind a `HOSTED` flag. AC: OSS build renders nothing in these slots.
- **REQ-HOST-02 — Free tier limits.** Hosted free tier applies the API quotas (REQ-API-04). AC: limits are config-driven, not hardcoded.

### 5.11 Data Ownership (DATA)

- **REQ-DATA-01 — Export.** Full export of a user's tasks/projects/reminders as JSON (and tasks as CSV). AC: one action, complete data, re-importable.
- **REQ-DATA-02 — Delete account/data.** User can delete all their data. AC: irreversible, confirmed, complete.

---

## 6. Non-Functional Requirements (NFR)

- **NFR-1 — Offline-first.** App is fully usable offline for capture/edit/view via Firestore offline persistence + local cache; syncs on reconnect. (Reminders/AI/API obviously need connectivity.)
- **NFR-2 — Performance.** Dashboard and lists render from local cache instantly (<200ms perceived); no spinner-gating on core views.
- **NFR-3 — Cost.** Architecture must scale to zero when idle. Personal/self-host usage should sit comfortably in Firebase free/low tiers. No always-on compute.
- **NFR-4 — Security.** Firestore Security Rules enforce per-user isolation and WIP-3 server-side; API keys hashed; no secrets client-side; webhook payloads signed.
- **NFR-5 — Accessibility.** Keyboard-navigable, screen-reader labels on core flows, dark mode default with light option.
- **NFR-6 — PWA.** Installable PWA with service worker (enables offline + web push).

---

## 7. Architecture (locked)

```
┌────────────────────────────────────────────────────────────┐
│  Quasar PWA (TypeScript)  ── Firebase Hosting (static)       │
│   • offline-first (Firestore persistence + Fuse.js search)  │
│   • FCM web push   • service worker                         │
└───────────────┬────────────────────────────────────────────┘
                │ Firebase SDK (ID token)        │ API key
                ▼                                ▼
┌──────────────────────────┐   ┌─────────────────────────────┐
│  Cloud Firestore         │   │  Cloud Functions (2nd gen)  │
│  users/projects/tasks/   │◄──┤   • REST API (OpenAPI)      │
│  hats/reminders/apiKeys/ │   │   • MCP server (Streamable) │
│  events                  │   │   • Genkit AI flows         │
│  + Security Rules        │   │   • scheduled reminder/audit│
└──────────────────────────┘   │   • webhook dispatch        │
                               └──────────────┬──────────────┘
                                Cloud Scheduler ─┘ (cron triggers)
                                FCM ─ web push out
```

**Decision: Firebase Hosting + Cloud Functions. NOT App Hosting.** The frontend is a static SPA/PWA, so App Hosting's always-on/SSR server is unnecessary and costlier. Cloud Functions (2nd gen) scales to zero and covers API, MCP, AI, scheduling, and webhooks on one surface. If a future feature genuinely needs SSR or a long-lived process, revisit then — not in v1 (G-1/G-2).

---

## 8. Tech Stack (locked — do not substitute, G-1)

- **Frontend:** Quasar Framework + TypeScript, built as an installable PWA.
- **Hosting:** Firebase Hosting (static).
- **Backend compute:** Cloud Functions for Firebase, 2nd gen.
- **Data:** Cloud Firestore (with offline persistence) + Firestore Security Rules.
- **Auth:** Firebase Authentication (email/password + Google; + FFN on hosted).
- **AI:** Firebase Genkit flows (deployed as Cloud Functions). Model provider configurable; default to a Gemini model on Vertex within the FoFoApps project.
- **Push:** Firebase Cloud Messaging (web push).
- **Scheduling:** Cloud Scheduler → scheduled Cloud Function.
- **Search:** Fuse.js, client-side, over synced cache.
- **GCP project:** FoFoApps.

---

## 9. Data Model (Firestore — keep flat & cheap)

```
users/{uid}
  - displayName, settings { aiEnabled, cadencePrompts, theme }, plan ("self"|"hosted-free")

users/{uid}/hats/{hatId}            // seeded with 4: direction, build, distribution, ops
  - name, key, order

users/{uid}/projects/{projectId}
  - name, hatId, status ("active"|"paused"|"snoozed"), isActiveBet (bool),
    leadingIndicator (string|null), notes, createdAt

users/{uid}/tasks/{taskId}
  - title, notes, hatId, projectId|null,
    status ("inbox"|"next"|"active"|"done"|"snoozed"),
    due|null, snoozeUntil|null, order, pushCount (int, for avoidance audit),
    createdAt, completedAt|null

users/{uid}/reminders/{reminderId}
  - taskId, fireAt, channels ["push","webhook"], webhookUrl|null,
    fired (bool), firedAt|null, attempts (int)

users/{uid}/apiKeys/{keyId}
  - name, hash, prefix, createdAt, lastUsedAt, revoked (bool)

users/{uid}/events/{eventId}        // append-only, for dashboard/audit
  - type, hatId|null, projectId|null, taskId|null, ts

// hosted-only, server-side:
usage/{uid}/keys/{keyId}/{yyyymmdd}  - count   // quota tracking
```

**Security Rules musts:** a user can only touch their own subtree; WIP-3 enforced via a transaction/rule on task writes that set `status:"active"`; `apiKeys.hash` never readable by client.

---

## 10. Reminders / Scheduler Design

- Scheduled function runs every minute (or 5 min — pick the cheaper cadence that meets REQ-REM-01's "reasonable window"; document the choice).
- Query reminders where `fireAt <= now AND fired == false`. For each: dispatch channels, set `fired:true`, `firedAt`. Bounded retry on webhook/push failure (e.g., 3 attempts, then log to `events`). Idempotent so a missed/overlapping run never double-fires (REQ-REM-03).

---

## 11. Open-Source Packaging & Self-Host (SELF-HOST.md)

- **REQ-OSS-01 — Clean core.** Repo runs on a fresh Firebase project with zero SPT/FFN code (G-8).
- **REQ-OSS-02 — One-command-ish deploy.** Provide `.firebaserc`/`firebase.json` templates, a `.env.example`, Firestore rules + indexes, and a short `firebase deploy` walkthrough. Target: a developer goes from clone → running personal instance in well under an hour.
- **REQ-OSS-03 — Config flags.** `HOSTED`, `ADS_ENABLED`, `FFN_AUTH_ENABLED`, `QUOTAS_ENABLED` all default OFF in the OSS build.
- **REQ-OSS-04 — License.** MIT (confirm in OPEN-QUESTIONS).

---

## 12. Hosted Deployment & Monetization (hosted build only)

- Same codebase, hosted config flags ON.
- Adds: FFN sign-in (REQ-AUTH-02), ad slots (REQ-HOST-01), API-key quotas (REQ-API-04 / REQ-HOST-02).
- All hosted-only surface area must be removable by config so it never leaks into OSS (G-8).

---

## 13. v1 Scope vs. Non-Goals

**In v1:** everything in §5 marked above, the architecture in §7, the four hats, WIP-3, Active Bet, four-tile dashboard, avoidance audit, search, push + webhook reminders, the AI features in §5.6, REST API + OpenAPI, MCP server + tools, Firebase + FFN(hosted) auth, ads + quotas (hosted), export/delete.

**Explicit non-goals for v1 (do NOT build — G-1):**
- Recurring reminders / RRULE.
- Native mobile apps (PWA covers mobile).
- Team/shared workspaces or collaboration.
- Server-side / hosted search index (Algolia/Typesense). Client-side only.
- Calendar sync, email integration, Slack, third-party importers.
- Custom hat counts beyond the fixed four (rename only).
- Payments / paid hosted tier (free-with-ads only in v1).
- Gamification / streaks (conflicts with P-4).

---

## 14. Definition of Done (v1)

1. Fresh-Firebase-project deploy works per SELF-HOST.md, no SPT/FFN code (REQ-OSS-01/02).
2. Offline capture → reconnect sync verified (NFR-1).
3. WIP-3 cannot be exceeded via UI, API, or MCP — proven by tests at the rules layer (REQ-FOS-01, G-7).
4. Push and webhook reminders both fire correctly and never double-fire (REQ-REM-*).
5. REST + MCP both create/list/complete tasks under API-key auth and respect WIP-3 (REQ-API/MCP).
6. AI kill switch off ⇒ zero model calls, app fully functional (REQ-AI-06, G-3).
7. Avoidance audit renders deterministic stats with and without AI (REQ-FOS-06).
8. Global search returns offline results as-you-type (REQ-SRCH-01).
9. Export produces complete, re-importable data (REQ-DATA-01).
10. Docs shipped: README, DESIGN, SELF-HOST, API (+OpenAPI), MCP, OPEN-QUESTIONS (G-6).
11. Mandatory tests green: capture parse, WIP-3, reminder scheduling, key-quota, Security Rules (G-7).

---

## 15. Open Questions for FoFo (put answers in OPEN-QUESTIONS.md)

1. **Name** — keep **FoFoDo** / `do.fofo.dev`, or something else?
2. **License** — MIT confirmed for the core? - Yes
3. **FFN sign-in** — which integration path (OIDC bridge? existing FFN auth SDK?) — point FOREMAN at the right FFN auth docs/repo. - Skip FFN for now, but leave room to easily implement later
4. **AI model** — default Gemini-on-Vertex in FoFoApps is assumed; confirm given the current export-control/model-access situation, and name a fallback model if the preferred one is unavailable. - Gemini 3.1 Flash Lite via Vertex
5. **Ads** — which ad provider/network for the hosted free tier (or house ads for now)? - house ads for now, will need to explore ads later. So add hook ins for common ones etc.
6. **Reminder cadence** — 1-minute vs 5-minute scheduler tick (cost vs. punctuality)? - 5 minute
7. **Hat names** — keep Direction / Build / Distribution / Ops verbatim as the four labels? - Nah, choose something more universal and friendly, but still applciable


NOTES:

- We should have unit test etc, use the `https://github.com/Sweet-Papa-Technologies/Agentic-SDLC/tree/main` MCP for testing process etc.
- We should setup GitLab CI/CD
- We should replace my current Apache License with the intended Licenses
- We should make documentation etc
- We should establish etiqutte for PRs etc etc.
