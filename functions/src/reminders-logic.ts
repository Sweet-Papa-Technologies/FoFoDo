/**
 * Pure reminder claim / retry decisions (REQ-REM-03).
 *
 * Extracted from runReminderTick() in reminders.ts so the no-double-fire lease
 * logic and the bounded-retry give-up math are unit testable without Firestore.
 * reminders.ts calls these inside its transaction / failure handler; behaviour
 * is identical.
 */

export interface ClaimState {
  /** Already fired → must never fire again. */
  fired?: boolean;
  /** Epoch ms a concurrent run claimed a lease, if any. */
  processingAt?: number | null;
}

/**
 * Can this run claim the reminder? No, if it's already fired or a fresh lease is
 * held; yes, if there's no lease or the lease has expired.
 */
export function canClaim(state: ClaimState, now: number, leaseMs: number): boolean {
  if (state.fired) return false;
  if (state.processingAt != null && now - state.processingAt < leaseMs) return false;
  return true;
}

export interface FailureDecision {
  /** Stop retrying and mark failed. */
  giveUp: boolean;
  /** The new attempts count (current + 1). */
  nextAttempts: number;
}

/**
 * After a dispatch failure: bump attempts and decide whether the bounded retry
 * budget is exhausted (REQUIRE_MAX_ATTEMPTS reached → give up).
 */
export function afterFailure(attempts: number, maxAttempts: number): FailureDecision {
  const nextAttempts = (attempts || 0) + 1;
  return { giveUp: nextAttempts >= maxAttempts, nextAttempts };
}
