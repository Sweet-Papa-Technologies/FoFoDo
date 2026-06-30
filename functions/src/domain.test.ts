/**
 * CAPTURE PARSE tests (REQ-CAP-02).
 *
 * parseCapture is the deterministic AI-OFF fallback: it must NEVER throw and
 * must always yield at least a title. We inject a FIXED `now` so day/time
 * assertions are deterministic regardless of the machine clock or timezone.
 */
import { describe, it, expect } from "vitest";
import { parseCapture, resolveHat, isValidHat, isValidStatus } from "./domain";
import { DEFAULT_HAT_KEY } from "./config";

// Fixed reference instant. parseCapture uses LOCAL-time getters (startOfDay /
// setHours), so we derive expectations from the same local Date to stay
// timezone-agnostic.
const NOW = new Date(2026, 5, 29, 13, 47, 5, 0); // 2026-06-29 13:47:05 local
const NOW_MS = NOW.getTime();

function localStartOfDay(base: Date): Date {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  return d;
}
function dueAt(dayOffset: number, hour: number, minute: number): number {
  const d = localStartOfDay(NOW);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

describe("parseCapture — title & default hat", () => {
  it("plain text → title only, default hat 'ops'", () => {
    const r = parseCapture("call the plumber", NOW_MS);
    expect(r.title).toBe("call the plumber");
    expect(r.hatId).toBe("ops");
    expect(r.hatId).toBe(DEFAULT_HAT_KEY);
    expect(r.due).toBeNull();
    expect(r.projectHint).toBeNull();
  });

  it("a string with no recognizable tokens falls back to raw text as title", () => {
    const r = parseCapture("xyzzy plugh frobnicate", NOW_MS);
    expect(r.title).toBe("xyzzy plugh frobnicate");
    expect(r.hatId).toBe(DEFAULT_HAT_KEY);
    expect(r.due).toBeNull();
  });
});

describe("parseCapture — hat tags & aliases", () => {
  it("#distribution maps to the distribution hat", () => {
    const r = parseCapture("email list #distribution", NOW_MS);
    expect(r.hatId).toBe("distribution");
    expect(r.title).toBe("email list");
  });

  it("alias #grow → distribution", () => {
    expect(parseCapture("ship #grow", NOW_MS).hatId).toBe("distribution");
  });
  it("alias #build → build", () => {
    expect(parseCapture("ship #build", NOW_MS).hatId).toBe("build");
  });
  it("alias #steer → direction", () => {
    expect(parseCapture("ship #steer", NOW_MS).hatId).toBe("direction");
  });
  it("more aliases resolve to stable keys", () => {
    expect(parseCapture("x #code", NOW_MS).hatId).toBe("build");
    expect(parseCapture("x #marketing", NOW_MS).hatId).toBe("distribution");
    expect(parseCapture("x #strategy", NOW_MS).hatId).toBe("direction");
    expect(parseCapture("x #admin", NOW_MS).hatId).toBe("ops");
  });

  it("hat tag is case-insensitive", () => {
    expect(parseCapture("x #BUILD", NOW_MS).hatId).toBe("build");
  });

  it("unknown #tag is kept as a plain word, NOT a hat (default hat stays)", () => {
    const r = parseCapture("buy #groceries milk", NOW_MS);
    expect(r.hatId).toBe(DEFAULT_HAT_KEY);
    // the '#' is stripped, the word is kept in the title
    expect(r.title).toBe("buy groceries milk");
  });
});

describe("parseCapture — relative days", () => {
  it("'today' sets due to today at default 9am", () => {
    const r = parseCapture("standup today", NOW_MS);
    expect(r.due).toBe(dueAt(0, 9, 0));
    expect(r.title).toBe("standup");
  });

  it("'tomorrow' sets due to the next day at default 9am", () => {
    const r = parseCapture("review tomorrow", NOW_MS);
    expect(r.due).toBe(dueAt(1, 9, 0));
    expect(r.title).toBe("review");
  });

  it("trailing punctuation on a day word still parses", () => {
    const r = parseCapture("ship it tomorrow.", NOW_MS);
    expect(r.due).toBe(dueAt(1, 9, 0));
    expect(r.title).toBe("ship it");
  });
});

describe("parseCapture — clock times", () => {
  it("'3pm' → today 15:00", () => {
    expect(parseCapture("meeting 3pm", NOW_MS).due).toBe(dueAt(0, 15, 0));
  });
  it("'9am' → today 09:00", () => {
    expect(parseCapture("gym 9am", NOW_MS).due).toBe(dueAt(0, 9, 0));
  });
  it("'15:30' → today 15:30", () => {
    expect(parseCapture("call 15:30", NOW_MS).due).toBe(dueAt(0, 15, 30));
  });
  it("'3:30pm' → today 15:30", () => {
    expect(parseCapture("call 3:30pm", NOW_MS).due).toBe(dueAt(0, 15, 30));
  });
  it("'12am' → midnight (00:00)", () => {
    expect(parseCapture("x 12am", NOW_MS).due).toBe(dueAt(0, 0, 0));
  });
  it("'12pm' → noon (12:00)", () => {
    expect(parseCapture("x 12pm", NOW_MS).due).toBe(dueAt(0, 12, 0));
  });

  it("clock + 'tomorrow' combine onto the right day & hour", () => {
    const r = parseCapture("demo tomorrow 3pm", NOW_MS);
    expect(r.due).toBe(dueAt(1, 15, 0));
    expect(r.title).toBe("demo");
  });

  it("a bare number with no am/pm and no colon is NOT a time (kept as word)", () => {
    const r = parseCapture("buy 3 apples", NOW_MS);
    expect(r.due).toBeNull();
    expect(r.title).toBe("buy 3 apples");
  });

  it("an invalid clock like '25:00' is kept as a word, not a time", () => {
    const r = parseCapture("code 25:00", NOW_MS);
    expect(r.due).toBeNull();
    expect(r.title).toBe("code 25:00");
  });
});

describe("parseCapture — project hints", () => {
  it("+project sets the hint and is removed from the title", () => {
    const r = parseCapture("write spec +fofodo", NOW_MS);
    expect(r.projectHint).toBe("fofodo");
    expect(r.title).toBe("write spec");
  });
  it("a lone '+' is not a project hint", () => {
    const r = parseCapture("a + b", NOW_MS);
    expect(r.projectHint).toBeNull();
    expect(r.title).toBe("a + b");
  });
});

describe("parseCapture — never throws / empty input", () => {
  it("empty string → empty title + default hat, no throw", () => {
    const r = parseCapture("", NOW_MS);
    expect(r.title).toBe("");
    expect(r.hatId).toBe(DEFAULT_HAT_KEY);
    expect(r.due).toBeNull();
    expect(r.projectHint).toBeNull();
  });
  it("whitespace-only → empty title + default hat, no throw", () => {
    const r = parseCapture("   \t \n ", NOW_MS);
    expect(r.title).toBe("");
    expect(r.hatId).toBe(DEFAULT_HAT_KEY);
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  it("null/undefined input never throws", () => {
    expect(() => parseCapture(undefined as unknown as string, NOW_MS)).not.toThrow();
    expect(() => parseCapture(null as unknown as string, NOW_MS)).not.toThrow();
    expect(parseCapture(null as unknown as string, NOW_MS).title).toBe("");
  });

  it("input that is ONLY tokens (hat+day) still yields a non-empty title fallback", () => {
    // all words consumed → title falls back to the raw text
    const r = parseCapture("#build today", NOW_MS);
    expect(r.hatId).toBe("build");
    expect(r.due).toBe(dueAt(0, 9, 0));
    expect(r.title).toBe("#build today"); // never-empty fallback to raw
  });
});

describe("resolveHat / isValidHat / isValidStatus", () => {
  it("resolveHat maps aliases and rejects unknowns", () => {
    expect(resolveHat("grow")).toBe("distribution");
    expect(resolveHat("STEER")).toBe("direction");
    expect(resolveHat("nope")).toBeNull();
  });
  it("isValidHat", () => {
    expect(isValidHat("ops")).toBe(true);
    expect(isValidHat("direction")).toBe(true);
    expect(isValidHat("grow")).toBe(false); // alias is not a key
    expect(isValidHat("nope")).toBe(false);
  });
  it("isValidStatus", () => {
    expect(isValidStatus("active")).toBe(true);
    expect(isValidStatus("inbox")).toBe(true);
    expect(isValidStatus("bogus")).toBe(false);
  });
});
