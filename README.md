# FoFoDo

> A deliberately-constrained task tracker that enforces *what not to open*, with a clean REST + MCP API, open-source self-host, and (optionally) a free, ad-supported hosted tier.

FoFoDo is not a productivity maximizer. It is a **constraint instrument**. Most todo apps fail in two directions: they let you pile on infinite work (fragmentation), and they nag about what you *forgot* instead of surfacing what you're *avoiding*. FoFoDo makes it easy to capture anything, hard to over-commit, and impossible to ignore what you're dodging — while staying frictionless enough that you actually open it.

It is also a clean, hackable, API/MCP-first task backend that you can self-host and that other tools (Claude Code, FOREMAN, your own scripts) can drive programmatically.

---

## The WIP-3 philosophy

The headline feature is the **limit**, not the feature list.

- A task moves through `inbox` → `next` → `active` → `done`, plus `snoozed`.
- **No more than 3 tasks can be `active` at once.** This is enforced server-side in a Firestore transaction — not advisory client UI. Trying to activate a 4th returns a kind prompt to *bump* one of your current three.
- Backing off is a first-class action. Whole projects can be paused or snoozed guilt-free and resumed later.
- Avoidance is made visible: a weekly audit surfaces the hat with no activity, the project paused longest, and the task you keep pushing.
- Nudges are kind and curious ("Grow's been quiet — worth a 10-minute poke?"), never scolding. No streaks, no guilt walls.

The "3" is not configurable in v1, on purpose.

---

## Feature overview (mapped to REQ-IDs)

| Area | What you get | REQ-IDs |
| --- | --- | --- |
| **Capture** | One-box quick-add; lands in `inbox` instantly; optional natural-language parse (`call Jamie tomorrow 3pm #grow`); voice via Web Speech API; inbox triage | REQ-CAP-01..04 |
| **Tasks** | Full CRUD + complete/restore; markdown notes; manual reorder; views (Today/Active, Next, Inbox, By Hat, By Project, Done, Snoozed); snooze with wake date | REQ-TASK-01..05 |
| **FoFo OS layer** | WIP-3 hard limit; four hats everywhere; one Active Bet + leading indicator; four-tile dashboard; dismissible cadence prompts; avoidance audit | REQ-FOS-01..06 |
| **Search** | Global fuzzy search over titles, notes, project names (client-side Fuse.js over the offline cache; a basic server endpoint also exists) | REQ-SRCH-01 |
| **Reminders** | Browser push (FCM web push) and signed webhook reminders; a scheduled engine that never double-fires | REQ-REM-01..03 |
| **AI (optional)** | NL capture parse, auto-triage suggestion, avoidance summary, "What now?", break-it-down — all behind a per-user kill switch with deterministic fallbacks | REQ-AI-01..06 |
| **API** | Authenticated REST API for everything; OpenAPI spec; Firebase ID token *or* API key auth; create/revoke hashed API keys; hosted quotas | REQ-API-01..04 |
| **MCP** | Streamable-HTTP MCP server with 9 tools that honour the same auth + WIP-3 rules as the API | REQ-MCP-01..03 |
| **Auth** | Firebase Auth (email/password + Google); FFN sign-in slot reserved for hosted | REQ-AUTH-01..02 |
| **Data ownership** | Full JSON export; complete account/data delete | REQ-DATA-01..02 |
| **Hosted (flagged off in OSS)** | Ad slots, free-tier quotas | REQ-HOST-01..02 |

---

## Quick start (self-host)

You bring your own Firebase project; `firebase deploy` does the rest. Clone → running in well under an hour.

```bash
git clone <your-fork-or-this-repo> fofodo
cd fofodo

# 1. Install the Firebase CLI and log in
npm install -g firebase-tools
firebase login

# 2. Point the repo at YOUR Firebase project
#    (edit .firebaserc, or: firebase use --add)

# 3. Configure the backend
cp functions/.env.example functions/.env   # then edit
cd functions && npm install && cd ..

# 4. Deploy rules, indexes, functions, and hosting
firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
```

For the full walkthrough — including how to use the **default** Firestore database instead of a named one, every environment variable, and the optional Terraform path — see **[SELF-HOST.md](./SELF-HOST.md)**.

> **Heads-up for the SPT/hosted deployment:** FoFoDo ships into the *shared* `fofoapps-934be` project and is isolated there via a named Firestore database (`fofodo`), a dedicated Hosting site (`fofodo` → https://fofodo.web.app), and `fofodo`-prefixed Cloud Functions. A fresh self-host project does not need this — see DESIGN.md and SELF-HOST.md.

---

## Documentation

| Doc | What's in it |
| --- | --- |
| **[DESIGN.md](./DESIGN.md)** | Architecture, the shared-project isolation strategy, data model, WIP-3 enforcement, the reminder engine, the AI-additive design, and the auth model |
| **[SELF-HOST.md](./SELF-HOST.md)** | Deploy on a fresh Firebase project: prerequisites, env vars, deploy commands, the Terraform option |
| **[docs/API.md](./docs/API.md)** | Every REST endpoint, with auth, body, and `curl` examples |
| **[docs/openapi.yaml](./docs/openapi.yaml)** | Machine-readable OpenAPI 3.0 spec |
| **[docs/MCP.md](./docs/MCP.md)** | Connecting an MCP client and the full tool reference |
| **[OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md)** | Decisions made and decisions still open |

---

## Tech stack

- **Frontend:** Quasar Framework + TypeScript, built as an installable PWA (offline-first via Firestore persistence; Fuse.js for client-side search).
- **Hosting:** Firebase Hosting (static).
- **Backend compute:** Cloud Functions for Firebase, 2nd gen — one surface for the REST API, the MCP server, and the scheduled reminder engine. Scales to zero.
- **Data:** Cloud Firestore (with offline persistence) + Firestore Security Rules.
- **Auth:** Firebase Authentication (email/password + Google).
- **AI:** Firebase Genkit flows on Vertex AI (Gemini Flash-Lite by default; configurable). All AI is optional.
- **Push:** Firebase Cloud Messaging (web push).
- **Scheduling:** Cloud Scheduler → a scheduled Cloud Function (every 5 minutes).

All four config flags — `HOSTED`, `ADS_ENABLED`, `FFN_AUTH_ENABLED`, `QUOTAS_ENABLED` — default **off** in the open-source build (REQ-OSS-03).

---

## License

MIT. See [LICENSE](./LICENSE). Copyright (c) 2026 Forrester Terry / Sweet Papa Technologies.
