/**
 * API-KEY QUOTA logic tests (REQ-API-04 / REQ-HOST-02).
 *
 * Tests the pure helpers extracted from auth.ts into quota-logic.ts: UTC
 * window-key formatting, the over-limit comparison (count == limit is allowed,
 * count > limit is not), and reset-seconds-until-midnight math.
 */
import { describe, it, expect } from "vitest";
import { dayKey, minuteKey, overLimit, secondsUntilUtcMidnight } from "./quota-logic";

describe("dayKey", () => {
  it("formats YYYYMMDD in UTC with zero-padding", () => {
    // 2026-01-05T23:59:00Z → 20260105
    expect(dayKey(new Date(Date.UTC(2026, 0, 5, 23, 59, 0)))).toBe("20260105");
  });
  it("zero-pads month and day", () => {
    expect(dayKey(new Date(Date.UTC(2026, 8, 3, 0, 0, 0)))).toBe("20260903");
  });
  it("uses UTC, not local time, near a day boundary", () => {
    // 2026-06-29T00:30:00Z is still the 29th in UTC.
    expect(dayKey(new Date(Date.UTC(2026, 5, 29, 0, 30, 0)))).toBe("20260629");
  });
});

describe("minuteKey", () => {
  it("formats YYYYMMDDHHmm in UTC with zero-padding", () => {
    expect(minuteKey(new Date(Date.UTC(2026, 0, 5, 7, 9, 30)))).toBe("202601050709");
  });
  it("builds on dayKey (shares the date prefix)", () => {
    const d = new Date(Date.UTC(2026, 5, 29, 13, 47, 5));
    expect(minuteKey(d).startsWith(dayKey(d))).toBe(true);
    expect(minuteKey(d)).toBe("202606291347");
  });
  it("zero-pads hour and minute", () => {
    expect(minuteKey(new Date(Date.UTC(2026, 11, 31, 0, 0, 0)))).toBe("202612310000");
  });
});

describe("overLimit", () => {
  it("count > limit → over limit", () => {
    expect(overLimit(61, 60)).toBe(true);
  });
  it("count == limit → NOT over limit (the limit-th request is allowed)", () => {
    expect(overLimit(60, 60)).toBe(false);
  });
  it("count < limit → not over limit", () => {
    expect(overLimit(1, 60)).toBe(false);
  });
});

describe("secondsUntilUtcMidnight", () => {
  it("one minute before UTC midnight → 60s", () => {
    expect(secondsUntilUtcMidnight(new Date(Date.UTC(2026, 5, 29, 23, 59, 0)))).toBe(60);
  });
  it("at UTC midnight → a full day (86400s) until the NEXT midnight", () => {
    expect(secondsUntilUtcMidnight(new Date(Date.UTC(2026, 5, 29, 0, 0, 0)))).toBe(86400);
  });
  it("noon UTC → 43200s", () => {
    expect(secondsUntilUtcMidnight(new Date(Date.UTC(2026, 5, 29, 12, 0, 0)))).toBe(43200);
  });
});
