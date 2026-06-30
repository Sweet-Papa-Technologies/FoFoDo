/**
 * Data-access layer shared by the REST API (api.ts) and the MCP server (mcp.ts)
 * so both honour identical authorization + invariants — no backdoors around the
 * constraints (REQ-MCP-02, G-5). Activation is delegated to wip3.setActive.
 */
import {
  userRef, tasksRef, projectsRef, hatsRef, remindersRef, eventsRef, db, FieldValue,
} from "./firebase";
import { DEFAULT_HATS, DEFAULT_HAT_KEY, CONFIG } from "./config";
import { isValidHat, isValidStatus, TaskStatus } from "./domain";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Create the user doc + seed the four hats on first contact. Idempotent. */
export async function ensureUserBootstrap(uid: string, displayName?: string): Promise<void> {
  const uref = userRef(uid);
  const snap = await uref.get();
  if (!snap.exists) {
    await uref.set({
      displayName: displayName || "",
      plan: CONFIG.HOSTED ? "hosted-free" : "self",
      settings: { aiEnabled: true, cadencePrompts: true, theme: "dark" },
      createdAt: Date.now(),
    });
  }
  const hats = await hatsRef(uid).limit(1).get();
  if (hats.empty) {
    const batch = db.batch();
    for (const h of DEFAULT_HATS) {
      batch.set(hatsRef(uid).doc(h.key), { key: h.key, name: h.name, order: h.order });
    }
    await batch.commit();
  }
}

// ---- Tasks ----------------------------------------------------------------

export interface CreateTaskInput {
  title: string;
  notes?: string;
  hatId?: string;
  projectId?: string | null;
  status?: TaskStatus;
  due?: number | null;
}

export async function createTask(uid: string, input: CreateTaskInput) {
  const hatId = input.hatId && isValidHat(input.hatId) ? input.hatId : DEFAULT_HAT_KEY;
  let status: TaskStatus = input.status && isValidStatus(input.status) ? input.status : "inbox";
  if (status === "active") status = "next"; // activation must go through setActive (WIP-3)
  const now = Date.now();
  const ref = tasksRef(uid).doc();
  const doc = {
    title: String(input.title || "").slice(0, 2000),
    notes: input.notes ? String(input.notes).slice(0, 20000) : "",
    hatId,
    projectId: input.projectId ?? null,
    status,
    due: input.due ?? null,
    snoozeUntil: null,
    order: now,
    pushCount: 0,
    createdAt: now,
    completedAt: null,
  };
  await ref.set(doc);
  await logEvent(uid, "task_created", { taskId: ref.id, hatId, projectId: doc.projectId });
  return { id: ref.id, ...doc };
}

export async function getTask(uid: string, taskId: string) {
  const d = await tasksRef(uid).doc(taskId).get();
  return d.exists ? { id: d.id, ...(d.data() as any) } : null;
}

export interface UpdateTaskInput {
  title?: string;
  notes?: string;
  hatId?: string;
  projectId?: string | null;
  due?: number | null;
  order?: number;
  status?: TaskStatus; // NOTE: cannot set "active" here (use setActive)
}

export async function updateTask(uid: string, taskId: string, input: UpdateTaskInput) {
  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (input.title !== undefined) patch.title = String(input.title).slice(0, 2000);
  if (input.notes !== undefined) patch.notes = String(input.notes).slice(0, 20000);
  if (input.hatId !== undefined && isValidHat(input.hatId)) patch.hatId = input.hatId;
  if (input.projectId !== undefined) patch.projectId = input.projectId;
  if (input.due !== undefined) patch.due = input.due;
  if (input.order !== undefined) patch.order = input.order;
  if (input.status !== undefined) {
    if (input.status === "active") {
      throw new Error("Use set_active to make a task active (WIP-3 enforced).");
    }
    if (isValidStatus(input.status)) patch.status = input.status;
  }
  await tasksRef(uid).doc(taskId).update(patch);
  return getTask(uid, taskId);
}

export async function completeTask(uid: string, taskId: string) {
  const d = await tasksRef(uid).doc(taskId).get();
  if (!d.exists) return null;
  await d.ref.update({ status: "done", completedAt: Date.now(), updatedAt: FieldValue.serverTimestamp() });
  await logEvent(uid, "task_completed", {
    taskId, hatId: d.data()!.hatId ?? null, projectId: d.data()!.projectId ?? null,
  });
  return getTask(uid, taskId);
}

export async function deleteTask(uid: string, taskId: string) {
  await tasksRef(uid).doc(taskId).delete();
  return { id: taskId, deleted: true };
}

/** Snooze: leaves active views, returns to `next` on/after wake date. Bumps the
 * avoidance-audit pushCount (P-3 / REQ-FOS-06). */
export async function snoozeTask(uid: string, taskId: string, until: number | null) {
  const d = await tasksRef(uid).doc(taskId).get();
  if (!d.exists) return null;
  await d.ref.update({
    status: "snoozed",
    snoozeUntil: until ?? null,
    pushCount: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await logEvent(uid, "task_snoozed", { taskId, hatId: d.data()!.hatId ?? null });
  return getTask(uid, taskId);
}

export type View =
  | "today" | "active" | "next" | "inbox" | "done" | "snoozed" | "by_hat" | "by_project" | "all";

export async function listTasks(
  uid: string,
  view: View = "active",
  opts: { hatId?: string; projectId?: string; limit?: number } = {}
) {
  const col = tasksRef(uid);
  const limit = Math.min(opts.limit ?? 200, 500);
  let q: FirebaseFirestore.Query = col;

  switch (view) {
    case "today":
    case "active": q = col.where("status", "==", "active"); break;
    case "next": q = col.where("status", "==", "next"); break;
    case "inbox": q = col.where("status", "==", "inbox"); break;
    case "snoozed": q = col.where("status", "==", "snoozed"); break;
    case "done":
      q = col.where("status", "==", "done").orderBy("completedAt", "desc").limit(limit);
      break;
    case "by_hat":
      if (opts.hatId) q = col.where("hatId", "==", opts.hatId);
      break;
    case "by_project":
      if (opts.projectId) q = col.where("projectId", "==", opts.projectId);
      break;
    case "all": break;
  }

  const snap = await q.limit(limit).get();
  let tasks = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  // Respect paused-project hiding for default views (REQ-TASK-04 AC).
  if (["today", "active", "next", "inbox", "by_hat", "all"].includes(view)) {
    const paused = await pausedProjectIds(uid);
    if (paused.size) tasks = tasks.filter((t) => !t.projectId || !paused.has(t.projectId as string));
  }
  // Stable sort by order for non-done views.
  if (view !== "done") tasks.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  return tasks;
}

async function pausedProjectIds(uid: string): Promise<Set<string>> {
  const snap = await projectsRef(uid).where("status", "==", "paused").get();
  return new Set(snap.docs.map((d) => d.id));
}

// ---- Projects -------------------------------------------------------------

export async function listProjects(uid: string) {
  const snap = await projectsRef(uid).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export async function createProject(uid: string, input: { name: string; hatId?: string; notes?: string }) {
  const hatId = input.hatId && isValidHat(input.hatId) ? input.hatId : DEFAULT_HAT_KEY;
  const ref = projectsRef(uid).doc();
  const doc = {
    name: String(input.name || "Untitled").slice(0, 500),
    hatId, status: "active" as const, isActiveBet: false,
    leadingIndicator: null, notes: input.notes || "", createdAt: Date.now(),
  };
  await ref.set(doc);
  return { id: ref.id, ...doc };
}

export async function updateProject(
  uid: string, projectId: string,
  patch: Partial<{ name: string; hatId: string; status: "active" | "paused" | "snoozed"; notes: string }>
) {
  const clean: Record<string, unknown> = {};
  if (patch.name !== undefined) clean.name = patch.name;
  if (patch.hatId !== undefined && isValidHat(patch.hatId)) clean.hatId = patch.hatId;
  if (patch.status !== undefined) clean.status = patch.status;
  if (patch.notes !== undefined) clean.notes = patch.notes;
  await projectsRef(uid).doc(projectId).update(clean);
  if (patch.status === "active") await logEvent(uid, "project_resumed", { projectId });
  if (patch.status === "paused") await logEvent(uid, "project_paused", { projectId });
  const d = await projectsRef(uid).doc(projectId).get();
  return { id: d.id, ...(d.data() as any) };
}

/** Active Bet: exactly one project flagged, with a free-text leading indicator
 * (REQ-FOS-03). Setting one clears the rest in a single transaction. */
export async function setActiveBet(uid: string, projectId: string, leadingIndicator: string | null) {
  await db.runTransaction(async (t) => {
    const current = await t.get(projectsRef(uid).where("isActiveBet", "==", true));
    current.docs.forEach((d) => {
      if (d.id !== projectId) t.update(d.ref, { isActiveBet: false });
    });
    t.update(projectsRef(uid).doc(projectId), {
      isActiveBet: true, leadingIndicator: leadingIndicator ?? null,
    });
  });
  const d = await projectsRef(uid).doc(projectId).get();
  return { id: d.id, ...(d.data() as any) };
}

// ---- Hats -----------------------------------------------------------------

export async function listHats(uid: string) {
  const snap = await hatsRef(uid).orderBy("order").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

export async function renameHat(uid: string, hatId: string, name: string) {
  await hatsRef(uid).doc(hatId).update({ name: String(name).slice(0, 60) });
  const d = await hatsRef(uid).doc(hatId).get();
  return { id: d.id, ...(d.data() as any) };
}

// ---- Dashboard (REQ-FOS-04) ----------------------------------------------

export async function getDashboard(uid: string) {
  const [projects, active, hatEvents, allOpen] = await Promise.all([
    listProjects(uid),
    listTasks(uid, "active"),
    eventsRef(uid).where("ts", ">=", Date.now() - WEEK_MS).get(),
    tasksRef(uid).where("status", "in", ["inbox", "next", "active", "snoozed"]).get(),
  ]);

  const activeBet = projects.find((p: any) => p.isActiveBet) || null;

  // Hat balance this week: event counts per hat (REQ-FOS-04 tile 3).
  const hatBalance: Record<string, number> = { direction: 0, build: 0, distribution: 0, ops: 0 };
  hatEvents.docs.forEach((d) => {
    const h = d.data().hatId;
    if (h && h in hatBalance) hatBalance[h]++;
  });

  // Needs attention: overdue, aging inbox, and the most-avoided task (REQ-FOS-04 tile 4).
  const now = Date.now();
  const open = allOpen.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const overdue = open.filter((t) => t.due && t.due < now && t.status !== "done").slice(0, 10);
  const aging = open
    .filter((t) => t.status === "inbox" && now - t.createdAt > WEEK_MS)
    .slice(0, 10);
  const mostAvoided = open
    .filter((t) => (t.pushCount || 0) > 0)
    .sort((a, b) => (b.pushCount || 0) - (a.pushCount || 0))[0] || null;

  return {
    activeBet: activeBet
      ? { id: activeBet.id, name: activeBet.name, leadingIndicator: activeBet.leadingIndicator ?? null }
      : null,
    yourThree: active.map((t: any) => ({ id: t.id, title: t.title, hatId: t.hatId })),
    hatBalance,
    needsAttention: {
      overdue: overdue.map((t) => ({ id: t.id, title: t.title, due: t.due })),
      aging: aging.map((t) => ({ id: t.id, title: t.title })),
      mostAvoided: mostAvoided ? { id: mostAvoided.id, title: mostAvoided.title, pushCount: mostAvoided.pushCount } : null,
    },
  };
}

// ---- Avoidance audit stats (REQ-FOS-06 deterministic core) ----------------

export async function avoidanceStats(uid: string) {
  const [projects, events, open] = await Promise.all([
    listProjects(uid),
    eventsRef(uid).where("ts", ">=", Date.now() - WEEK_MS).get(),
    tasksRef(uid).where("status", "in", ["inbox", "next", "snoozed"]).get(),
  ]);
  const perHat: Record<string, number> = { direction: 0, build: 0, distribution: 0, ops: 0 };
  events.docs.forEach((d) => { const h = d.data().hatId; if (h && h in perHat) perHat[h]++; });
  const quietHats = Object.entries(perHat).filter(([, c]) => c === 0).map(([h]) => h);

  const pausedLongest = projects
    .filter((p: any) => p.status === "paused")
    .sort((a: any, b: any) => (a.createdAt || 0) - (b.createdAt || 0))[0] || null;

  const tasks = open.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const mostPushed = tasks
    .filter((t) => (t.pushCount || 0) > 0)
    .sort((a, b) => (b.pushCount || 0) - (a.pushCount || 0))[0] || null;

  return {
    perHat, quietHats,
    pausedLongest: pausedLongest ? { id: pausedLongest.id, name: pausedLongest.name } : null,
    mostPushed: mostPushed ? { id: mostPushed.id, title: mostPushed.title, pushCount: mostPushed.pushCount } : null,
  };
}

// ---- Search (server-side basic; client uses Fuse.js, REQ-SRCH-01) ---------

export async function search(uid: string, query: string, limit = 25) {
  const q = query.trim().toLowerCase();
  if (!q) return { tasks: [], projects: [] };
  const [tsnap, psnap] = await Promise.all([
    tasksRef(uid).limit(500).get(),
    projectsRef(uid).get(),
  ]);
  const tasks = tsnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((t) => `${t.title} ${t.notes || ""}`.toLowerCase().includes(q))
    .slice(0, limit);
  const projects = psnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((p) => `${p.name}`.toLowerCase().includes(q))
    .slice(0, limit);
  return { tasks, projects };
}

// ---- Reminders (REQ-REM) --------------------------------------------------

export async function setReminder(
  uid: string,
  input: { taskId: string; fireAt: number; channels?: string[]; webhookUrl?: string | null; webhookSecret?: string | null }
) {
  const channels = (input.channels && input.channels.length ? input.channels : ["push"]).filter(
    (c) => c === "push" || c === "webhook"
  );
  const ref = remindersRef(uid).doc();
  const doc = {
    taskId: input.taskId,
    fireAt: input.fireAt,
    channels,
    webhookUrl: input.webhookUrl ?? null,
    webhookSecret: input.webhookSecret ?? null,
    fired: false,
    firedAt: null,
    attempts: 0,
    ownerUid: uid,
  };
  await ref.set(doc);
  return { id: ref.id, ...doc };
}

export async function listReminders(uid: string) {
  const snap = await remindersRef(uid).orderBy("fireAt", "asc").get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

// ---- Data ownership (REQ-DATA) -------------------------------------------

export async function exportAll(uid: string) {
  const [tasks, projects, hats, reminders, user] = await Promise.all([
    tasksRef(uid).get(), projectsRef(uid).get(), hatsRef(uid).get(),
    remindersRef(uid).get(), userRef(uid).get(),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    user: user.exists ? { displayName: user.data()!.displayName, settings: user.data()!.settings, plan: user.data()!.plan } : null,
    hats: hats.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
    projects: projects.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
    tasks: tasks.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
    reminders: reminders.docs.map((d) => ({ id: d.id, ...(d.data() as any) })),
  };
}

export async function deleteAllData(uid: string) {
  for (const col of ["tasks", "projects", "hats", "reminders", "events", "apiKeys"]) {
    const snap = await userRef(uid).collection(col).get();
    let batch = db.batch();
    let n = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
    }
    await batch.commit();
  }
  await userRef(uid).delete();
  return { deleted: true };
}

// ---- helpers --------------------------------------------------------------

async function logEvent(uid: string, type: string, extra: Record<string, unknown>) {
  await eventsRef(uid).doc().set({ type, ts: Date.now(), ...extra });
}
