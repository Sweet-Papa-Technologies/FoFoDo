/**
 * Client-side deterministic capture parse — mirrors functions/src/domain.ts so
 * quick-add works fully OFFLINE (REQ-CAP-01/02). Never throws; always yields a
 * title. AI refinement (when enabled) happens server-side; offline we keep this.
 */
const HAT_ALIASES: Record<string, string> = {
  direction: "direction", steer: "direction", strategy: "direction", plan: "direction",
  build: "build", make: "build", code: "build", dev: "build",
  distribution: "distribution", grow: "distribution", growth: "distribution",
  marketing: "distribution", share: "distribution", sales: "distribution",
  ops: "ops", run: "ops", admin: "ops", maintenance: "ops", maintain: "ops",
};

export interface ParsedCapture {
  title: string;
  hatId: string;
  due: number | null;
  projectHint: string | null;
}

export function parseCapture(raw: string, now = Date.now()): ParsedCapture {
  const text = (raw ?? "").trim();
  if (!text) return { title: "", hatId: "ops", due: null, projectHint: null };

  let hatId = "ops";
  let projectHint: string | null = null;
  let dueDay: Date | null = null;
  let timeMinutes: number | null = null;
  const kept: string[] = [];

  for (const word of text.split(/\s+/)) {
    if (word.startsWith("#")) {
      const hat = HAT_ALIASES[word.slice(1).toLowerCase()];
      if (hat) { hatId = hat; continue; }
      kept.push(word.slice(1));
      continue;
    }
    if (word.startsWith("+") && word.length > 1) { projectHint = word.slice(1); continue; }
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
    if (timeMinutes !== null) base.setHours(Math.floor(timeMinutes / 60), timeMinutes % 60, 0, 0);
    else base.setHours(9, 0, 0, 0);
    due = base.getTime();
  }

  return { title: kept.join(" ").trim() || text, hatId, due, projectHint };
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

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
    if (!m[2]) return null;
    if (h > 23) return null;
  }
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
