/**
 * Thin REST client for the FoFoDo API (same-origin /api via Hosting rewrite).
 * Sends the Firebase ID token. Used for server-gated operations (activate/WIP-3,
 * dashboard refresh, AI, API keys, export). Offline-capable operations
 * (capture/edit/complete/snooze) go straight to Firestore in store.ts.
 */
import { auth } from "./firebase";

const BASE = import.meta.env.VITE_API_BASE || "/api";

async function authHeader(): Promise<Record<string, string>> {
  const u = auth.currentUser;
  if (!u) return {};
  const token = await u.getIdToken();
  return { authorization: `Bearer ${token}` };
}

export class ApiError extends Error {
  constructor(public status: number, public body: any) {
    super(body?.message || body?.error || `HTTP ${status}`);
  }
}

async function req(method: string, path: string, body?: unknown): Promise<any> {
  const headers: Record<string, string> = { ...(await authHeader()) };
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  bootstrap: () => req("POST", "/bootstrap"),
  activate: (id: string, bumpTaskId?: string | null) =>
    req("POST", `/tasks/${id}/activate`, { bumpTaskId: bumpTaskId ?? null }),
  dashboard: () => req("GET", "/dashboard"),
  avoidance: () => req("GET", "/avoidance"),
  setActiveBet: (projectId: string, leadingIndicator: string | null) =>
    req("POST", `/projects/${projectId}/active-bet`, { leadingIndicator }),
  clearActiveBet: () => req("DELETE", "/active-bet"),
  whatNow: (energy?: string) => req("POST", "/ai/what-now", { energy }),
  breakdown: (title: string, notes?: string) => req("POST", "/ai/breakdown", { title, notes }),
  triage: (title: string, notes?: string) => req("POST", "/ai/triage", { title, notes }),
  // API keys (server-only)
  listKeys: () => req("GET", "/keys"),
  createKey: (name: string) => req("POST", "/keys", { name }),
  revokeKey: (id: string) => req("DELETE", `/keys/${id}`),
  // Reminders
  setReminder: (taskId: string, fireAt: number, channels: string[], webhookUrl?: string | null, webhookSecret?: string | null) =>
    req("POST", "/reminders", { taskId, fireAt, channels, webhookUrl, webhookSecret }),
  // Data ownership
  exportAll: () => req("GET", "/export"),
  deleteAccount: () => req("POST", "/delete-account", { confirm: "DELETE" }),
};
