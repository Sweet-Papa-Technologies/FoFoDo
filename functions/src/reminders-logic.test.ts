/**
 * REMINDER SCHEDULING logic tests (REQ-REM-03).
 *
 * Tests the pure helpers extracted from runReminderTick() into
 * reminders-logic.ts: canClaim() (no double-fire / lease respect) and
 * afterFailure() (bounded retry give-up at REMINDER_MAX_ATTEMPTS).
 */
import { describe, it, expect } from "vitest";
import { canClaim, afterFailure } from "./reminders-logic";
import { CONFIG } from "./config";

const LEASE_MS = 4 * 60 * 1000; // mirrors reminders.ts LEASE_MS
const NOW = 1_700_000_000_000;

describe("canClaim — no double fire", () => {
  it("a fired reminder is NEVER claimed", () => {
    expect(canClaim({ fired: true }, NOW, LEASE_MS)).toBe(false);
    // even if the lease looks expired:
    expect(canClaim({ fired: true, processingAt: NOW - LEASE_MS * 10 }, NOW, LEASE_MS)).toBe(false);
  });

  it("a reminder under a FRESH lease is not re-claimed", () => {
    expect(canClaim({ processingAt: NOW - 1000 }, NOW, LEASE_MS)).toBe(false);
    expect(canClaim({ processingAt: NOW }, NOW, LEASE_MS)).toBe(false);
  });

  it("a reminder with an EXPIRED lease can be re-claimed", () => {
    expect(canClaim({ processingAt: NOW - LEASE_MS - 1 }, NOW, LEASE_MS)).toBe(true);
  });

  it("the lease boundary (exactly leaseMs old) is treated as expired → claimable", () => {
    // now - processingAt == LEASE_MS, which is NOT < LEASE_MS → claimable
    expect(canClaim({ processingAt: NOW - LEASE_MS }, NOW, LEASE_MS)).toBe(true);
  });

  it("a reminder with no lease (absent/null processingAt) is claimable", () => {
    expect(canClaim({}, NOW, LEASE_MS)).toBe(true);
    expect(canClaim({ processingAt: null }, NOW, LEASE_MS)).toBe(true);
    expect(canClaim({ fired: false, processingAt: undefined }, NOW, LEASE_MS)).toBe(true);
  });
});

describe("afterFailure — bounded retry", () => {
  const MAX = CONFIG.REMINDER_MAX_ATTEMPTS; // 3

  it("first failure (0 → 1) retries when under the cap", () => {
    expect(afterFailure(0, MAX)).toEqual({ giveUp: false, nextAttempts: 1 });
  });

  it("below the cap keeps retrying", () => {
    expect(afterFailure(1, MAX)).toEqual({ giveUp: false, nextAttempts: 2 });
  });

  it("reaching REMINDER_MAX_ATTEMPTS gives up", () => {
    // attempts 2 → 3 == MAX → give up
    expect(afterFailure(2, MAX)).toEqual({ giveUp: true, nextAttempts: 3 });
  });

  it("beyond the cap also gives up", () => {
    expect(afterFailure(5, MAX)).toEqual({ giveUp: true, nextAttempts: 6 });
  });

  it("treats a missing/undefined attempts count as 0", () => {
    expect(afterFailure(undefined as unknown as number, MAX)).toEqual({ giveUp: false, nextAttempts: 1 });
  });
});
