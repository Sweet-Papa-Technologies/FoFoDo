/**
 * REST API (REQ-API-01). Documented in docs/API.md + docs/openapi.yaml.
 * Auth: Firebase ID token OR API key, both → the same per-user authorization
 * (REQ-API-02). Mounted behind Hosting at /api for same-origin first-party use;
 * also reachable at the raw function URL for external/programmatic use.
 */
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { authenticate, AuthError, Principal } from "./auth";
import { Wip3Error, NotFoundError, setActive } from "./wip3";
import { aiEnabledFor, aiAvoidanceSummary, aiSuggestTriage, aiWhatNow, aiBreakdown } from "./ai";
import { captureTask } from "./capture";
import { userRef } from "./firebase";
import { createApiKey, listApiKeys, revokeApiKey } from "./apikeys";
import * as repo from "./repo";

export const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));
// Never let the Firebase Hosting CDN cache API responses (avoids stale GETs).
app.use((_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });

// Normalize path whether invoked via Hosting rewrite (/api/...) or directly.
app.use((req, _res, next) => {
  if (req.url === "/api") req.url = "/";
  else if (req.url.startsWith("/api/")) req.url = req.url.slice(4);
  next();
});

interface AuthedRequest extends Request {
  principal: Principal;
}

const wrap =
  (fn: (req: AuthedRequest, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const principal = await authenticate(req);
      (req as AuthedRequest).principal = principal;
      await fn(req as AuthedRequest, res);
    } catch (e) {
      next(e);
    }
  };

async function userSettings(uid: string) {
  const snap = await userRef(uid).get();
  return (snap.exists ? snap.data()!.settings : undefined) as { aiEnabled?: boolean } | undefined;
}

// ---- health (no auth) -----------------------------------------------------
app.get(["/health", "/api/health"], (_req, res) => res.json({ ok: true, service: "fofodo", version: "1.0.0" }));

// ---- account bootstrap ----------------------------------------------------
app.post("/bootstrap", wrap(async (req, res) => {
  await repo.ensureUserBootstrap(req.principal.uid, req.body?.displayName);
  res.json({ ok: true });
}));

// ---- capture --------------------------------------------------------------
app.post("/capture", wrap(async (req, res) => {
  const settings = await userSettings(req.principal.uid);
  const task = await captureTask(req.principal.uid, String(req.body?.text || ""), {
    aiEnabled: aiEnabledFor(settings),
  });
  res.json(task);
}));

// ---- tasks ----------------------------------------------------------------
app.get("/tasks", wrap(async (req, res) => {
  const view = (req.query.view as repo.View) || "active";
  const tasks = await repo.listTasks(req.principal.uid, view, {
    hatId: req.query.hatId as string,
    projectId: req.query.projectId as string,
    limit: req.query.limit ? Number(req.query.limit) : undefined,
  });
  res.json({ tasks });
}));

app.post("/tasks", wrap(async (req, res) => {
  res.json(await repo.createTask(req.principal.uid, req.body || {}));
}));

app.get("/tasks/:id", wrap(async (req, res) => {
  const t = await repo.getTask(req.principal.uid, req.params.id);
  if (!t) return res.status(404).json({ error: "not_found" });
  res.json(t);
}));

app.patch("/tasks/:id", wrap(async (req, res) => {
  res.json(await repo.updateTask(req.principal.uid, req.params.id, req.body || {}));
}));

app.post("/tasks/:id/complete", wrap(async (req, res) => {
  const t = await repo.completeTask(req.principal.uid, req.params.id);
  if (!t) return res.status(404).json({ error: "not_found" });
  res.json(t);
}));

app.post("/tasks/:id/activate", wrap(async (req, res) => {
  res.json(await setActive(req.principal.uid, req.params.id, req.body?.bumpTaskId || null));
}));

app.post("/tasks/:id/snooze", wrap(async (req, res) => {
  const until = req.body?.until ? Number(req.body.until) : null;
  const t = await repo.snoozeTask(req.principal.uid, req.params.id, until);
  if (!t) return res.status(404).json({ error: "not_found" });
  res.json(t);
}));

app.delete("/tasks/:id", wrap(async (req, res) => {
  res.json(await repo.deleteTask(req.principal.uid, req.params.id));
}));

// ---- comments (markdown + attachments, REQ-TASK-02 extended) --------------
app.get("/tasks/:id/comments", wrap(async (req, res) => {
  res.json({ comments: await repo.listComments(req.principal.uid, req.params.id) });
}));
app.post("/tasks/:id/comments", wrap(async (req, res) => {
  res.json(await repo.addComment(req.principal.uid, req.params.id, req.body?.body || "", req.body?.attachments || []));
}));
app.delete("/tasks/:id/comments/:cid", wrap(async (req, res) => {
  res.json(await repo.deleteComment(req.principal.uid, req.params.id, req.params.cid));
}));

// ---- projects -------------------------------------------------------------
app.get("/projects", wrap(async (req, res) => res.json({ projects: await repo.listProjects(req.principal.uid) })));
app.post("/projects", wrap(async (req, res) => res.json(await repo.createProject(req.principal.uid, req.body || {}))));
app.patch("/projects/:id", wrap(async (req, res) => res.json(await repo.updateProject(req.principal.uid, req.params.id, req.body || {}))));
app.post("/projects/:id/active-bet", wrap(async (req, res) =>
  res.json(await repo.setActiveBet(req.principal.uid, req.params.id, req.body?.leadingIndicator ?? null))
));

// ---- hats -----------------------------------------------------------------
app.get("/hats", wrap(async (req, res) => res.json({ hats: await repo.listHats(req.principal.uid) })));
app.patch("/hats/:id", wrap(async (req, res) => res.json(await repo.renameHat(req.principal.uid, req.params.id, req.body?.name || ""))));

// ---- dashboard / avoidance ------------------------------------------------
app.get("/dashboard", wrap(async (req, res) => res.json(await repo.getDashboard(req.principal.uid))));

app.get("/avoidance", wrap(async (req, res) => {
  const stats = await repo.avoidanceStats(req.principal.uid);
  let summary: string | null = null;
  if (aiEnabledFor(await userSettings(req.principal.uid))) {
    summary = await aiAvoidanceSummary(stats); // null on failure → deterministic-only
  }
  res.json({ ...stats, summary });
}));

// ---- search ---------------------------------------------------------------
app.get("/search", wrap(async (req, res) =>
  res.json(await repo.search(req.principal.uid, String(req.query.q || ""), Number(req.query.limit) || 25))
));

// ---- reminders ------------------------------------------------------------
app.get("/reminders", wrap(async (req, res) => res.json({ reminders: await repo.listReminders(req.principal.uid) })));
app.post("/reminders", wrap(async (req, res) => res.json(await repo.setReminder(req.principal.uid, req.body || {}))));

// ---- AI (all optional; deterministic fallbacks live in callers) -----------
app.post("/ai/triage", wrap(async (req, res) => {
  if (!aiEnabledFor(await userSettings(req.principal.uid))) return res.json({ suggestion: null, aiDisabled: true });
  res.json({ suggestion: await aiSuggestTriage(req.body?.title || "", req.body?.notes) });
}));
app.post("/ai/what-now", wrap(async (req, res) => {
  const active = await repo.listTasks(req.principal.uid, "active");
  const dash = await repo.getDashboard(req.principal.uid);
  if (!aiEnabledFor(await userSettings(req.principal.uid))) {
    // Deterministic fallback: Active-Bet-aligned task, else first active (REQ-AI-04 AC).
    const pick = active[0] || null;
    return res.json({ pick: pick ? { id: (pick as any).id, why: "Aligned with your current focus." } : null, aiDisabled: true });
  }
  const pick = await aiWhatNow({
    now: new Date().toISOString(),
    energy: req.body?.energy,
    activeBet: dash.activeBet?.name ?? null,
    tasks: active.map((t: any) => ({ id: t.id, title: t.title })),
  });
  res.json({ pick: pick || (active[0] ? { id: (active[0] as any).id, why: "Aligned with your current focus." } : null) });
}));
app.post("/ai/breakdown", wrap(async (req, res) => {
  if (!aiEnabledFor(await userSettings(req.principal.uid))) return res.json({ steps: null, aiDisabled: true });
  res.json({ steps: await aiBreakdown(req.body?.title || "", req.body?.notes) });
}));

// ---- settings -------------------------------------------------------------
app.get("/settings", wrap(async (req, res) => {
  const snap = await userRef(req.principal.uid).get();
  res.json(snap.exists ? snap.data()!.settings : { aiEnabled: false, cadencePrompts: true, theme: "dark" });
}));
app.patch("/settings", wrap(async (req, res) => {
  const patch: Record<string, unknown> = {};
  for (const k of ["aiEnabled", "cadencePrompts", "theme"]) {
    if (req.body?.[k] !== undefined) patch[`settings.${k}`] = req.body[k];
  }
  await userRef(req.principal.uid).set({ settings: {} }, { merge: true });
  if (Object.keys(patch).length) await userRef(req.principal.uid).update(patch);
  const snap = await userRef(req.principal.uid).get();
  res.json(snap.data()!.settings);
}));

// ---- API keys -------------------------------------------------------------
app.get("/keys", wrap(async (req, res) => res.json({ keys: await listApiKeys(req.principal.uid) })));
app.post("/keys", wrap(async (req, res) => res.json(await createApiKey(req.principal.uid, req.body?.name || "API key"))));
app.delete("/keys/:id", wrap(async (req, res) => {
  const ok = await revokeApiKey(req.principal.uid, req.params.id);
  res.status(ok ? 200 : 404).json({ revoked: ok });
}));

// ---- data ownership -------------------------------------------------------
app.get("/export", wrap(async (req, res) => res.json(await repo.exportAll(req.principal.uid))));
app.post("/delete-account", wrap(async (req, res) => {
  if (req.body?.confirm !== "DELETE") return res.status(400).json({ error: "confirm_required" });
  res.json(await repo.deleteAllData(req.principal.uid));
}));

// ---- error handler --------------------------------------------------------
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AuthError) return res.status(err.status).json({ error: err.message, ...err.extra });
  if (err instanceof Wip3Error) {
    return res.status(409).json({
      error: "wip3_limit",
      message: "You already have 3 active tasks. Bump one to make room.",
      activeTasks: err.activeTasks,
    });
  }
  if (err instanceof NotFoundError) return res.status(404).json({ error: "not_found", message: String((err as Error).message) });
  console.error("API error:", err);
  res.status(500).json({ error: "internal", message: (err as Error)?.message || "error" });
});
