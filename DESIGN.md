# FoFoDo — Design

This document describes how FoFoDo is built: the architecture, how it is isolated inside a shared Firebase project, the data model, and the load-bearing designs (WIP-3 enforcement, the reminder engine, the AI layer, and auth).

Design principles that drive everything below:

- **Constraint over capability** — the limit (WIP-3) is the product.
- **Deterministic-first, AI-additive** — the app is 100% usable with every AI feature disabled; no core flow depends on a model call.
- **Design for failure** — every AI call, network call, and push delivery has a graceful failure path that never blocks capture or editing.
- **Security is not delegated** — Firestore Security Rules are part of the deliverable; WIP-3 and per-user isolation are enforced at the rules/server layer, not just in the UI.
- **Fewest moving parts** — one Cloud Functions surface, one frontend, one datastore.

---

## 1. Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Quasar PWA (TypeScript)  ── Firebase Hosting (site: fofodo)│
│   • offline-first (Firestore persistence + Fuse.js search)  │
│   • FCM web push   • service worker                         │
└───────────────┬────────────────────────────────────────────┘
                │ Firebase SDK (ID token)        │ API key
                ▼                                ▼
┌──────────────────────────┐   ┌─────────────────────────────┐
│  Cloud Firestore         │   │  Cloud Functions (2nd gen)  │
│  named DB "fofodo"       │   │   • fofodoApi  (REST/OpenAPI)│
│  users/{uid}/...         │◄──┤   • fofodoMcp  (MCP, HTTP)  │
│   tasks/projects/hats/   │   │   • Genkit AI flows          │
│   reminders/apiKeys/     │   │   • fofodoScheduler (cron)   │
│   events                 │   │   • webhook dispatch          │
│  + Security Rules        │   └──────────────┬──────────────┘
└──────────────────────────┘   Cloud Scheduler ─┘ (every 5 min)
                               FCM ─ web push out
```

**Hosting + Cloud Functions, not App Hosting.** The frontend is a static SPA/PWA, so App Hosting's always-on SSR server is unnecessary and costlier. Cloud Functions (2nd gen) scale to zero and cover the API, MCP, AI, scheduling, and webhooks on one surface.

Hosting rewrites route same-origin first-party traffic into the functions:

- `/api/**` → `fofodoApi` (us-central1)
- `/mcp` and `/mcp/**` → `fofodoMcp` (us-central1)
- everything else → `index.html` (the SPA)

Both functions are also reachable at their raw function URLs for external/programmatic use.

---

## 2. Shared-project isolation strategy

The hosted deployment lives in **`fofoapps-934be` (FoFoApps)**, a **shared** Firebase project that hosts many sibling apps on a single default Firestore database. To guarantee zero blast radius on those siblings, FoFoDo is fully isolated three ways:

1. **A named Firestore database — `fofodo`.** All FoFoDo data lives in its own named database, never the shared default DB. Critically, **a named database carries its own Security Rules**, so FoFoDo's rules (including the WIP-3 client gate) never touch sibling apps. The database id is read from `FOFODO_DB` (default `fofodo`) in `functions/src/config.ts` and bound in `functions/src/firebase.ts` via `getFirestore(CONFIG.databaseId)`.

2. **A dedicated Hosting site — `fofodo`.** Served at `https://fofodo.web.app`, separate from any other site on the project. Configured in `firebase.json` (`hosting.site = "fofodo"`) and targeted in `.firebaserc`.

3. **`fofodo`-prefixed Cloud Functions.** `fofodoApi`, `fofodoMcp`, and `fofodoScheduler` (all `us-central1`), so function names never collide with sibling apps that share the project.

Terraform (`terraform/main.tf`) owns the long-lived data plane — the named database, the hosting site, the web-app registration, and API enablement — with `disable_on_destroy = false` so a `terraform destroy` can never tear down shared APIs. The Firebase CLI owns code/config deploys (rules, indexes, function code, hosting content) and auto-manages the Cloud Scheduler job.

> A fresh self-host project doesn't share anything, so this isolation is optional there. You can point FoFoDo at the **default** database instead of a named one (see SELF-HOST.md).

---

## 3. Data model (Firestore — flat & cheap)

All documents live under `users/{uid}` in the named `fofodo` database. References are defined in `functions/src/firebase.ts`.

```
users/{uid}
  - displayName, plan ("self" | "hosted-free"), createdAt
  - settings { aiEnabled, cadencePrompts, theme }
  - fcmTokens [..]            // registered web-push tokens (pruned on dead delivery)

users/{uid}/hats/{hatId}      // seeded with 4 on bootstrap; doc id == stable key
  - key, name, order

users/{uid}/projects/{projectId}
  - name, hatId, status ("active" | "paused" | "snoozed"),
    isActiveBet (bool), leadingIndicator (string|null), notes, createdAt

users/{uid}/tasks/{taskId}
  - title, notes, hatId, projectId|null,
    status ("inbox" | "next" | "active" | "done" | "snoozed"),
    due|null, snoozeUntil|null, order, pushCount (int, feeds avoidance audit),
    createdAt, completedAt|null

users/{uid}/reminders/{reminderId}
  - taskId, fireAt, channels ["push","webhook"], webhookUrl|null, webhookSecret|null,
    fired (bool), firedAt|null, attempts (int), processingAt|null (lease), ownerUid

users/{uid}/apiKeys/{keyId}   // SERVER-ONLY (rules deny all client access)
  - name, hash (SHA-256), prefix, ownerUid, createdAt, lastUsedAt, revoked (bool)

users/{uid}/events/{eventId}  // append-only activity log for dashboard + audit
  - type, hatId|null, projectId|null, taskId|null, ts

// hosted-only, server-side quota tracking:
usage/{uid}/keys/{keyId}/{yyyymmdd}      - count   (per-day)
usage/{uid}/keys/{keyId}/min_{yyyymmddHHMM} - count (per-minute)
```

**Hats.** Exactly four, with **stable keys** and user-renameable **names**: `direction` → *Steer*, `build` → *Build*, `distribution` → *Grow*, `ops` → *Run*. `ops` is the default "Unsorted" landing hat for untriaged items. The four-slot structure is fixed in v1 (rename only). Seeding is idempotent — `ensureUserBootstrap` writes the four hat docs only when none exist.

**Indexes** (`firestore.indexes.json`): composite indexes for `tasks` on `(status, order)`, `(hatId, order)`, `(projectId, order)`, `(status, completedAt desc)`, and a **collection-group** index on `reminders` `(fired, fireAt)` that powers the scheduler's cross-user due-reminder scan. A collection-group index on `apiKeys.hash` backs API-key resolution.

---

## 4. WIP-3 enforcement design

The "3" is enforced in two complementary layers so it cannot be bypassed from any client.

**Layer 1 — Security Rules forbid client `active` writes** (`firestore.rules`). A client (even using the raw Firestore SDK with a valid ID token) may create or update a task to *any* status **except** `active`:

```
match /tasks/{taskId} {
  allow read, delete: if isOwner(uid);
  allow create: if isOwner(uid) && request.resource.data.status != 'active';
  allow update: if isOwner(uid)
                && (request.resource.data.status != 'active'
                    || resource.data.status == 'active');
}
```

Editing a task that is *already* active is allowed (it already passed the server gate), and transitioning *out* of active is allowed. Only transitioning *into* active from the client is impossible.

**Layer 2 — a server transaction is the only path into `active`** (`functions/src/wip3.ts`, `setActive`). The Admin SDK bypasses rules by design, so this is the single sanctioned door. Inside one Firestore transaction it:

1. reads all currently-active tasks and the target task,
2. returns idempotently if the target is already active,
3. if at the limit (`CONFIG.WIP_LIMIT = 3`) and no `bumpTaskId` was given, throws `Wip3Error` carrying the current three so the UI/MCP can offer a kind "which one do you want to bump?" prompt,
4. if a valid `bumpTaskId` was given, demotes that task to `next` and promotes the target,
5. logs a `task_activated` event.

Both surfaces use the same `setActive`:

- REST: `POST /api/tasks/:id/activate { bumpTaskId? }`
- MCP: the `set_active` tool

`repo.createTask` and `repo.updateTask` also defensively refuse `active` (create coerces it to `next`; update throws), so even an internal caller cannot sneak past the gate. The 4th-active attempt returns **HTTP 409** (`wip3_limit`) over REST and an equivalent error object over MCP.

---

## 5. Reminder engine design

`fofodoScheduler` (`functions/src/reminders.ts`) runs **every 5 minutes** (chosen over 1-minute for cost; still well within REQ-REM-01's "reasonable window"). Each tick:

1. **Finds due reminders** with a collection-group query: `reminders where fired == false and fireAt <= now`, limited to 200 per tick.
2. **Claims a lease** per reminder in a transaction: it sets `processingAt = now` only if the reminder isn't fired and isn't already leased (`now - processingAt < LEASE_MS`, a 4-minute lease shorter than the 5-minute tick). This makes overlapping or retried runs safe — a concurrent run can't grab the same reminder.
3. **Dispatches channels** — webhook and/or push:
   - **Webhook:** `POST`s a JSON payload (`reminderId`, `taskId`, `title`, `due`, `firedAt`) with an 8-second timeout. When a `webhookSecret` is set, the body is signed with **HMAC-SHA256** in the `x-fofodo-signature: sha256=<hex>` header (REQ-REM-02 / NFR-4).
   - **Push:** best-effort FCM multicast to the user's registered `fcmTokens`. No tokens or denied permission is a **graceful no-op, not an error**; dead tokens are pruned.
4. **Marks fired** on success (`fired: true`, `firedAt`, clears the lease).
5. **Bounded retry** on failure: increments `attempts`, clears the lease, and retries on the next tick until `REMINDER_MAX_ATTEMPTS` (3), after which it gives up (marks fired + `failed`) and logs a `reminder_failed` event.

**Idempotency:** because dispatch is gated on `fired == false` + the lease, a missed window simply fires on the next run and a reminder never double-fires (REQ-REM-03). Recurring reminders are an explicit non-goal in v1.

---

## 6. AI: additive and deterministic-first

Every AI feature is *additive sugar* on a fully-working deterministic app (`functions/src/ai.ts`):

- **Per-user kill switch:** `settings.aiEnabled` (default **off**). `aiEnabledFor(settings)` gates every AI call.
- **Global override:** the env var `FOFODO_AI_GLOBAL_OFF=1` forces AI off everywhere regardless of per-user settings.
- **Lazy load:** Genkit + Vertex are dynamically imported only on first use, so AI-off does zero model work and adds no cold-start cost.
- **Never throws to callers:** any init or generation failure returns `null`, and the caller falls back deterministically.

Deterministic fallbacks that always work with AI off:

- **Capture parse** (`functions/src/domain.ts`, `parseCapture`) — handles `#hat` tags, `today`/`tomorrow`, clock times (`3pm`, `15:30`), and `+project` hints, and always yields at least a title. The optional AI parse only *refines* this.
- **"What now?"** — returns the first active task ("Aligned with your current focus.").
- **Avoidance audit** — `avoidanceStats` renders the deterministic stats (quiet hats, longest-paused project, most-pushed task); only the prose summary is omitted when AI is off.
- **Triage / breakdown** — return `{ aiDisabled: true }` with a null suggestion when off.

Model: `gemini-3.1-flash-lite` on Vertex AI, served from the **`global`** location (it is not available in `us-central1`). Wired via `@genkit-ai/google-genai`'s `vertexAI` plugin (Genkit ref `vertexai/gemini-3.1-flash-lite`). Both overridable via `FOFODO_AI_MODEL` / `FOFODO_AI_LOCATION`.

---

## 7. Auth model

Two auth modes resolve to the **same** per-user authorization (`functions/src/auth.ts`):

1. **Firebase ID token** — `Authorization: Bearer <idToken>` — for the first-party app. Verified with `getAuth().verifyIdToken`.
2. **API key** — `X-API-Key: fofodo_...` **or** `Authorization: Bearer fofodo_...` — for external/programmatic use (scripts, MCP, FOREMAN).

Resolution order: an API key (recognised by the `fofodo_` prefix) is tried first; otherwise the bearer is treated as an ID token. Both produce a `Principal { uid, via, keyId? }` scoped to exactly one user.

**API keys** (`functions/src/apikeys.ts`): generated as `fofodo_<pub>_<secret>`, shown **once** at creation, and stored only as a **SHA-256 hash** plus a public `prefix`. Resolution is a collection-group lookup by hash with a constant-time compare; revoked keys are rejected immediately and a revoked key is never recoverable in plaintext. The `apiKeys` collection is **server-only** in the rules — the hash is never client-readable.

**Quotas** (hosted only): when `QUOTAS_ENABLED` is on, each API-key request is metered per-minute and per-day in `usage/...` via a transaction; over-limit returns **HTTP 429** with `limit`, `scope`, and `resetSeconds`. The OSS build (`QUOTAS_ENABLED=false`) is unlimited.

**Isolation:** Security Rules restrict every read/write to the caller's own `users/{uid}` subtree; `events` are append-only (no client update/delete); `apiKeys` and `usage` are fully server-only.
