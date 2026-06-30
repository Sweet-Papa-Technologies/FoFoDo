/**
 * AI features (§5.6) — Firebase Genkit flows on Vertex AI (Gemini Flash-Lite,
 * OPEN-QUESTIONS Q4). EVERY function here is additive sugar:
 *   • respects the per-user kill switch AND a global env override (REQ-AI-06)
 *   • lazy-loads Genkit so AI-off does zero model work and adds no cold-start cost
 *   • never throws to callers — on any failure it returns null and the caller
 *     uses its deterministic fallback (G-3 / G-4).
 */
import { CONFIG } from "./config";

let _ai: any = null;
let _initFailed = false;

async function getAi(): Promise<any | null> {
  if (process.env.FOFODO_AI_GLOBAL_OFF === "1") return null;
  if (_initFailed) return null;
  if (_ai) return _ai;
  try {
    // Opaque specifiers: keep Genkit's enormous type graph out of `tsc` (it OOMs
    // the compiler) while still loading the real module lazily at runtime.
    // Vertex plugin lives in @genkit-ai/google-genai (the older @genkit-ai/vertexai
    // package can't reach the "global" location that serves Gemini 3.1 Flash-Lite).
    const genkitMod: any = await import("genkit" as string);
    const vertexMod: any = await import("@genkit-ai/google-genai" as string);
    const genkit = genkitMod.genkit;
    const vertexAI = vertexMod.vertexAI;
    _ai = genkit({
      plugins: [
        vertexAI({
          location: CONFIG.AI_LOCATION,
          projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT,
        }),
      ],
      model: `vertexai/${CONFIG.AI_MODEL}`,
    });
    return _ai;
  } catch (e) {
    console.warn("Genkit init failed; AI features disabled.", e);
    _initFailed = true;
    return null;
  }
}

async function generate(prompt: string): Promise<string | null> {
  const ai = await getAi();
  if (!ai) return null;
  try {
    const res = await ai.generate({ prompt });
    return (res.text || "").trim() || null;
  } catch (e) {
    console.warn("AI generate failed; falling back.", e);
    return null;
  }
}

/** REQ-AI-01: refine a capture parse. Returns null → caller keeps deterministic. */
export async function aiParseCapture(raw: string): Promise<{ title?: string; hat?: string } | null> {
  const out = await generate(
    `Extract a concise task title and, if clearly implied, one hat from this quick-add.\n` +
    `Hats: direction, build, distribution, ops.\n` +
    `Reply as compact JSON {"title":"...","hat":"..."} (omit hat if unclear). Input: ${raw}`
  );
  return parseJson(out);
}

/** REQ-AI-02: suggest a hat (and maybe project). Suggestion only — never applied. */
export async function aiSuggestTriage(title: string, notes?: string): Promise<{ hat?: string; reason?: string } | null> {
  const out = await generate(
    `Suggest the best hat for this task. Hats: direction(strategy), build(making), ` +
    `distribution(growth/marketing), ops(admin/run). Reply JSON {"hat":"...","reason":"<8 words"}.\n` +
    `Task: ${title}\nNotes: ${notes || ""}`
  );
  return parseJson(out);
}

/** REQ-AI-03 / REQ-FOS-06: kind, curious avoidance summary + one 10-min nudge. */
export async function aiAvoidanceSummary(stats: unknown): Promise<string | null> {
  return generate(
    `You are a kind, curious coach (never scolding, no guilt — celebration over shame). ` +
    `Given these weekly stats, write 2 short sentences: what's quiet, and one specific ` +
    `10-minute nudge. Stats JSON: ${JSON.stringify(stats)}`
  );
}

/** REQ-AI-04: "What now?" Deterministic fallback = the Active-Bet-aligned task. */
export async function aiWhatNow(ctx: {
  now: string; energy?: string; activeBet?: string | null; tasks: { id: string; title: string }[];
}): Promise<{ id?: string; why?: string } | null> {
  const out = await generate(
    `Pick ONE task to do now. Time:${ctx.now}. Energy/budget:${ctx.energy || "unspecified"}. ` +
    `Active Bet:${ctx.activeBet || "none"}. Tasks:${JSON.stringify(ctx.tasks)}. ` +
    `Reply JSON {"id":"<task id>","why":"<one sentence>"}.`
  );
  return parseJson(out);
}

/** REQ-AI-05: break a big task into suggested next-actions (accepted individually). */
export async function aiBreakdown(title: string, notes?: string): Promise<string[] | null> {
  const out = await generate(
    `Break this task into 3-6 concrete next-actions. Reply as a JSON array of strings only.\n` +
    `Task: ${title}\nNotes: ${notes || ""}`
  );
  const arr = parseJson(out);
  return Array.isArray(arr) ? arr.map(String).slice(0, 6) : null;
}

function parseJson(s: string | null): any {
  if (!s) return null;
  try {
    const m = s.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    return m ? JSON.parse(m[0]) : null;
  } catch {
    return null;
  }
}

/** Is AI allowed for this user right now? (per-user setting + global override) */
export function aiEnabledFor(userSettings: { aiEnabled?: boolean } | undefined): boolean {
  if (process.env.FOFODO_AI_GLOBAL_OFF === "1") return false;
  return !!userSettings?.aiEnabled;
}
