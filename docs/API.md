# FoFoDo REST API

The REST API (REQ-API-01) is implemented in `functions/src/api.ts` and served by the `fofodoApi` Cloud Function. A machine-readable spec lives at [openapi.yaml](./openapi.yaml).

- **Base URL (hosted):** `https://fofodo.web.app/api`
- **Base URL (self-host):** `https://<your-site>.web.app/api` (also reachable at the raw function URL)
- **Content type:** `application/json` (request bodies are JSON; 1 MB limit)
- **CORS:** enabled for all origins.

Examples below use `$BASE` and `$KEY`:

```bash
export BASE=https://fofodo.web.app/api
export KEY=fofodo_xxxxxxxxxxxx_yyyyyyyy...
```

---

## Authentication

Two modes resolve to the **same** per-user authorization (REQ-API-02). Every endpoint except `/health` requires auth.

| Mode | Header | Used by |
| --- | --- | --- |
| **API key** | `X-API-Key: fofodo_...` **or** `Authorization: Bearer fofodo_...` | scripts, MCP, FOREMAN |
| **Firebase ID token** | `Authorization: Bearer <idToken>` | first-party app |

A key recognised by its `fofodo_` prefix is tried first; otherwise the bearer is treated as a Firebase ID token. All examples use an API key.

### Auth error responses

| Status | When | Body |
| --- | --- | --- |
| `401` | missing / invalid / revoked credentials | `{ "error": "Missing credentials. ..." }` |

---

## Error shapes

| Status | `error` | Notes |
| --- | --- | --- |
| `400` | `confirm_required` | delete-account without `confirm: "DELETE"` |
| `401` | _(message)_ | auth failure |
| `404` | `not_found` | task/resource missing |
| `409` | `wip3_limit` | see [WIP-3](#wip-3-409) |
| `429` | _(message)_ | see [Quota](#quota-429) (hosted only) |
| `500` | `internal` | unexpected error |

### WIP-3 (409) {#wip-3-409}

Returned by `POST /tasks/:id/activate` when 3 tasks are already active and no `bumpTaskId` was supplied:

```json
{
  "error": "wip3_limit",
  "message": "You already have 3 active tasks. Bump one to make room.",
  "activeTasks": [
    { "id": "abc123", "title": "Ship the landing page" },
    { "id": "def456", "title": "Reply to investor email" },
    { "id": "ghi789", "title": "Fix the webhook retry bug" }
  ]
}
```

Re-call with one of those ids as `bumpTaskId` to swap.

### Quota (429) {#quota-429}

Hosted only (`QUOTAS_ENABLED=true`). Self-host is unlimited. Returned by any authenticated endpoint when an API key exceeds its per-minute or per-day cap:

```json
{
  "error": "Per-minute rate limit exceeded.",
  "limit": 60,
  "scope": "minute",
  "resetSeconds": 37
}
```

`scope` is `"minute"` or `"day"`; `resetSeconds` is seconds until the window resets.

---

## Health

### `GET /health` — no auth

```bash
curl $BASE/health
# { "ok": true, "service": "fofodo", "version": "1.0.0" }
```

---

## Account

### `POST /bootstrap` — create user doc + seed the four hats (idempotent)

Body: `{ "displayName"?: string }`

```bash
curl -X POST $BASE/bootstrap -H "X-API-Key: $KEY" \
  -H 'content-type: application/json' -d '{"displayName":"FoFo"}'
# { "ok": true }
```

---

## Capture

### `POST /capture` — quick-add a task into the inbox

Deterministic NL parse always runs; AI refinement only if the user's `aiEnabled` is on. Falls back to raw text as the title on any failure.

Body: `{ "text": string }`

```bash
curl -X POST $BASE/capture -H "X-API-Key: $KEY" \
  -H 'content-type: application/json' \
  -d '{"text":"call Jamie tomorrow 3pm #grow"}'
# returns the created task object
```

---

## Tasks

### `GET /tasks` — list by view

Query params: `view` (`today`|`active`|`next`|`inbox`|`done`|`snoozed`|`by_hat`|`by_project`|`all`; default `active`), `hatId`, `projectId`, `limit`.

```bash
curl "$BASE/tasks?view=active" -H "X-API-Key: $KEY"
# { "tasks": [ ... ] }
```

### `POST /tasks` — create a task

Body: `{ "title": string, "notes"?, "hatId"?, "projectId"?, "status"?, "due"? }`. `status: "active"` is coerced to `next` (activation goes through `/activate`).

```bash
curl -X POST $BASE/tasks -H "X-API-Key: $KEY" -H 'content-type: application/json' \
  -d '{"title":"Draft the v1 changelog","hatId":"build"}'
```

### `GET /tasks/:id` — fetch one (`404` if missing)

```bash
curl $BASE/tasks/abc123 -H "X-API-Key: $KEY"
```

### `PATCH /tasks/:id` — update fields

Body (all optional): `title`, `notes`, `hatId`, `projectId`, `due`, `order`, `status`. **`status: "active"` is rejected** — use `/activate`.

```bash
curl -X PATCH $BASE/tasks/abc123 -H "X-API-Key: $KEY" -H 'content-type: application/json' \
  -d '{"notes":"blocked on design","status":"next"}'
```

### `POST /tasks/:id/complete` — mark done (`404` if missing)

```bash
curl -X POST $BASE/tasks/abc123/complete -H "X-API-Key: $KEY"
```

### `POST /tasks/:id/activate` — commit to active (WIP-3 enforced)

Body: `{ "bumpTaskId"?: string }`. Returns `{ id, status: "active", activeCount, bumped? }`, or **`409 wip3_limit`** (see above).

```bash
# first attempt
curl -X POST $BASE/tasks/abc123/activate -H "X-API-Key: $KEY"

# if 409, swap one of the returned active tasks:
curl -X POST $BASE/tasks/abc123/activate -H "X-API-Key: $KEY" \
  -H 'content-type: application/json' -d '{"bumpTaskId":"def456"}'
```

### `POST /tasks/:id/snooze` — snooze with optional wake time (`404` if missing)

Body: `{ "until"?: number }` (epoch ms). Wakes to `next` on/after `until`; increments the avoidance `pushCount`.

```bash
curl -X POST $BASE/tasks/abc123/snooze -H "X-API-Key: $KEY" \
  -H 'content-type: application/json' -d '{"until":1924992000000}'
```

### `DELETE /tasks/:id` — delete

```bash
curl -X DELETE $BASE/tasks/abc123 -H "X-API-Key: $KEY"
# { "id": "abc123", "deleted": true }
```

---

## Projects

### `GET /projects` — list

```bash
curl $BASE/projects -H "X-API-Key: $KEY"   # { "projects": [ ... ] }
```

### `POST /projects` — create

Body: `{ "name": string, "hatId"?, "notes"? }`

```bash
curl -X POST $BASE/projects -H "X-API-Key: $KEY" -H 'content-type: application/json' \
  -d '{"name":"FoFoDo v1","hatId":"build"}'
```

### `PATCH /projects/:id` — update

Body (all optional): `name`, `hatId`, `status` (`active`|`paused`|`snoozed`), `notes`. Pausing hides its tasks from default views.

```bash
curl -X PATCH $BASE/projects/p1 -H "X-API-Key: $KEY" -H 'content-type: application/json' \
  -d '{"status":"paused"}'
```

### `POST /projects/:id/active-bet` — set as the single Active Bet

Body: `{ "leadingIndicator"?: string|null }`. Clears the flag on all other projects.

```bash
curl -X POST $BASE/projects/p1/active-bet -H "X-API-Key: $KEY" \
  -H 'content-type: application/json' -d '{"leadingIndicator":"10 signups/week"}'
```

---

## Hats

### `GET /hats` — list the four hats

```bash
curl $BASE/hats -H "X-API-Key: $KEY"   # { "hats": [ {id,key,name,order}, ... ] }
```

### `PATCH /hats/:id` — rename a hat (rename only; the four slots are fixed)

Body: `{ "name": string }`

```bash
curl -X PATCH $BASE/hats/build -H "X-API-Key: $KEY" \
  -H 'content-type: application/json' -d '{"name":"Make"}'
```

---

## Dashboard & avoidance

### `GET /dashboard` — the four-tile home dashboard

Returns `{ activeBet, yourThree, hatBalance, needsAttention }`.

```bash
curl $BASE/dashboard -H "X-API-Key: $KEY"
```

### `GET /avoidance` — weekly avoidance audit

Deterministic stats always render; an AI prose `summary` is added only when AI is enabled (else `null`).

```bash
curl $BASE/avoidance -H "X-API-Key: $KEY"
# { "perHat": {...}, "quietHats": [...], "pausedLongest": ..., "mostPushed": ..., "summary": null }
```

---

## Search

### `GET /search` — substring search over tasks + projects

Query params: `q` (required), `limit` (default 25).

```bash
curl "$BASE/search?q=webhook" -H "X-API-Key: $KEY"
# { "tasks": [...], "projects": [...] }
```

> The first-party PWA does fuzzy search client-side with Fuse.js over the offline cache; this endpoint is a basic server-side substring search for API/MCP callers.

---

## Reminders

### `GET /reminders` — list (ordered by fire time)

```bash
curl $BASE/reminders -H "X-API-Key: $KEY"   # { "reminders": [ ... ] }
```

### `POST /reminders` — attach a reminder to a task

Body: `{ "taskId": string, "fireAt": number, "channels"?: ["push"|"webhook"], "webhookUrl"?: string|null, "webhookSecret"?: string|null }`. `channels` defaults to `["push"]`; unknown channels are dropped. When a `webhookSecret` is set, the dispatched webhook is signed `x-fofodo-signature: sha256=<hmac>`.

```bash
curl -X POST $BASE/reminders -H "X-API-Key: $KEY" -H 'content-type: application/json' \
  -d '{"taskId":"abc123","fireAt":1924992000000,"channels":["push","webhook"],
       "webhookUrl":"https://example.com/hook","webhookSecret":"s3cr3t"}'
```

---

## AI (all optional)

Each returns `{ aiDisabled: true }` (with null payload) when the user's `aiEnabled` is off.

### `POST /ai/triage` — suggest a hat for a task

Body: `{ "title": string, "notes"? }` → `{ "suggestion": { hat, reason } | null }`

### `POST /ai/what-now` — pick one of your active tasks to do now

Body: `{ "energy"? }` → `{ "pick": { id, why } | null }`. Deterministic fallback returns the first active task.

### `POST /ai/breakdown` — break a task into next-actions

Body: `{ "title": string, "notes"? }` → `{ "steps": string[] | null }`

```bash
curl -X POST $BASE/ai/what-now -H "X-API-Key: $KEY" \
  -H 'content-type: application/json' -d '{"energy":"low, 20 min"}'
```

---

## Settings

### `GET /settings`

```bash
curl $BASE/settings -H "X-API-Key: $KEY"
# { "aiEnabled": false, "cadencePrompts": true, "theme": "dark" }
```

### `PATCH /settings` — update any of `aiEnabled`, `cadencePrompts`, `theme`

```bash
curl -X PATCH $BASE/settings -H "X-API-Key: $KEY" \
  -H 'content-type: application/json' -d '{"aiEnabled":true}'
```

---

## API keys

### `GET /keys` — list (never returns the hash)

```bash
curl $BASE/keys -H "X-API-Key: $KEY"   # { "keys": [ {id,name,prefix,createdAt,lastUsedAt,revoked} ] }
```

### `POST /keys` — create a key (**plaintext shown once**)

Body: `{ "name"?: string }` → `{ id, name, prefix, plaintext, createdAt }`.

```bash
curl -X POST $BASE/keys -H "X-API-Key: $KEY" \
  -H 'content-type: application/json' -d '{"name":"laptop cli"}'
# { "id":"k1","name":"laptop cli","prefix":"fofodo_ab12cd34ef56","plaintext":"fofodo_...","createdAt":... }
```

### `DELETE /keys/:id` — revoke a key (immediate)

```bash
curl -X DELETE $BASE/keys/k1 -H "X-API-Key: $KEY"   # { "revoked": true }  (404 -> { "revoked": false })
```

---

## Data ownership

### `GET /export` — full JSON export of the account

Returns `{ exportedAt, version, user, hats, projects, tasks, reminders }`.

```bash
curl $BASE/export -H "X-API-Key: $KEY" > fofodo-export.json
```

### `POST /delete-account` — irreversibly delete all data

Body: `{ "confirm": "DELETE" }` (required, else `400 confirm_required`).

```bash
curl -X POST $BASE/delete-account -H "X-API-Key: $KEY" \
  -H 'content-type: application/json' -d '{"confirm":"DELETE"}'
# { "deleted": true }
```
