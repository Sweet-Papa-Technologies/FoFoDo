/**
 * Pure quota window-key derivation & limit math (REQ-API-04 / REQ-HOST-02).
 *
 * Extracted from auth.ts so the window-key formatting and over-limit decision
 * are unit-testable with zero Firestore. auth.ts imports these and keeps its
 * transactional read/write behaviour identical.
 */

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Zero-padded UTC day key: YYYYMMDD. */
export function dayKey(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

/** Zero-padded UTC minute key: YYYYMMDDHHmm (built on dayKey). */
export function minuteKey(date: Date): string {
  return `${dayKey(date)}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`;
}

/** True when the post-increment count has exceeded the limit (count == limit is OK). */
export function overLimit(count: number, limit: number): boolean {
  return count > limit;
}

/** Whole seconds remaining until the next UTC midnight. */
export function secondsUntilUtcMidnight(date: Date): number {
  const next = new Date(date);
  next.setUTCHours(24, 0, 0, 0);
  return Math.round((next.getTime() - date.getTime()) / 1000);
}
