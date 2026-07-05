# FoFoDo — Security Review

> **⚠️ Remediation status (updated 2026-07-01):** Most code/config findings have been
> **fixed in this branch** — see the "Remediation Status" section at the end. The
> two live-GCP IAM findings (#2, #10) and the dependency bump (#4) require operator
> action and were **not** auto-applied (destructive on a shared production project /
> risk of a breaking major upgrade).

**Date:** 2026-06-30
**Reviewer:** Automated security review (Claude)
**Scope:** Frontend (`app/`), backend Cloud Functions (`functions/`), Firebase/GCP configuration (`firestore.rules`, `storage.rules`, `firebase.json`, `terraform/`, `.gitlab-ci.yml`), dependency audit (npm/SCA), and **live GCP configuration** of project `fofoapps-934be`.

> **Project context:** `fofoapps-934be` is a *shared* GCP project that also hosts unrelated apps (council, fofoclip, sense, fofo-buddy). FoFoDo's runtime services are `fofodoapi`, `fofodomcp`, `fofodooauth`, `fofodoscheduler`. Project-level IAM findings below affect FoFoDo even though the offending principals may have been created for other apps.

---

## Executive Summary

The application's **core security architecture is sound**: Firestore/Storage rules enforce strict per-user tenant isolation with a default-deny posture, API keys and OAuth tokens are stored only as SHA-256 hashes, PKCE (S256) is verified, the markdown renderer is sanitized with DOMPurify, and no secrets are committed to the repo (they live in Secret Manager). No cross-tenant data-access (IDOR) path was found through the documented API.

The most important issues to fix are:

1. **SSRF** via unvalidated reminder webhook URLs (backend).
2. A user-managed **Owner service-account key** that exists on the GCP project (full-takeover risk if leaked).
3. **`<iframe>` HTML-injection** allowed through the markdown sanitizer (phishing/clickjacking inside the trusted origin), compounded by the **absence of any CSP / security headers**.

| # | Severity | Area | Finding |
|---|----------|------|---------|
| 1 | **HIGH** | Backend | SSRF via unvalidated reminder `webhookUrl` (server-side `fetch`) |
| 2 | **HIGH** | GCP IAM | `fofoapps-local@` service account has `roles/owner` **and** a downloadable user-managed key |
| 3 | **HIGH** | Frontend | `<iframe>` embedding allowed through markdown sanitizer (no `sandbox`/host allow-list) |
| 4 | **HIGH** | Deps | Production `undici` (via Firebase SDK) carries multiple unpatched CVEs |
| 5 | MEDIUM | Backend | OAuth `/approve` does not re-validate PKCE/params like `/authorize` |
| 6 | MEDIUM | Backend | Unauthenticated, unthrottled OAuth dynamic client registration |
| 7 | MEDIUM | Frontend/Hosting | No Content-Security-Policy or security response headers |
| 8 | MEDIUM | Backend | Comment/attachment URL scheme not validated server-side (stored-XSS feed) |
| 9 | MEDIUM | Firestore rules | No field type/size/shape validation (cost/integrity abuse) |
| 10 | MEDIUM | GCP IAM | Default compute & App Engine SAs hold `roles/editor` |
| 11 | LOW | Backend | Raw internal error messages returned to clients |
| 12 | LOW | Backend | `delete-account` requires no re-auth / step-up |
| 13 | LOW | Backend | Prompt injection into AI flows (advisory output only) |
| 14 | LOW | Storage rules | No `contentType` constraint on uploads |
| 15 | LOW | CI/CD | Deploy uses long-lived `firebase login:ci` token |
| 16 | INFO | GCP | 14 Cloud Run services are publicly invokable (`allUsers`) — auth enforced in-code |

---

## 1. Dependency Audit (SCA)

`npm audit` results:

| Package set | Total | Critical | High | Moderate |
|-------------|-------|----------|------|----------|
| `functions/` | 78 | 1 | 7 | 70 |
| `app/` | 13 | 0 | 2 | 11 |

**Finding #4 — Production `undici` CVEs (HIGH).** Both projects pull a vulnerable `undici` transitively through the Firebase SDK (`@firebase/auth`, `firestore`, `functions`, `storage`). Advisories include HTTP request/response smuggling, Set-Cookie SameSite downgrade, CRLF injection via `upgrade`, unbounded decompression / memory consumption (DoS), and insufficiently-random values. These are reachable in the production functions runtime.

Other notable:
- **HIGH** `@opentelemetry/*` (via genkit) — Prometheus exporter crash via malformed HTTP request.
- **CRITICAL** `vitest` and **HIGH** `vite`/`launch-editor` — **dev-only** (test/build tooling), not shipped to production; lower priority but still patch.

**Remediation:** `npm update` the Firebase SDK to the latest patch line in both `app/` and `functions/` to pull a fixed `undici`; bump `genkit`/OpenTelemetry; update `vite`/`vitest` dev deps. Re-run `npm audit` and wire it into CI (`.gitlab-ci.yml`) as a gate.

---

## 2. Backend — Cloud Functions (`functions/src/`)

Per-user data isolation is fundamentally sound: every repo function is keyed by a `uid` derived from verified credentials, and Firestore paths are always `users/{uid}/...`, so a task ID from user B simply doesn't exist under user A. No cross-tenant IDOR was found.

### Finding #1 — SSRF via reminder webhook (HIGH) — *confirmed*
- **Where:** `repo.ts:388-409` (`setReminder` stores `webhookUrl` with no validation) → `reminders.ts:102-117` (`dispatchWebhook` does `fetch(url, {method:"POST", ...})`).
- **Defect:** A fully user-controlled URL is fetched server-side by the scheduled function — no scheme allow-listing, no private-IP/link-local blocking.
- **Exploit:** Any authenticated user (`POST /reminders` or MCP `set_reminder`) sets `webhookUrl: "http://169.254.169.254/..."`, `http://metadata.google.internal/...`, `http://10.x`, or `http://localhost:<port>`. On the next scheduler tick the function POSTs to it — reaching internal services, the metadata endpoint, and acting as a free outbound-request relay; the task title in the POST body is exfiltrated to arbitrary hosts.
- **Fix:** Allow only `https:`; resolve the host and reject RFC1918/loopback/link-local ranges (re-check after DNS to prevent rebinding); optionally an explicit allow-list. Validate at write time in `setReminder` **and** at dispatch time.

### Finding #5 — OAuth `/approve` doesn't re-validate PKCE/params (MEDIUM)
- **Where:** `oauth.ts:123-146`.
- **Defect:** `/oauth/approve` (a POST an attacker can call directly) accepts `code_challenge`/`redirect_uri` from the body but does not re-assert all the checks `/authorize` performs (presence of a valid S256 `code_challenge`, `response_type`, `resource`). The token-exchange PKCE check (`oauth.ts:172`) fails closed for an empty challenge, which mitigates the worst case, but the consent endpoint should not rely on that.
- **Fix:** In `/approve`, reject when `code_challenge` is absent/not valid base64url-S256 and mirror every `/authorize` validation.

### Finding #6 — Open dynamic client registration (MEDIUM)
- **Where:** `oauth.ts:76-105`. `POST /oauth/register` is unauthenticated and unthrottled (RFC 7591 permits open registration, but unbounded here). Anyone can create unlimited `oauth_clients` documents → Firestore storage/cost abuse and an unbounded valid-client set.
- **Fix:** Per-IP rate limit and/or cap stored clients; expire unused clients.

### Finding #8 — Comment/attachment URL scheme not validated (MEDIUM)
- **Where:** `repo.ts:129-145` (`addComment`), `mcp.ts:90-94` (`add_comment`). Comment `body` (markdown) and attachment `url` are stored after length-truncation only; `url` is not constrained to `http(s):`. A `javascript:`/`data:` URL is persisted server-side — the feed for client-side stored XSS (see frontend finding #3).
- **Fix:** Reject non-`http(s)` attachment URLs server-side.

### Finding #11 — Internal error messages leaked (LOW)
- **Where:** `api.ts:251` returns `(err as Error)?.message` in the 500 body; `oauth.ts:224` reflects `error`/`desc`; `reminders.ts:65` stores raw error text. Discloses internal structure/paths. **Fix:** generic client message, log details server-side.

### Finding #12 — `delete-account` has no step-up auth (LOW)
- **Where:** `api.ts:234-237` → `repo.deleteAllData` (`repo.ts:434`). Any valid credential (including a long-lived API key) irreversibly wipes the account with `{confirm:"DELETE"}`. A leaked API key = total data destruction. **Fix:** require recent re-authentication / disallow via API key.

### Finding #13 — Prompt injection into AI flows (LOW)
- **Where:** `ai.ts:110-120` (`aiAskBoard`), `ai.ts:57-64` (`aiParseCapture`). User titles/notes/questions are concatenated into the LLM prompt with no isolation. Output is advisory only (never executed, never mutates data), so real impact is self-inflicted — but the pattern is fragile if AI output ever drives actions. **Fix:** delimit/quote untrusted content; never let AI output drive privileged actions without re-validation.

### Verified OK (positives)
- **API keys:** 192-bit CSPRNG, stored as SHA-256 only, constant-time `timingSafeEqual` compare (`apikeys.ts:24-90`).
- **OAuth:** opaque + hashed tokens, single-use codes, refresh rotation, PKCE-S256 verified, audience binding, `redirect_uri` restricted to https/localhost at registration (open-redirect protection present) (`oauth.ts`).
- **MCP:** every tool runs under `buildServer(uid)` with `uid` from verified credentials; no tool accepts a `uid` argument → no act-as-arbitrary-user (`mcp.ts:117-147`).
- **Quota/WIP-3:** enforced server-side via Firestore transactions (`wip3.ts`, `auth.ts:69-96`).
- **Mass assignment:** explicit field allow-lists on updates; `status:"active"` blocked from the update path (`repo.ts:89-104`).

---

## 3. Frontend — Vue 3 / Quasar / Vite (`app/`)

### Finding #3 — `<iframe>` HTML-injection via markdown (HIGH) — *empirically verified*
- **Where:** `markdown.ts:11-12, 25-29` (rendered at `TaskDetail.vue:59,74` and `Board.vue:83`).
- **Defect:** `renderMarkdown` adds `iframe` to DOMPurify `ADD_TAGS` and `src`/`allow`/`allowfullscreen`/`frameborder` to `ADD_ATTR`, with **no `sandbox` attribute and no iframe host allow-list**. Any `https:`/protocol-relative `<iframe>` in user-controlled notes/comments survives sanitization. (Verified: `javascript:`, `data:text/html`, `srcdoc`, and event-handler payloads *are* stripped — so this is not direct script execution.)
- **Exploit:** An attacker who can write content another user views (shared task, AI-rendered output, or future multi-user/MCP-agent write path) embeds a full-page `<iframe src="https://attacker/fake-login">` framed inside the trusted `fofodo` origin → credential phishing / clickjacking with a working scripted page. `notes` and `comments.body` are free-form (`store.ts:142` stores `body.slice(0,20000)` verbatim).
- **Fix:** Remove `iframe` from `ADD_TAGS` (or restrict to a host allow-list and add `sandbox`), and add a CSP `frame-src`.

### Finding #7 — No CSP / security headers (MEDIUM) — *frontend + hosting*
- **Where:** `app/index.html` (no CSP meta), `firebase.json:35-40` (only `Cache-Control` on the service worker). No `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, or `Permissions-Policy`.
- **Impact:** No defense-in-depth for finding #3 — a single sanitizer bypass becomes full XSS uncontained. App is clickjackable (no `frame-ancestors`). Impact is amplified because the Firebase Auth SDK stores ID/refresh tokens in JS-readable IndexedDB, and the app mints REST/MCP API keys (`Settings.vue:128`, `ConnectModal.vue:101`) — XSS → token/key theft.
- **Fix:** Serve a CSP (`script-src 'self'`, restricted `frame-src`, `frame-ancestors 'none'`) plus the standard hardening headers via `firebase.json` hosting `headers`.

### Verified OK (positives)
- DOMPurify correctly wired; strips `javascript:`, event handlers, `srcdoc`, `data:text/html`, SVG vectors. Link hook adds `target=_blank` + `rel="noopener noreferrer nofollow"` (`markdown.ts:15-20`).
- No secrets in source beyond the public Firebase web `apiKey`. Server-minted API keys shown once, not stored in source.
- Tokens managed by Firebase SDK; fresh `getIdToken()` Bearer per request (`api.ts:11-16`); no hand-rolled localStorage tokens.
- Routing is *not* used as a security boundary — real boundary is Firestore rules; client correctly defers (`store.ts:58-60`).
- No `window.open`/`postMessage`/user-driven `location` redirect. Attachment links use `rel="noopener"`.
- **Service worker:** prior `/oauth` SW-hijack bug is addressed — `vite.config.ts:43-53` sets `navigateFallbackDenylist` for `/api`, `/mcp`, `/oauth`, `/.well-known` and `NetworkOnly` for `/api/`. No custom SW left in `public/`.

### Finding (LOW)
Client-set comment `author:"you"` (`store.ts:142`) is cosmetic/trusted client-side — do not rely on it as an integrity signal in any future shared-task feature.

---

## 4. Firebase / GCP Configuration (static)

### Positives (well-implemented)
- **Firestore per-user isolation correct.** `isOwner(uid)` = `signedIn() && request.auth.uid == uid` (`firestore.rules:21-23`) gates every user collection. No cross-tenant access.
- **Default-deny.** No `allow ...: if true`. `usage` and `apiKeys` are `if false` (server-only); Storage has explicit catch-all deny (`storage.rules:15-17`).
- **WIP-3 client gate sound** (`firestore.rules:44-48`); hard cap enforced server-side.
- **`events` append-only** (`update,delete: if false`).
- **Storage** owner-scoped with 25 MB cap, private bucket, UBLA on, CORS scoped to app origins (`terraform/main.tf:108-123`).
- **No over-privileged IAM or SA keys created in Terraform**; `disable_on_destroy=false`.
- **Secrets hygiene:** `.gitignore` covers `.env*` and Terraform state; `git ls-files` shows no committed `.env`/SA-JSON/keys (only `functions/.env.example`).

### Finding #9 — No field validation in Firestore rules (MEDIUM)
`firestore.rules:25-65` authorizes by ownership only — no field type/size/shape checks. An authenticated owner (or compromised client token) can write arbitrarily large/malformed docs into their own subtree (oversized markdown → storage/read-cost abuse; unexpected types that could break Admin-SDK/scheduler logic). Self-scoped, but a real cost/integrity gap. **Fix:** add `request.resource.data` type/size/key validation on writes.

### Finding #14 — Storage uploads have no contentType constraint (LOW)
`storage.rules:11-13` gates on auth/owner/size only. A user can upload arbitrary file types (HTML/SVG/executables) into `uploads/{uid}/` up to 25 MB with no object-count quota. Served from the bucket origin via tokenized URLs (limited app-XSS risk) but enables arbitrary-content hosting / cost abuse. **Fix:** constrain `request.resource.contentType`; add a per-user quota.

### Finding #15 — CI uses long-lived `firebase login:ci` token (LOW)
`.gitlab-ci.yml:50-51` deploys with `--token "$FIREBASE_TOKEN"` — a long-lived, broadly-scoped, deprecated credential. Mitigated by `when: manual` + default-branch-only (`:43-44`). **Fix:** migrate to Workload Identity Federation / least-privilege service account; ensure the CI variable is **masked + protected** so fork/MR pipelines (which run `npm ci` on untrusted branches) can't exfiltrate it.

---

## 5. Live GCP Audit — project `fofoapps-934be`

Performed with `gcloud` (read-only) against the live project.

### Finding #2 — Owner service account with a downloadable key (HIGH) — *confirmed live*
- `roles/owner` is bound to `serviceAccount:fofoapps-local@fofoapps-934be.iam.gserviceaccount.com` (alongside `user:fterry@sweetpapatechnologies.com`).
- That SA has a **user-managed key** (`1f05203a...`, created **2026-01-02**) — i.e. a downloadable private key exists for a full-Owner principal.
- **Impact:** If that key file leaks (laptop, CI, `.json` in a repo/backup), the holder gets **full project ownership** — read all Firestore data across every app in the shared project, read all Secret Manager secrets, deploy/delete anything.
- **Fix:** Delete the user-managed key; have local dev use ADC / `gcloud auth application-default login` or a least-privilege SA via short-lived impersonation. If the SA must exist, drop it from `roles/owner` to the minimum roles it needs. Add an org policy `constraints/iam.disableServiceAccountKeyCreation`.

### Finding #10 — Default SAs hold `roles/editor` (MEDIUM)
- `roles/editor` is bound to the default compute SA (`851869525836-compute@developer.gserviceaccount.com`), the cloudservices SA, and the App Engine SA (`fofoapps-934be@appspot.gserviceaccount.com`).
- This is the GCP default but is a well-known privilege-escalation surface: any workload running as the default compute SA can edit most project resources. **Fix:** apply `constraints/iam.automaticIamGrantsForDefaultServiceAccounts`, and assign functions/Run least-privilege runtime SAs.

### Finding #16 — Public Cloud Run invokers (INFO)
14 of 17 Cloud Run services allow `allUsers` invoker, including FoFoDo's `fofodoapi`, `fofodomcp`, `fofodooauth` and webhook endpoints (`revenuecatwebhook`, etc.). This is **expected** for a public REST/MCP API and webhooks — authentication is enforced inside the function code (Firebase ID token / hashed API key), not at the IAM layer. **Verify:** every public handler rejects unauthenticated requests, and webhook endpoints (`stripe`, `revenuecat`) verify request signatures. `fofoclip-litellm`, `fofoclip-worker`, `fofodoscheduler` are correctly private.

### Live checks that passed
- **No public buckets.** `fofodo-uploads`, the default `firebasestorage.app` bucket, and `media` have **no** `allUsers`/`allAuthenticatedUsers` IAM bindings.
- **Secrets live in Secret Manager** (e.g. `stripe-secret-key`, `resend-api-key`, `cron-secret`, `*-oauth-secret`) — not in the repo.
- No firewall/VPC ingress resources (serverless-only).

> **Caveat:** No org-level policy was found blocking service-account-key creation or public access (the `org-policies list` query returned nothing for those constraints — either unset or not visible to the auditing principal). Recommend confirming org policies directly.

---

## Remediation Priorities

**Do first (HIGH):**
1. **#1** Add SSRF allow-listing/private-IP blocking to reminder webhooks (`repo.ts`/`reminders.ts`).
2. **#2** Delete the `fofoapps-local@` Owner SA key; remove Owner; enable `disableServiceAccountKeyCreation`.
3. **#3** Remove/sandbox `<iframe>` in `markdown.ts`; **#7** add a CSP (these compound).
4. **#4** Update Firebase SDK in both projects to pull a patched `undici`; add `npm audit` to CI.

**Next (MEDIUM):**
5. **#5** Harden OAuth `/approve`; **#6** rate-limit dynamic client registration.
6. **#8** Validate attachment URL schemes server-side.
7. **#9** Add field validation to Firestore rules; **#10** drop Editor from default SAs.

**Then (LOW / hygiene):**
8. **#11** Stop leaking raw errors; **#12** step-up auth for account deletion; **#14** Storage contentType + quota; **#15** migrate CI to WIF; **#16** confirm webhook signature verification.

---

## Remediation Status (2026-07-01)

Fixes applied in this branch. Verified by: `functions` vitest suite (**80/80 pass**,
incl. new `net-guard.test.ts`), `functions` `tsc --noEmit` (clean), frontend
`vue-tsc` + `vite build` (clean), and a browser smoke test of the built PWA served
through Firebase Hosting confirming the new CSP produces **zero console violations**
and the login UI renders (Firebase init, fonts, and bundle all load).

| # | Finding | Status | What changed |
|---|---------|--------|--------------|
| 1 | SSRF via reminder webhook | ✅ Fixed | New `functions/src/net-guard.ts`: https-only + block private/loopback/link-local + IPv4-mapped IPv6; validated write-time in `repo.setReminder` and dispatch-time (with DNS resolution, anti-rebinding) in `reminders.dispatchWebhook`. New `ValidationError` → HTTP 400 / MCP error. |
| 3 | `<iframe>` in markdown | ✅ Fixed | Removed `iframe` + iframe attrs from the DOMPurify allowlist in `app/src/markdown.ts` (video/audio embedding retained). |
| 5 | OAuth `/approve` PKCE | ✅ Fixed | `/oauth/approve` now independently requires a valid S256 `code_challenge` (43-char base64url). |
| 6 | Open registration flood | ✅ Fixed | Per-IP rate limit (20/hour, Firestore-backed) on `/oauth/register` → 429. |
| 7 | Missing CSP / headers | ✅ Fixed | `firebase.json` hosting now sets CSP, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS. CSP allowlist covers Firebase Auth/Firestore/Storage + Google Fonts; browser-verified (0 violations). |
| 8 | Attachment URL scheme | ✅ Fixed | `repo.addComment` now drops any non-`http(s)` attachment URL. |
| 11 | Error message leakage | ✅ Fixed | `api.ts` 500 handler returns a generic message; detail logged server-side only. |
| 14 | Storage contentType | ✅ Fixed | `storage.rules` now constrains uploads to image/video/audio/text/pdf and rejects SVG. |
| 2 | Owner SA downloadable key | ⚠️ **Operator action** | Requires deleting a key / removing `roles/owner` on a live shared prod project — destructive, not auto-applied. Recommended: delete key `1f05203a…`, drop Owner→least-privilege, enable `iam.disableServiceAccountKeyCreation`. |
| 10 | Default SAs = Editor | ⚠️ **Operator action** | Org/IAM change on shared project. Recommended: `automaticIamGrantsForDefaultServiceAccounts` policy + per-service runtime SAs. |
| 4 | `undici` CVEs (transitive) | ⚠️ **Operator action** | Fix requires a Firebase SDK major bump (potential breaking change) in `app/` + `functions/`; not applied to avoid destabilizing the build. Run `npm update firebase` + retest, then add `npm audit` to CI. |
| 9,12,13,15,16 | Rules field-validation, delete-account step-up, prompt-injection hardening, CI WIF, webhook sig verification | ⏳ Deferred | Lower-severity / larger-scope hardening; tracked for a follow-up. |

> **CSP caveat:** the initial load, Firebase init, Firestore connect, fonts, and
> bundle were browser-verified against the new CSP. The interactive Google
> sign-in **popup** flow could not be exercised without live credentials; the
> policy already allowlists `accounts.google.com`, `apis.google.com`, and the
> `*.firebaseapp.com` auth domain, but confirm a real Google sign-in after deploy.

---

*Methodology: SCA via `npm audit`; manual SAST-style code review of backend, frontend, and IaC; static review of Firestore/Storage rules and Terraform; live read-only `gcloud` audit of IAM, buckets, Cloud Run invokers, and Secret Manager. Dynamic/runtime testing of deployed endpoints was out of scope.*
