/**
 * Pure WIP-3 activation decision (REQ-FOS-01).
 *
 * Extracted from setActive() in wip3.ts so the branching — already-active,
 * under-limit, at-limit-with-bump, at-limit-without/invalid-bump — is unit
 * testable without a Firestore transaction. wip3.ts calls this inside its
 * transaction and applies the resulting writes; behaviour is identical.
 */

export interface DecideActivationInput {
  /** Ids of currently-active tasks. */
  activeIds: string[];
  /** Task we want to activate. */
  targetId: string;
  /** Whether the target is already active (→ idempotent no-op). */
  targetAlreadyActive: boolean;
  /** Optional active task to demote to make room. */
  bumpTaskId?: string | null;
  /** WIP limit (CONFIG.WIP_LIMIT). */
  limit: number;
}

export type ActivationDecision =
  | { kind: "noop" }
  | { kind: "activate"; bump?: string }
  | { kind: "reject"; activeIds: string[] };

export function decideActivation(input: DecideActivationInput): ActivationDecision {
  const { activeIds, targetAlreadyActive, bumpTaskId, limit } = input;

  // Already active → idempotent no-op.
  if (targetAlreadyActive) return { kind: "noop" };

  // Under the limit → activate straight away.
  if (activeIds.length < limit) return { kind: "activate" };

  // At (or over) the limit → need a valid bump or we reject.
  if (bumpTaskId && activeIds.includes(bumpTaskId)) {
    return { kind: "activate", bump: bumpTaskId };
  }
  return { kind: "reject", activeIds };
}
