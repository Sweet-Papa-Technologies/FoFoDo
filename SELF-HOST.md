# Self-hosting FoFoDo

FoFoDo is open-source-clean: it runs on a **fresh Firebase project** with zero SPT/FFN-specific code. All hosted-only behaviour (FFN sign-in, ads, key quotas) sits behind config flags that default **off**. Target: clone → running personal instance in **well under an hour**.

---

## 1. Prerequisites

- **Node.js 22** (the functions runtime is `nodejs22`).
- **Firebase CLI** — `npm install -g firebase-tools`, then `firebase login`.
- A **Firebase project on the Blaze (pay-as-you-go) plan**. Cloud Functions 2nd gen require Blaze, but FoFoDo scales to zero when idle, so personal use sits comfortably in the free/low tiers.
- (Optional, for AI) **Vertex AI enabled** and the `aiplatform.googleapis.com` API on your project.
- (Optional) **Terraform ≥ 1.5** if you want to provision the data plane declaratively.

Create your project at <https://console.firebase.google.com>, then enable: Firestore, Cloud Functions, Hosting, Authentication (Email/Password + Google), and — if you want AI — Vertex AI.

---

## 2. Point the repo at your project

```bash
git clone <this-repo> fofodo
cd fofodo

firebase use --add        # pick your project; gives it an alias (e.g. "default")
```

This rewrites `.firebaserc`. The shipped `.firebaserc` references the SPT project (`fofoapps-934be`) and a Hosting **target** named `fofodo`. You have two options:

- **Simplest:** delete the `targets` block in `.firebaserc` and remove `"site": "fofodo"` from the `hosting` block in `firebase.json`. Firebase will then deploy to your project's **default** Hosting site. Done.
- **Keep the named site:** create a Hosting site whose id matches, then re-bind the target:
  ```bash
  firebase hosting:sites:create fofodo            # or any site id you like
  firebase target:apply hosting fofodo <your-site-id>
  ```

### Using the default Firestore database (recommended for self-host)

The SPT deployment uses a **named** database (`fofodo`) because it shares a project with other apps. On your own fresh project there's nothing to isolate from, so you can just use the **default** database:

1. Create the default database in the Firebase console (or `gcloud firestore databases create --location=<region>`).
2. Set `FOFODO_DB="(default)"` in `functions/.env` (see below). The code reads `CONFIG.databaseId` from `FOFODO_DB`.
3. Remove `"database": "fofodo"` from the `firestore` block in `firebase.json` so rules/indexes deploy to the default database.

If you *prefer* a named database (e.g. you also share your project), keep `FOFODO_DB=fofodo` and create that named database first (console or Terraform), and leave `firebase.json`'s `firestore.database` as-is.

---

## 3. Configure environment variables

FoFoDo's backend is configured entirely through environment variables read in `functions/src/config.ts` and `functions/src/ai.ts`. Copy the example and edit:

```bash
cp functions/.env.example functions/.env
```

Cloud Functions 2nd gen load `functions/.env` automatically at deploy time. Every variable referenced by the code:

| Variable | Source file | Default | Purpose |
| --- | --- | --- | --- |
| `FOFODO_DB` | config.ts | `fofodo` | Firestore database id. Use `(default)` for the default database. |
| `HOSTED` | config.ts | `false` | Hosted-tier master flag. Leave off for self-host. |
| `ADS_ENABLED` | config.ts | `false` | Render house/ad slots (hosted only). |
| `FFN_AUTH_ENABLED` | config.ts | `false` | FoFo Network sign-in (hosted only; deferred). |
| `QUOTAS_ENABLED` | config.ts | `false` | Per-API-key rate limits + daily caps. Off = unlimited. |
| `QUOTA_PER_MINUTE` | config.ts | `60` | Per-key per-minute cap (only when `QUOTAS_ENABLED`). |
| `QUOTA_PER_DAY` | config.ts | `5000` | Per-key per-day cap (only when `QUOTAS_ENABLED`). |
| `FOFODO_AI_MODEL` | config.ts | `gemini-2.5-flash-lite` | Vertex model id for AI flows. |
| `FOFODO_AI_LOCATION` | config.ts | `us-central1` | Vertex AI region. |
| `FOFODO_AI_GLOBAL_OFF` | ai.ts | _(unset)_ | Set to `1` to force ALL AI off regardless of per-user settings. |

Flags accept `1`/`true` (case-insensitive) for on; anything else is off.

> AI is also gated per-user by `settings.aiEnabled` (default **off**), so even with Vertex configured, no model calls happen until a user opts in. The app is fully functional with AI off.

### `functions/.env.example`

```dotenv
# ---- Firestore -------------------------------------------------------------
# Database id. Use "(default)" to use your project's default database,
# or a named database (e.g. "fofodo") if you created one.
FOFODO_DB=(default)

# ---- Config flags (OSS defaults: all OFF) ----------------------------------
HOSTED=false
ADS_ENABLED=false
FFN_AUTH_ENABLED=false
QUOTAS_ENABLED=false

# ---- Quotas (only used when QUOTAS_ENABLED=true) ---------------------------
QUOTA_PER_MINUTE=60
QUOTA_PER_DAY=5000

# ---- AI (optional; requires Vertex AI enabled on the project) --------------
FOFODO_AI_MODEL=gemini-2.5-flash-lite
FOFODO_AI_LOCATION=us-central1
# Set to 1 to hard-disable ALL AI everywhere (overrides per-user settings):
# FOFODO_AI_GLOBAL_OFF=1
```

---

## 4. Install and deploy

```bash
cd functions && npm install && cd ..
```

Deploy the four pieces. You can do it all at once, or one at a time:

```bash
# Security Rules (per-user isolation + the WIP-3 client gate)
firebase deploy --only firestore:rules

# Composite + collection-group indexes
firebase deploy --only firestore:indexes

# Cloud Functions: fofodoApi, fofodoMcp, fofodoScheduler
#   (the scheduler's Cloud Scheduler job is created automatically)
firebase deploy --only functions

# The PWA (build the Quasar app into app/dist/pwa first)
firebase deploy --only hosting
```

…or everything together:

```bash
firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
```

After deploy your instance is reachable at:

- App + same-origin API/MCP: `https://<your-site>.web.app`
- REST API: `https://<your-site>.web.app/api`
- MCP endpoint: `https://<your-site>.web.app/mcp`

> The `functions` deploy uses the `fofodo` codebase id from `firebase.json` and a `predeploy` step that runs `npm run build`. The frontend `public` dir is `app/dist/pwa` — build the Quasar PWA there before `deploy --only hosting`.

---

## 5. First run

1. Sign in (or, for API-only use, bootstrap via the API).
2. Hit `POST /api/bootstrap` once to create the user doc and seed the four hats. The repo also bootstraps idempotently on first contact.
3. Create an API key (`POST /api/keys`) for scripts / MCP. **The plaintext key is shown once** — store it now.
4. Verify health: `curl https://<your-site>.web.app/api/health` → `{"ok":true,"service":"fofodo","version":"1.0.0"}`.

See **[docs/API.md](./docs/API.md)** and **[docs/MCP.md](./docs/MCP.md)** for usage.

---

## 6. Local development with emulators

`firebase.json` ships an emulator suite (Auth :9099, Functions :5001, Firestore :8080, Hosting :5000, UI on):

```bash
cd functions && npm run build && cd ..
firebase emulators:start
```

---

## 7. The Terraform option (optional)

For a reproducible, declarative data plane, `terraform/` provisions the long-lived infrastructure: API enablement, the Firestore database, the Hosting site, and a web-app registration. It is designed around the SPT shared project but parameterised via `terraform/variables.tf`:

| Variable | Default | Notes |
| --- | --- | --- |
| `project_id` | `fofoapps-934be` | **Change to your project id.** |
| `region` | `us-central1` | Cloud Functions / Vertex region. |
| `firestore_database_id` | `fofodo` | Set to `(default)` to manage the default DB instead. |
| `firestore_location` | `nam5` | Firestore location (multi-region or region). |
| `hosting_site_id` | `fofodo` | Hosting site id → `https://<id>.web.app`. |

```bash
cd terraform
terraform init
terraform apply -var="project_id=YOUR_PROJECT_ID"
```

`disable_on_destroy = false` on the API resources means a `terraform destroy` will not tear down shared GCP APIs. The web-app client config (apiKey, authDomain, appId, etc.) is exposed as an output for the frontend build. After Terraform provisions the data plane, use the **Firebase CLI** (Section 4) to deploy rules, indexes, function code, and hosting content. Terraform is entirely optional — `firebase deploy` alone is enough for a personal instance.
