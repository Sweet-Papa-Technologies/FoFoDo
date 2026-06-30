/**
 * App state. Offline-first: tasks/projects/hats stream from the local Firestore
 * cache via onSnapshot (instant render, NFR-1/NFR-2). Capture/edit/complete/snooze
 * write straight to Firestore (offline-capable). Only WIP-3 activation and other
 * server-gated calls go through the REST API (api.ts).
 */
import { reactive, computed } from "vue";
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc,
  serverTimestamp, increment, query, where,
} from "firebase/firestore";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import Fuse from "fuse.js";
import { auth, db } from "./firebase";
import { api } from "./api";
import { parseCapture } from "./parse";

export interface Task {
  id: string; title: string; notes?: string; hatId: string; projectId?: string | null;
  status: "inbox" | "next" | "active" | "done" | "snoozed";
  due?: number | null; snoozeUntil?: number | null; order: number; pushCount?: number;
  createdAt: number; completedAt?: number | null;
}
export interface Project {
  id: string; name: string; hatId: string; status: "active" | "paused" | "snoozed";
  isActiveBet?: boolean; leadingIndicator?: string | null; notes?: string; createdAt: number;
}
export interface Hat { id: string; key: string; name: string; order: number; }

const WEEK = 7 * 24 * 60 * 60 * 1000;

export const state = reactive({
  user: null as User | null,
  ready: false,
  hats: [] as Hat[],
  projects: [] as Project[],
  tasks: [] as Task[],
  settings: { aiEnabled: false, cadencePrompts: true, theme: "dark" } as Record<string, any>,
  online: navigator.onLine,
});

let unsub: Array<() => void> = [];

window.addEventListener("online", () => (state.online = true));
window.addEventListener("offline", () => (state.online = false));

function tasksCol(uid: string) { return collection(db, "users", uid, "tasks"); }
function projectsCol(uid: string) { return collection(db, "users", uid, "projects"); }
function hatsCol(uid: string) { return collection(db, "users", uid, "hats"); }

export function initAuthWatch() {
  onAuthStateChanged(auth, async (user) => {
    unsub.forEach((u) => u());
    unsub = [];
    state.user = user;
    if (!user) { state.ready = true; state.tasks = []; state.projects = []; state.hats = []; return; }

    // Seed user + hats server-side (idempotent), then stream the data.
    try { await api.bootstrap(); } catch { /* offline: hats may already be cached */ }

    unsub.push(onSnapshot(tasksCol(user.uid), (snap) => {
      state.tasks = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    }));
    unsub.push(onSnapshot(projectsCol(user.uid), (snap) => {
      state.projects = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    }));
    unsub.push(onSnapshot(hatsCol(user.uid), (snap) => {
      state.hats = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).sort((a, b) => a.order - b.order);
    }));
    unsub.push(onSnapshot(doc(db, "users", user.uid), (snap) => {
      const s = snap.data()?.settings;
      if (s) state.settings = { ...state.settings, ...s };
      applyTheme(state.settings.theme);
    }));
    state.ready = true;
  });
}

export const hatName = (key: string) => state.hats.find((h) => h.key === key)?.name || key;

// ---- Capture (offline-capable) -------------------------------------------
export async function capture(text: string): Promise<void> {
  if (!state.user || !text.trim()) return;
  const p = parseCapture(text);
  let projectId: string | null = null;
  if (p.projectHint) {
    const hit = state.projects.find((x) => x.name.toLowerCase() === p.projectHint!.toLowerCase());
    if (hit) projectId = hit.id;
  }
  await addDoc(tasksCol(state.user.uid), {
    title: p.title, notes: "", hatId: p.hatId, projectId,
    status: "inbox", due: p.due, snoozeUntil: null,
    order: Date.now(), pushCount: 0, createdAt: Date.now(), completedAt: null,
  });
}

// ---- Task mutations -------------------------------------------------------
const tref = (id: string) => doc(db, "users", state.user!.uid, "tasks", id);

export const updateTask = (id: string, patch: Partial<Task>) => updateDoc(tref(id), patch as any);
export const completeTask = (id: string) =>
  updateDoc(tref(id), { status: "done", completedAt: Date.now() });
export const uncompleteTask = (id: string) =>
  updateDoc(tref(id), { status: "next", completedAt: null });
export const deleteTask = (id: string) => deleteDoc(tref(id));
export const snoozeTask = (id: string, until: number | null) =>
  updateDoc(tref(id), { status: "snoozed", snoozeUntil: until, pushCount: increment(1) });
export const unsnoozeTask = (id: string) =>
  updateDoc(tref(id), { status: "next", snoozeUntil: null });

/** WIP-3 activation goes through the server gate. Returns {ok} or {wip3, activeTasks}. */
export async function activate(id: string, bumpTaskId?: string | null): Promise<{ ok: true } | { wip3: true; activeTasks: any[] }> {
  try {
    await api.activate(id, bumpTaskId);
    return { ok: true };
  } catch (e: any) {
    if (e?.status === 409 && e.body?.error === "wip3_limit") {
      return { wip3: true, activeTasks: e.body.activeTasks || [] };
    }
    throw e;
  }
}

// ---- Projects -------------------------------------------------------------
export const createProject = (name: string, hatId: string) =>
  addDoc(projectsCol(state.user!.uid), {
    name, hatId, status: "active", isActiveBet: false, leadingIndicator: null, notes: "", createdAt: Date.now(),
  });
export const setProjectStatus = (id: string, status: Project["status"]) =>
  updateDoc(doc(db, "users", state.user!.uid, "projects", id), { status });
export const renameProject = (id: string, name: string) =>
  updateDoc(doc(db, "users", state.user!.uid, "projects", id), { name });
export const setProjectHat = (id: string, hatId: string) =>
  updateDoc(doc(db, "users", state.user!.uid, "projects", id), { hatId });
export async function deleteProject(id: string) {
  // Unlink tasks first so none point at a dead project, then delete the project.
  const owned = state.tasks.filter((t) => t.projectId === id);
  await Promise.all(owned.map((t) => updateDoc(tref(t.id), { projectId: null })));
  await deleteDoc(doc(db, "users", state.user!.uid, "projects", id));
}
export const setActiveBet = (projectId: string, leadingIndicator: string | null) =>
  api.setActiveBet(projectId, leadingIndicator);

/** Assign (or clear with null) a task's project. Offline-capable direct write. */
export const moveTaskToProject = (taskId: string, projectId: string | null) =>
  updateDoc(tref(taskId), { projectId });

/** Create a task already attached to a project (lands in Next so it's actionable). */
export async function createTaskInProject(title: string, projectId: string) {
  const proj = state.projects.find((p) => p.id === projectId);
  await addDoc(tasksCol(state.user!.uid), {
    title: title.trim(), notes: "", hatId: proj?.hatId || "ops", projectId,
    status: "next", due: null, snoozeUntil: null,
    order: Date.now(), pushCount: 0, createdAt: Date.now(), completedAt: null,
  });
}

/** Count of non-done tasks in a project (for the Projects manager). */
export const projectTaskCount = (projectId: string) =>
  state.tasks.filter((t) => t.projectId === projectId && t.status !== "done").length;

export const projectById = (id?: string) => state.projects.find((p) => p.id === id) || null;

export const renameHat = (id: string, name: string) =>
  updateDoc(doc(db, "users", state.user!.uid, "hats", id), { name });

// ---- Settings -------------------------------------------------------------
export async function saveSettings(patch: Record<string, any>) {
  state.settings = { ...state.settings, ...patch };
  applyTheme(state.settings.theme);
  await setDoc(doc(db, "users", state.user!.uid), { settings: state.settings }, { merge: true });
}
export function applyTheme(theme: string) {
  document.body.classList.toggle("body--light", theme === "light");
  document.body.classList.toggle("body--dark", theme !== "light");
}

export const logout = () => signOut(auth);

// ---- Selectors ------------------------------------------------------------
const pausedProjectIds = computed(() => new Set(state.projects.filter((p) => p.status === "paused").map((p) => p.id)));
function visible(t: Task) { return !t.projectId || !pausedProjectIds.value.has(t.projectId); }

export const viewTasks = (view: string, hatId?: string, projectId?: string): Task[] => {
  let list = state.tasks.slice();
  switch (view) {
    case "today": case "active": list = list.filter((t) => t.status === "active"); break;
    case "next": list = list.filter((t) => t.status === "next" && visible(t)); break;
    case "inbox": list = list.filter((t) => t.status === "inbox" && visible(t)); break;
    case "snoozed": list = list.filter((t) => t.status === "snoozed"); break;
    case "done":
      return list.filter((t) => t.status === "done").sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0)).slice(0, 50);
    case "by_hat": list = list.filter((t) => t.hatId === hatId && t.status !== "done" && visible(t)); break;
    case "by_project": list = list.filter((t) => t.projectId === projectId && t.status !== "done"); break;
  }
  return list.sort((a, b) => (a.order || 0) - (b.order || 0));
};

export const activeCount = computed(() => state.tasks.filter((t) => t.status === "active").length);

/** Four-tile dashboard computed LOCALLY for instant/offline render (REQ-FOS-04, NFR-2). */
export const dashboard = computed(() => {
  const now = Date.now();
  const bet = state.projects.find((p) => p.isActiveBet) || null;
  const three = state.tasks.filter((t) => t.status === "active");
  const hatBalance: Record<string, number> = { direction: 0, build: 0, distribution: 0, ops: 0 };
  for (const t of state.tasks) {
    const touched = Math.max(t.createdAt || 0, t.completedAt || 0);
    if (touched > now - WEEK && t.hatId in hatBalance) hatBalance[t.hatId]++;
  }
  const open = state.tasks.filter((t) => t.status !== "done");
  const overdue = open.filter((t) => t.due && t.due < now).slice(0, 8);
  const aging = open.filter((t) => t.status === "inbox" && now - (t.createdAt || now) > WEEK).slice(0, 8);
  const mostAvoided = open.filter((t) => (t.pushCount || 0) > 0).sort((a, b) => (b.pushCount || 0) - (a.pushCount || 0))[0] || null;
  return { bet, three, hatBalance, overdue, aging, mostAvoided };
});

/** Avoidance audit deterministic stats (REQ-FOS-06 core; AI prose added on demand). */
export const avoidanceStats = computed(() => {
  const now = Date.now();
  const perHat: Record<string, number> = { direction: 0, build: 0, distribution: 0, ops: 0 };
  for (const t of state.tasks) {
    const touched = Math.max(t.createdAt || 0, t.completedAt || 0);
    if (touched > now - WEEK && t.hatId in perHat) perHat[t.hatId]++;
  }
  const quietHats = Object.entries(perHat).filter(([, c]) => c === 0).map(([h]) => h);
  const pausedLongest = state.projects.filter((p) => p.status === "paused").sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))[0] || null;
  const mostPushed = state.tasks.filter((t) => t.status !== "done" && (t.pushCount || 0) > 0)
    .sort((a, b) => (b.pushCount || 0) - (a.pushCount || 0))[0] || null;
  return { perHat, quietHats, pausedLongest, mostPushed };
});

// ---- Search (Fuse.js over local cache, offline, REQ-SRCH-01) --------------
export function search(q: string) {
  if (!q.trim()) return { tasks: [] as Task[], projects: [] as Project[] };
  const tf = new Fuse(state.tasks, { keys: ["title", "notes"], threshold: 0.4 });
  const pf = new Fuse(state.projects, { keys: ["name"], threshold: 0.4 });
  return {
    tasks: tf.search(q).map((r) => r.item).slice(0, 25),
    projects: pf.search(q).map((r) => r.item).slice(0, 25),
  };
}
