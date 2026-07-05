/**
 * WIP-3 hard limit (REQ-FOS-01) — enforced HERE, server-side, in a Firestore
 * transaction. This is the ONLY path that may set a task to `active`; Security
 * Rules forbid clients from doing it directly, so the limit holds across UI,
 * REST, and MCP alike (DoD #3). The Admin SDK bypasses rules by design.
 */
import { tasksRef, eventsRef, FieldValue } from "./firebase";
import { CONFIG } from "./config";
import { decideActivation } from "./wip3-logic";

export class Wip3Error extends Error {
  constructor(public activeTasks: { id: string; title: string }[]) {
    super("WIP-3 limit reached: you already have 3 active tasks.");
  }
}

export class NotFoundError extends Error {}

/** Bad user input (e.g. an invalid/unsafe webhook URL). Surfaces as HTTP 400. */
export class ValidationError extends Error {}

export interface SetActiveResult {
  id: string;
  status: "active";
  activeCount: number;
  bumped?: string;
}

/**
 * Move `taskId` into `active`. If already at the limit, the caller may pass
 * `bumpTaskId` (an existing active task) to demote to `next` and make room.
 * Without a bump, throws Wip3Error carrying the current 3 so the UI/MCP can
 * offer a kind "which one do you want to bump?" prompt.
 */
export async function setActive(
  uid: string,
  taskId: string,
  bumpTaskId?: string | null
): Promise<SetActiveResult> {
  const col = tasksRef(uid);
  return col.firestore.runTransaction(async (t) => {
    const activeSnap = await t.get(col.where("status", "==", "active"));
    const target = await t.get(col.doc(taskId));
    if (!target.exists) throw new NotFoundError(`Task ${taskId} not found.`);

    const activeDocs = activeSnap.docs;
    const decision = decideActivation({
      activeIds: activeDocs.map((d) => d.id),
      targetId: taskId,
      targetAlreadyActive: target.data()!.status === "active",
      bumpTaskId,
      limit: CONFIG.WIP_LIMIT,
    });

    // Already active → idempotent no-op.
    if (decision.kind === "noop") {
      return { id: taskId, status: "active", activeCount: activeSnap.size };
    }

    if (decision.kind === "reject") {
      throw new Wip3Error(
        activeDocs.map((d) => ({ id: d.id, title: d.data().title as string }))
      );
    }

    let bumped: string | undefined;
    if (decision.bump) {
      t.update(col.doc(decision.bump), { status: "next", updatedAt: FieldValue.serverTimestamp() });
      bumped = decision.bump;
    }

    t.update(col.doc(taskId), {
      status: "active",
      snoozeUntil: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    t.set(eventsRef(uid).doc(), {
      type: "task_activated",
      taskId,
      hatId: target.data()!.hatId ?? null,
      projectId: target.data()!.projectId ?? null,
      ts: Date.now(),
    });

    const activeCount = bumped ? activeDocs.length : activeDocs.length + 1;
    return { id: taskId, status: "active", activeCount, bumped };
  });
}
