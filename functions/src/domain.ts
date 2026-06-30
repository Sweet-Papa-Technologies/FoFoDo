/**
 * FoFoDo domain model + the deterministic capture parser.
 *
 * The parser is the AI-OFF fallback for REQ-CAP-02: it must NEVER throw and must
 * always yield at least a title (G-3/G-4). The optional AI parse (ai.ts) layers
 * on top and degrades to this when disabled or failing.
 */
import { HAT_KEYS, DEFAULT_HAT_KEY, HatKey } from "./config";

export type TaskStatus = "inbox" | "next" | "active" | "done" | "snoozed";
export type ProjectStatus = "active" | "paused" | "snoozed";

/**
 * Work status — a SECONDARY, free-floating progress label, independent of the
 * lifecycle `status` (inbox/next/active/...). Lets a task in focus also be
 * marked "Blocked", "Waiting", etc. Default "none".
 */
export type WorkStatus = "none" | "in_progress" | "blocked" | "waiting" | "review";
export const WORK_STATUSES: WorkStatus[] = ["none", "in_progress", "blocked", "waiting", "review"];
export function isValidWorkStatus(s: string): s is WorkStatus {
  return (WORK_STATUSES as string[]).includes(s);
}

export interface Task {
  id?: string;
  title: string;
  notes?: string;
  hatId: string;
  projectId?: string | null;
  status: TaskStatus;
  due?: number | null; // epoch ms
  snoozeUntil?: number | null;
  order: number;
  pushCount: number; // times pushed/snoozed — feeds the avoidance audit
  createdAt: number;
  completedAt?: number | null;
}

export interface ParsedCapture {
  title: string;
  hatId: string;
  due: number | null;
  projectHint: string | null;
}

const HAT_ALIASES: Record<string, HatKey> = {
  direction: "direction", steer: "direction", strategy: "direction", plan: "direction",
  build: "build", make: "build", code: "build", dev: "build",
  distribution: "distribution", grow: "distribution", growth: "distribution",
  marketing: "distribution", share: "distribution", sales: "distribution",
  ops: "ops", run: "ops", admin: "ops", maintenance: "ops", maintain: "ops",
};

/** Resolve a hashtag / word to a stable hat key, or null. */
export function resolveHat(token: string): string | null {
  return HAT_ALIASES[token.toLowerCase()] ?? null;
}

/**
 * Deterministic natural-language-ish capture parse. Handles:
 *   #hat tags  •  "today" / "tomorrow"  •  a clock time like "3pm" / "15:30"
 *   +project hints  •  everything else becomes the title.
 * `now` is injectable for deterministic tests.
 */
export function parseCapture(raw: string, now = Date.now()): ParsedCapture {
  const text = (raw ?? "").trim();
  if (!text) {
    return { title: "", hatId: DEFAULT_HAT_KEY, due: null, projectHint: null };
  }

  let hatId: string = DEFAULT_HAT_KEY;
  let projectHint: string | null = null;
  let dueDay: Date | null = null;
  let timeMinutes: number | null = null;

  const kept: string[] = [];
  for (const word of text.split(/\s+/)) {
    // #hat
    if (word.startsWith("#")) {
      const hat = resolveHat(word.slice(1));
      if (hat) { hatId = hat; continue; }
      kept.push(word.slice(1)); // unknown tag → keep as plain word
      continue;
    }
    // +project
    if (word.startsWith("+") && word.length > 1) {
      projectHint = word.slice(1);
      continue;
    }
    const lower = word.toLowerCase().replace(/[.,!?]$/, "");
    if (lower === "today") { dueDay = startOfDay(new Date(now)); continue; }
    if (lower === "tomorrow") { const d = startOfDay(new Date(now)); d.setDate(d.getDate() + 1); dueDay = d; continue; }
    const t = parseClock(lower);
    if (t !== null) { timeMinutes = t; continue; }
    kept.push(word);
  }

  let due: number | null = null;
  if (dueDay || timeMinutes !== null) {
    const base = dueDay ?? startOfDay(new Date(now));
    if (timeMinutes !== null) {
      base.setHours(Math.floor(timeMinutes / 60), timeMinutes % 60, 0, 0);
    } else {
      base.setHours(9, 0, 0, 0); // default reminder hour
    }
    due = base.getTime();
  }

  const title = kept.join(" ").trim() || text; // never empty
  return { title, hatId, due, projectHint };
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** "3pm" | "3:30pm" | "15:30" | "9am" → minutes past midnight, or null. */
function parseClock(s: string): number | null {
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3];
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === "pm" && h !== 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
  } else {
    // bare number with no am/pm and no colon is ambiguous → only accept HH:MM
    if (!m[2]) return null;
    if (h > 23) return null;
  }
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function isValidHat(hatId: string): boolean {
  return HAT_KEYS.includes(hatId);
}

export function isValidStatus(s: string): s is TaskStatus {
  return ["inbox", "next", "active", "done", "snoozed"].includes(s);
}
