/**
 * Quick capture (REQ-CAP-01/02): always lands a task in `inbox`. Deterministic
 * parse first; optional AI refinement only when enabled. A parse/AI failure NEVER
 * blocks capture — worst case the raw text becomes the title (G-3/G-4).
 */
import { parseCapture } from "./domain";
import { createTask, listProjects } from "./repo";
import { aiParseCapture } from "./ai";

export async function captureTask(
  uid: string,
  raw: string,
  opts: { aiEnabled?: boolean } = {}
) {
  const det = parseCapture(raw);
  let title = det.title;
  let hatId = det.hatId;

  if (opts.aiEnabled) {
    try {
      const ai = await aiParseCapture(raw);
      if (ai?.title) title = ai.title;
      if (ai?.hat) hatId = ai.hat;
    } catch {
      /* deterministic result already in hand */
    }
  }

  // Light project-hint resolution: match an existing project by name.
  let projectId: string | null = null;
  if (det.projectHint) {
    const projects = await listProjects(uid);
    const hit = projects.find(
      (p: any) => String(p.name).toLowerCase() === det.projectHint!.toLowerCase()
    );
    if (hit) projectId = hit.id;
  }

  return createTask(uid, { title, hatId, due: det.due, projectId, status: "inbox" });
}
