/**
 * FoFoDo build configuration & feature flags.
 *
 * G-8 / REQ-OSS-03: HOSTED, ADS_ENABLED, FFN_AUTH_ENABLED, QUOTAS_ENABLED all
 * default OFF so the open-source build never ships hosted-only behaviour.
 * The hosted FoFoApps deployment flips them on via environment variables.
 */

function flag(name: string, def = false): boolean {
  const v = process.env[name];
  if (v === undefined) return def;
  return v === "1" || v.toLowerCase() === "true";
}

export const CONFIG = {
  /** Named Firestore database FoFoDo lives in (isolated from the shared default DB). */
  databaseId: process.env.FOFODO_DB || "fofodo",

  /** Hosted-tier master flag. OSS default: false. */
  HOSTED: flag("HOSTED"),
  /** Render house/ad slots (hosted only). */
  ADS_ENABLED: flag("ADS_ENABLED"),
  /** FoFo Network sign-in (hosted only; deferred per OPEN-QUESTIONS Q3). */
  FFN_AUTH_ENABLED: flag("FFN_AUTH_ENABLED"),
  /** Per-API-key rate limits & daily caps (hosted only). OSS default: unlimited. */
  QUOTAS_ENABLED: flag("QUOTAS_ENABLED"),

  /** WIP-3 hard limit. The "3" in FoFoDo. Not configurable in v1 by design (P-1). */
  WIP_LIMIT: 3,

  /** Reminder scheduler tick. OPEN-QUESTIONS Q6 → 5 minutes (cost over punctuality). */
  REMINDER_SCHEDULE: "every 5 minutes",
  /** Bounded webhook/push retry attempts before logging to events (REQ-REM-02/03). */
  REMINDER_MAX_ATTEMPTS: 3,

  /** Hosted quota defaults (config-driven, REQ-HOST-02). Per API key. */
  QUOTA_PER_MINUTE: Number(process.env.QUOTA_PER_MINUTE || 60),
  QUOTA_PER_DAY: Number(process.env.QUOTA_PER_DAY || 5000),

  /**
   * AI model (OPEN-QUESTIONS Q4: Gemini 3.1 Flash-Lite on Vertex). Overridable.
   * gemini-3.1-flash-lite is served from the "global" location (not us-central1),
   * so AI_LOCATION defaults to "global". The Genkit model ref is `vertexai/<model>`.
   */
  AI_MODEL: process.env.FOFODO_AI_MODEL || "gemini-3.1-flash-lite",
  AI_LOCATION: process.env.FOFODO_AI_LOCATION || "global",
};

/**
 * The four SPT hats (OPEN-QUESTIONS Q7: friendlier, universal labels while
 * keeping stable keys). Keys are stable forever; names are user-renameable.
 *   direction → Steer | build → Build | distribution → Grow | ops → Run
 * `ops` is the default "Unsorted" landing hat (REQ-FOS-02).
 */
export const DEFAULT_HATS = [
  { key: "direction", name: "Steer", order: 0 },
  { key: "build", name: "Build", order: 1 },
  { key: "distribution", name: "Grow", order: 2 },
  { key: "ops", name: "Run", order: 3 },
] as const;

export const DEFAULT_HAT_KEY = "ops";
export type HatKey = (typeof DEFAULT_HATS)[number]["key"];
export const HAT_KEYS: string[] = DEFAULT_HATS.map((h) => h.key);
