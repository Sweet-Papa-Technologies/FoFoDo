/**
 * Central UI copy & labels (the naming/lingo layer). Keeping all user-facing
 * wording here makes it consistent across screens and easy to tune. See
 * docs/NAMING-UX-REVIEW.md for the rationale behind each choice.
 *
 * Internal keys (status values, hat keys) are UNCHANGED — this only affects what
 * the human sees.
 */

// Task lifecycle, in plain English.
export const STATUS_LABEL: Record<string, string> = {
  active: "In focus",
  next: "Next up",
  inbox: "Inbox",
  snoozed: "Later",
  done: "Done",
};

// Sidebar / nav labels.
export const NAV = {
  home: "Home",
  your3: "Your 3",
  next: "Next up",
  inbox: "Inbox",
  snoozed: "Later",
  done: "Done",
  hats: "Your hats",
  projects: "Projects",
  settings: "Settings",
  signout: "Sign out",
};

// Hats keep their friendly names, but we always pair them with a plain-English
// descriptor so a new user immediately understands what each is for.
// NOTE: keyed by the STABLE hat keys (direction/build/distribution/ops), not the
// friendly display names (Steer/Build/Grow/Run).
export const HAT_DESC: Record<string, string> = {
  direction: "Direction & planning",
  build: "Making things",
  distribution: "Growth & outreach",
  ops: "Admin & upkeep",
};
export const HAT_ICON: Record<string, string> = {
  direction: "sym_o_explore",
  build: "sym_o_construction",
  distribution: "sym_o_trending_up",
  ops: "sym_o_settings_backup_restore",
};

// Secondary work-status labels + colors (independent of the lifecycle status).
export interface WorkStatusMeta { value: string; label: string; color: string; icon: string; }
export const WORK_STATUSES: WorkStatusMeta[] = [
  { value: "none", label: "No status", color: "#8a8f98", icon: "sym_o_remove" },
  { value: "in_progress", label: "In progress", color: "#6fcf9f", icon: "sym_o_bolt" },
  { value: "blocked", label: "Blocked", color: "#ff9b86", icon: "sym_o_block" },
  { value: "waiting", label: "Waiting", color: "#ffc46b", icon: "sym_o_hourglass_empty" },
  { value: "review", label: "In review", color: "#93a8ff", icon: "sym_o_rate_review" },
];
export const workStatusMeta = (v?: string): WorkStatusMeta =>
  WORK_STATUSES.find((w) => w.value === (v || "none")) || WORK_STATUSES[0];

// Key concept relabels (jargon → clear).
export const TERMS = {
  activeBet: "Top Priority", // was "Active Bet"
  leadingIndicator: "Success signal", // "the one number that tells you it's working"
  postponed: "postponed", // was "pushed"
};

/** WIP pill text — "2 / 3 in focus" (no jargon acronym). */
export const wipText = (n: number) => `${n} / 3 in focus`;

/** Friendly hat label, optionally with its descriptor. */
export const hatWithDesc = (name: string, key: string) =>
  HAT_DESC[key] ? `${name} · ${HAT_DESC[key]}` : name;
