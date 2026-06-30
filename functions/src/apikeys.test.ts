/**
 * API KEY pure-logic tests (REQ-API-03).
 *
 * Covers ONLY the pure, Firestore-free pieces: the SHA-256 hashKey and the
 * fofodo_<pub>_<secret> key format. We do NOT touch Firestore here — no
 * createApiKey / resolveApiKey calls (those need the Admin SDK).
 */
import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import { hashKey } from "./apikeys";

describe("hashKey", () => {
  it("is deterministic — same input → same hash", () => {
    expect(hashKey("fofodo_abc_def")).toBe(hashKey("fofodo_abc_def"));
  });

  it("produces a 64-char lowercase hex string (SHA-256)", () => {
    const h = hashKey("fofodo_aabbccddeeff_0123456789");
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches a reference SHA-256 (stable algorithm)", () => {
    const input = "fofodo_deadbeef_cafef00d";
    const expected = createHash("sha256").update(input).digest("hex");
    expect(hashKey(input)).toBe(expected);
  });

  it("different inputs produce different hashes", () => {
    expect(hashKey("fofodo_a_b")).not.toBe(hashKey("fofodo_a_c"));
    expect(hashKey("fofodo_a_b")).not.toBe(hashKey("fofodo_x_b"));
  });

  it("is sensitive to a single-character change (avalanche)", () => {
    const a = hashKey("fofodo_pub_secret0");
    const b = hashKey("fofodo_pub_secret1");
    expect(a).not.toBe(b);
  });

  it("hashes empty string without throwing and to fixed length", () => {
    expect(hashKey("")).toHaveLength(64);
  });
});

describe("key format fofodo_<pub>_<secret>", () => {
  // The format contract createApiKey produces: prefix + 12-hex pub + 48-hex secret.
  const KEY_RE = /^fofodo_[0-9a-f]{12}_[0-9a-f]{48}$/;

  it("a well-formed key matches the expected shape", () => {
    const sample = "fofodo_0123456789ab_" + "a".repeat(48);
    expect(sample).toMatch(KEY_RE);
  });

  it("the public prefix is the first two underscore-joined segments", () => {
    const sample = "fofodo_0123456789ab_" + "f".repeat(48);
    const prefix = sample.split("_").slice(0, 2).join("_");
    expect(prefix).toBe("fofodo_0123456789ab");
  });

  it("keys that do not start with the fofodo_ prefix are rejected by shape", () => {
    expect("nope_0123456789ab_" + "a".repeat(48)).not.toMatch(KEY_RE);
  });
});
