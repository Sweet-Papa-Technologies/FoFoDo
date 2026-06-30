/**
 * WIP-3 decision logic tests (REQ-FOS-01).
 *
 * Tests the pure decideActivation() extracted from setActive(): the four
 * branches — already-active no-op, under-limit activate, at-limit activate+bump,
 * at-limit reject — plus the boundary at exactly 3 active (CONFIG.WIP_LIMIT).
 */
import { describe, it, expect } from "vitest";
import { decideActivation } from "./wip3-logic";
import { CONFIG } from "./config";

const LIMIT = CONFIG.WIP_LIMIT; // 3

describe("decideActivation", () => {
  it("already active → no-op (idempotent)", () => {
    const d = decideActivation({
      activeIds: ["a", "b", "c"],
      targetId: "a",
      targetAlreadyActive: true,
      limit: LIMIT,
    });
    expect(d).toEqual({ kind: "noop" });
  });

  it("under the limit → activate (no bump)", () => {
    const d = decideActivation({
      activeIds: ["a", "b"],
      targetId: "t",
      targetAlreadyActive: false,
      limit: LIMIT,
    });
    expect(d).toEqual({ kind: "activate" });
  });

  it("zero active → activate", () => {
    const d = decideActivation({
      activeIds: [],
      targetId: "t",
      targetAlreadyActive: false,
      limit: LIMIT,
    });
    expect(d).toEqual({ kind: "activate" });
  });

  it("at the limit with a valid bump → activate + bump", () => {
    const d = decideActivation({
      activeIds: ["a", "b", "c"],
      targetId: "t",
      targetAlreadyActive: false,
      bumpTaskId: "b",
      limit: LIMIT,
    });
    expect(d).toEqual({ kind: "activate", bump: "b" });
  });

  it("at the limit without a bump → reject (carries active ids)", () => {
    const d = decideActivation({
      activeIds: ["a", "b", "c"],
      targetId: "t",
      targetAlreadyActive: false,
      limit: LIMIT,
    });
    expect(d).toEqual({ kind: "reject", activeIds: ["a", "b", "c"] });
  });

  it("at the limit with an INVALID bump (not currently active) → reject", () => {
    const d = decideActivation({
      activeIds: ["a", "b", "c"],
      targetId: "t",
      targetAlreadyActive: false,
      bumpTaskId: "zzz", // not in activeIds
      limit: LIMIT,
    });
    expect(d).toEqual({ kind: "reject", activeIds: ["a", "b", "c"] });
  });

  it("boundary: exactly 3 active (== limit) is treated as 'at limit', not 'under'", () => {
    const under = decideActivation({
      activeIds: ["a", "b"],
      targetId: "t",
      targetAlreadyActive: false,
      limit: LIMIT,
    });
    const atLimit = decideActivation({
      activeIds: ["a", "b", "c"],
      targetId: "t",
      targetAlreadyActive: false,
      limit: LIMIT,
    });
    expect(under.kind).toBe("activate");
    expect(atLimit.kind).toBe("reject");
  });

  it("already-active takes precedence even at/over the limit", () => {
    const d = decideActivation({
      activeIds: ["a", "b", "c"],
      targetId: "a",
      targetAlreadyActive: true,
      bumpTaskId: "b",
      limit: LIMIT,
    });
    expect(d).toEqual({ kind: "noop" });
  });
});
