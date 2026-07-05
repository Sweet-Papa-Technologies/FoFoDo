/**
 * MCP OAuth 2.1 authorization server (REQ-MCP-03, extended).
 *
 * FoFoDo acts as BOTH the MCP resource server and its own OAuth authorization
 * server (allowed by the MCP auth spec, 2025-06-18). This gives MCP clients
 * (Claude, etc.) a "just approve in a screen" connect flow instead of pasting an
 * API key:
 *
 *   1. Client hits /mcp with no token → 401 + WWW-Authenticate pointing at
 *      /.well-known/oauth-protected-resource.
 *   2. Client reads protected-resource metadata → authorization server = us.
 *   3. Client reads /.well-known/oauth-authorization-server, dynamically
 *      registers (POST /oauth/register), then opens /oauth/authorize in a browser.
 *   4. Our consent screen signs the user in with Firebase and they click Approve.
 *   5. We mint a PKCE auth code → client exchanges it at /oauth/token for a
 *      Bearer access token bound to that user (and to the /mcp audience).
 *   6. Client calls /mcp with the Bearer token; mcp.ts resolves it to the uid.
 *
 * Implements: RFC 9728 (protected resource metadata), RFC 8414 (AS metadata),
 * RFC 7591 (dynamic client registration), OAuth 2.1 auth-code + PKCE (S256),
 * RFC 8707 (resource indicator / audience binding), refresh-token rotation.
 *
 * Tokens are opaque random strings; only their SHA-256 hash is stored (G-5).
 */
import express, { Request, Response } from "express";
import cors from "cors";
import { createHash, randomBytes } from "crypto";
import { getAuth } from "firebase-admin/auth";
import { db, FieldValue } from "./firebase";
import { firebaseWebConfig } from "./webconfig";

const ORIGIN = process.env.FOFODO_PUBLIC_ORIGIN || "https://fofodo.web.app";
const MCP_RESOURCE = `${ORIGIN}/mcp`;
const ACCESS_TTL = 3600; // 1h
const REFRESH_TTL = 30 * 24 * 3600; // 30d
const CODE_TTL = 600; // 10m

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const b64urlFromHex = (hex: string) => Buffer.from(hex, "hex").toString("base64url");
const token = (bytes = 32) => randomBytes(bytes).toString("base64url");

export const oauthApp = express();
oauthApp.use(cors({ origin: true }));
oauthApp.use(express.json());
oauthApp.use(express.urlencoded({ extended: true }));

// ---- Discovery metadata (RFC 9728 + RFC 8414) -----------------------------
function protectedResourceMetadata(_req: Request, res: Response) {
  res.json({
    resource: MCP_RESOURCE,
    authorization_servers: [ORIGIN],
    bearer_methods_supported: ["header"],
    resource_documentation: `${ORIGIN}/docs`,
  });
}
oauthApp.get("/.well-known/oauth-protected-resource", protectedResourceMetadata);
oauthApp.get("/.well-known/oauth-protected-resource/mcp", protectedResourceMetadata);

function asMetadata(_req: Request, res: Response) {
  res.json({
    issuer: ORIGIN,
    authorization_endpoint: `${ORIGIN}/oauth/authorize`,
    token_endpoint: `${ORIGIN}/oauth/token`,
    registration_endpoint: `${ORIGIN}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp"],
  });
}
oauthApp.get("/.well-known/oauth-authorization-server", asMetadata);
oauthApp.get("/.well-known/oauth-authorization-server/mcp", asMetadata);

// Per-IP rate limit for the (unauthenticated) registration endpoint so it can't
// be used to flood Firestore with junk oauth_clients docs. Fixed 1h window.
const REG_LIMIT = 20;
const REG_WINDOW_MS = 60 * 60 * 1000;

function clientIp(req: Request): string {
  const xff = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xff || req.ip || req.socket?.remoteAddress || "unknown";
}

/** Returns true if the caller is over the registration cap for the current window. */
async function registrationRateLimited(ip: string): Promise<boolean> {
  const ref = db.collection("oauth_reg_limits").doc(ip.replace(/[^\w.:-]/g, "_").slice(0, 200));
  return db.runTransaction(async (t) => {
    const now = Date.now();
    const snap = await t.get(ref);
    const d = snap.exists ? snap.data()! : null;
    if (!d || now - (d.windowStart || 0) > REG_WINDOW_MS) {
      t.set(ref, { windowStart: now, count: 1 });
      return false;
    }
    if ((d.count || 0) >= REG_LIMIT) return true;
    t.update(ref, { count: FieldValue.increment(1) });
    return false;
  });
}

// ---- Dynamic Client Registration (RFC 7591) -------------------------------
oauthApp.post("/oauth/register", async (req: Request, res: Response) => {
  if (await registrationRateLimited(clientIp(req))) {
    return res.status(429).json({ error: "rate_limited", error_description: "too many registrations, try again later" });
  }
  const redirectUris: string[] = req.body?.redirect_uris || [];
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return res.status(400).json({ error: "invalid_redirect_uri", error_description: "redirect_uris required" });
  }
  // Open-redirect protection: only localhost or https (per spec).
  for (const u of redirectUris) {
    try {
      const url = new URL(u);
      const ok = url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1";
      if (!ok) throw new Error("bad");
    } catch {
      return res.status(400).json({ error: "invalid_redirect_uri", error_description: `disallowed redirect_uri: ${u}` });
    }
  }
  const clientId = token(16);
  await db.collection("oauth_clients").doc(clientId).set({
    redirectUris,
    clientName: String(req.body?.client_name || "MCP client").slice(0, 120),
    createdAt: Date.now(),
  });
  res.status(201).json({
    client_id: clientId,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    client_id_issued_at: Math.floor(Date.now() / 1000),
  });
});

// ---- Authorize (consent screen) -------------------------------------------
oauthApp.get("/oauth/authorize", async (req: Request, res: Response) => {
  const q = req.query as Record<string, string>;
  if (q.response_type !== "code") return sendError(res, "unsupported_response_type");
  if (q.code_challenge_method && q.code_challenge_method !== "S256") return sendError(res, "invalid_request", "PKCE S256 required");
  if (!q.client_id || !q.redirect_uri || !q.code_challenge) return sendError(res, "invalid_request", "missing client_id/redirect_uri/code_challenge");

  const client = await db.collection("oauth_clients").doc(q.client_id).get();
  if (!client.exists) return sendError(res, "unauthorized_client", "unknown client_id");
  const uris: string[] = client.data()!.redirectUris || [];
  if (!uris.includes(q.redirect_uri)) return sendError(res, "invalid_request", "redirect_uri not registered");

  res.set("content-type", "text/html; charset=utf-8").send(consentPage(q, client.data()!.clientName));
});

// ---- Approve (called by the consent screen with a Firebase ID token) ------
oauthApp.post("/oauth/approve", async (req: Request, res: Response) => {
  const { idToken, client_id, redirect_uri, code_challenge, state, scope, resource } = req.body || {};
  if (!idToken) return res.status(401).json({ error: "login_required" });
  // Re-assert PKCE here, not just on the /authorize GET: /approve is a separate
  // POST a client can call directly, so it must independently require a valid
  // S256 challenge (a base64url SHA-256 digest, 43 chars). Without this a caller
  // could try to obtain a code with no/weak PKCE binding.
  if (typeof code_challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(code_challenge)) {
    return res.status(400).json({ error: "invalid_request", error_description: "valid S256 code_challenge required" });
  }
  let uid: string;
  try {
    uid = (await getAuth().verifyIdToken(idToken)).uid;
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
  const client = await db.collection("oauth_clients").doc(client_id).get();
  if (!client.exists || !(client.data()!.redirectUris || []).includes(redirect_uri)) {
    return res.status(400).json({ error: "invalid_request" });
  }
  const code = token(24);
  await db.collection("oauth_codes").doc(sha256(code)).set({
    clientId: client_id, uid, codeChallenge: code_challenge, redirectUri: redirect_uri,
    resource: resource || MCP_RESOURCE, scope: scope || "mcp",
    expiresAt: Date.now() + CODE_TTL * 1000,
  });
  const url = new URL(redirect_uri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  res.json({ redirect: url.toString() });
});

// ---- Token endpoint -------------------------------------------------------
oauthApp.post("/oauth/token", async (req: Request, res: Response) => {
  const grant = req.body?.grant_type;
  try {
    if (grant === "authorization_code") return await handleAuthCode(req, res);
    if (grant === "refresh_token") return await handleRefresh(req, res);
    return res.status(400).json({ error: "unsupported_grant_type" });
  } catch (e) {
    console.error("token error", e);
    return res.status(400).json({ error: "invalid_grant" });
  }
});

async function handleAuthCode(req: Request, res: Response) {
  const { code, code_verifier, redirect_uri } = req.body || {};
  if (!code || !code_verifier) return res.status(400).json({ error: "invalid_request" });
  const ref = db.collection("oauth_codes").doc(sha256(code));
  const snap = await ref.get();
  if (!snap.exists) return res.status(400).json({ error: "invalid_grant" });
  const c = snap.data()!;
  await ref.delete(); // single-use
  if (c.expiresAt < Date.now()) return res.status(400).json({ error: "invalid_grant", error_description: "code expired" });
  if (redirect_uri && redirect_uri !== c.redirectUri) return res.status(400).json({ error: "invalid_grant", error_description: "redirect_uri mismatch" });
  // PKCE S256: base64url(sha256(verifier)) === stored challenge
  if (b64urlFromHex(sha256(code_verifier)) !== c.codeChallenge) {
    return res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
  }
  return res.json(await issueTokens(c.uid, c.clientId, c.resource, c.scope));
}

async function handleRefresh(req: Request, res: Response) {
  const { refresh_token } = req.body || {};
  if (!refresh_token) return res.status(400).json({ error: "invalid_request" });
  const ref = db.collection("oauth_tokens").doc(sha256(refresh_token));
  const snap = await ref.get();
  if (!snap.exists || snap.data()!.type !== "refresh") return res.status(400).json({ error: "invalid_grant" });
  const t = snap.data()!;
  if (t.expiresAt < Date.now()) { await ref.delete(); return res.status(400).json({ error: "invalid_grant" }); }
  await ref.delete(); // rotate refresh tokens (public client)
  return res.json(await issueTokens(t.uid, t.clientId, t.audience, t.scope));
}

async function issueTokens(uid: string, clientId: string, audience: string, scope: string) {
  const access = token(32);
  const refresh = token(32);
  const now = Date.now();
  await db.collection("oauth_tokens").doc(sha256(access)).set({
    type: "access", uid, clientId, audience: audience || MCP_RESOURCE, scope: scope || "mcp",
    expiresAt: now + ACCESS_TTL * 1000, createdAt: now,
  });
  await db.collection("oauth_tokens").doc(sha256(refresh)).set({
    type: "refresh", uid, clientId, audience: audience || MCP_RESOURCE, scope: scope || "mcp",
    expiresAt: now + REFRESH_TTL * 1000, createdAt: now,
  });
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL, refresh_token: refresh, scope: scope || "mcp" };
}

/** Resolve a Bearer access token to a uid, validating expiry + audience. Used by
 * the MCP endpoint. Returns null if invalid. */
export async function resolveOAuthToken(accessToken: string): Promise<{ uid: string } | null> {
  if (!accessToken) return null;
  const snap = await db.collection("oauth_tokens").doc(sha256(accessToken)).get();
  if (!snap.exists) return null;
  const t = snap.data()!;
  if (t.type !== "access") return null;
  if (t.expiresAt < Date.now()) return null;
  // Audience binding (RFC 8707): token must be for our MCP resource.
  if (t.audience && t.audience !== MCP_RESOURCE && !String(t.audience).startsWith(ORIGIN)) return null;
  snap.ref.update({ lastUsedAt: Date.now() }).catch(() => undefined);
  return { uid: t.uid };
}

export const wwwAuthenticate = () =>
  `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource"`;

function sendError(res: Response, error: string, desc?: string) {
  return res.status(400).send(`<!doctype html><body style="font-family:sans-serif;background:#1a1613;color:#f4e9df;padding:40px"><h3>Authorization error</h3><p>${error}${desc ? " — " + desc : ""}</p></body>`);
}

// ---- Consent screen HTML --------------------------------------------------
function consentPage(q: Record<string, string>, clientName: string): string {
  const cfg = JSON.stringify(firebaseWebConfig);
  const params = JSON.stringify({
    client_id: q.client_id, redirect_uri: q.redirect_uri, code_challenge: q.code_challenge,
    state: q.state || "", scope: q.scope || "mcp", resource: q.resource || MCP_RESOURCE,
  });
  let clientHost = "the app";
  try { clientHost = new URL(q.redirect_uri).host; } catch { /* keep default */ }
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Connect to FoFoDo</title>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600;700&display=swap" rel="stylesheet"/>
<style>
  body{font-family:'Hanken Grotesk',system-ui,sans-serif;background:#1a1613;color:#f4e9df;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px}
  .card{background:rgba(255,224,196,.05);border:1px solid rgba(255,235,215,.1);border-radius:16px;padding:32px;width:380px;max-width:92vw;text-align:center}
  h1{font-size:26px;margin:0 0 4px}.muted{color:#cdbdae;font-size:14px;margin:0 0 16px;line-height:1.5}
  button{font:inherit;font-weight:600;border:none;border-radius:12px;padding:12px 16px;width:100%;cursor:pointer;margin-top:8px}
  .primary{background:#f0a868;color:#3a2410}.ghost{background:#322820;color:#f4e9df;border:1px solid rgba(255,235,215,.12)}
  a.primary{display:block;text-decoration:none;text-align:center}
  input{font:inherit;width:100%;box-sizing:border-box;padding:11px 12px;margin-top:8px;border-radius:10px;border:1px solid rgba(255,235,215,.15);background:#221d19;color:#f4e9df}
  .scope{background:#221d19;border-radius:10px;padding:12px;text-align:left;font-size:13px;color:#cdbdae;margin:16px 0}
  .err{color:#ff9b86;font-size:13px;min-height:18px;margin-top:8px}
  .or{color:#8a7e70;font-size:12px;margin:14px 0 2px}
  .check{font-size:42px;line-height:1}
</style></head><body>
<div class="card">
  <h1>FoFoDo</h1>
  <p class="muted"><b>${clientName}</b> wants to connect to your FoFoDo tasks.</p>

  <div id="loading">Loading…</div>

  <div id="signin" style="display:none">
    <button class="primary" id="google">Continue with Google</button>
    <div class="or">or sign in with email</div>
    <input id="email" type="email" placeholder="Email" autocomplete="username"/>
    <input id="password" type="password" placeholder="Password" autocomplete="current-password"/>
    <button class="ghost" id="emailbtn">Sign in</button>
  </div>

  <div id="approve" style="display:none">
    <div class="scope">Allow <b>${clientName}</b> to capture, view, update and complete your tasks (always respecting the WIP‑3 limit). You can revoke access any time in FoFoDo → Settings → API keys.</div>
    <p class="muted" id="who"></p>
    <button class="primary" id="allow">Approve &amp; connect</button>
    <button class="ghost" id="deny">Cancel</button>
  </div>

  <div id="done" style="display:none">
    <div class="check">✅</div>
    <p class="muted" id="donemsg">Connected! Returning you to ${clientHost}…</p>
    <a class="primary" id="continue" href="#">Continue to ${clientHost}</a>
  </div>

  <div class="err" id="err"></div>
</div>
<script type="module">
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
  import { getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged,
           GoogleAuthProvider, signInWithRedirect, signInWithPopup, getRedirectResult,
           signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
  const PARAMS = ${params};
  const app = initializeApp(${cfg});
  const auth = getAuth(app);
  const $ = (id) => document.getElementById(id);
  const show = (id) => { ["loading","signin","approve","done"].forEach(x=>$(x).style.display = x===id ? "block":"none"); };
  const err = (m) => { $("err").textContent = m || ""; };

  setPersistence(auth, browserLocalPersistence).catch(()=>{});
  // Complete any redirect-based sign-in that just returned to this page.
  getRedirectResult(auth).catch((e)=>{ if(e&&e.message) err(e.message.replace("Firebase:","")); });

  onAuthStateChanged(auth, (user) => {
    if (user) { $("who").textContent = "Signed in as " + (user.email || "your account"); show("approve"); }
    else show("signin");
  });

  $("google").onclick = async () => {
    err("");
    // Popups are usually blocked inside connector/OAuth browsers — prefer redirect.
    try { await signInWithRedirect(auth, new GoogleAuthProvider()); }
    catch(e){ try { await signInWithPopup(auth, new GoogleAuthProvider()); } catch(e2){ err(e2.message); } }
  };
  $("emailbtn").onclick = async () => {
    err("");
    try { await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value); }
    catch(e){ err((e.message||"Sign-in failed").replace("Firebase:","")); }
  };
  $("email").addEventListener("keyup",(e)=>{ if(e.key==="Enter") $("emailbtn").click(); });
  $("password").addEventListener("keyup",(e)=>{ if(e.key==="Enter") $("emailbtn").click(); });

  $("deny").onclick = () => {
    const u = PARAMS.redirect_uri + "?error=access_denied" + (PARAMS.state ? "&state="+encodeURIComponent(PARAMS.state) : "");
    location.assign(u);
  };

  $("allow").onclick = async () => {
    err(""); $("allow").disabled = true; $("allow").textContent = "Connecting…";
    try {
      const idToken = await auth.currentUser.getIdToken();
      const r = await fetch("/oauth/approve", { method:"POST", headers:{"content-type":"application/json"},
        body: JSON.stringify({ idToken, ...PARAMS }) });
      const data = await r.json();
      if (!data.redirect) { err(data.error || "Could not authorize."); $("allow").disabled=false; $("allow").textContent="Approve & connect"; return; }
      // Show confirmation, set the manual fallback link, and auto-redirect.
      $("continue").setAttribute("href", data.redirect);
      show("done");
      setTimeout(() => { try { location.assign(data.redirect); } catch(_){} }, 600);
    } catch(e) { err(e.message); $("allow").disabled=false; $("allow").textContent="Approve & connect"; }
  };
</script></body></html>`;
}
