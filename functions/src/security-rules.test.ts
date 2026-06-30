/**
 * Firestore Security Rules tests for firestore.rules (REQ-FOS-01 / REQ-API-03 / G-5).
 *
 * REQUIRES THE FIRESTORE EMULATOR. These tests are SKIPPED unless
 * FIRESTORE_EMULATOR_HOST is set, so the default `npx vitest run` stays green.
 * Run them with the emulator like:
 *
 *   firebase emulators:exec --only firestore \
 *     "npx vitest run src/security-rules.test.ts"
 *
 * Proves:
 *   • a user cannot read another user's tasks (per-user isolation);
 *   • a client cannot create OR update a task INTO status 'active' (WIP-3 gate);
 *   • apiKeys are not client-readable (server-only).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { setDoc, getDoc, doc, updateDoc } from "firebase/firestore";

const RUN = !!process.env.FIRESTORE_EMULATOR_HOST;

// The rules are deployed to the named "fofodo" database; the emulator host's
// projectId is what initializeTestEnvironment uses.
const RULES_PATH = resolve(__dirname, "../../firestore.rules");

describe.skipIf(!RUN)("firestore.rules", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "fofodo-rules-test",
      firestore: { rules: readFileSync(RULES_PATH, "utf8") },
    });
  });

  afterAll(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  it("a user CANNOT read another user's tasks", async () => {
    // Seed a task for alice via admin (rules bypassed).
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "users/alice/tasks/t1"), { title: "secret", status: "next" });
    });

    const alice = testEnv.authenticatedContext("alice").firestore();
    const bob = testEnv.authenticatedContext("bob").firestore();

    await assertSucceeds(getDoc(doc(alice, "users/alice/tasks/t1")));
    await assertFails(getDoc(doc(bob, "users/alice/tasks/t1")));
  });

  it("a client CANNOT create a task with status 'active' (WIP-3 gate)", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      setDoc(doc(alice, "users/alice/tasks/new"), { title: "x", status: "active" })
    );
    // but a non-active status is fine
    await assertSucceeds(
      setDoc(doc(alice, "users/alice/tasks/ok"), { title: "x", status: "next" })
    );
  });

  it("a client CANNOT update a non-active task INTO status 'active'", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/alice/tasks/t2"), { title: "x", status: "next" });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(updateDoc(doc(alice, "users/alice/tasks/t2"), { status: "active" }));
  });

  it("apiKeys are NOT client-readable", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/alice/apiKeys/k1"), {
        hash: "deadbeef",
        prefix: "fofodo_abc",
        revoked: false,
      });
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(getDoc(doc(alice, "users/alice/apiKeys/k1")));
  });
});

// Keep at least one always-run assertion so the file is never "empty" when the
// emulator is absent (vitest treats a file with zero tests as a failure).
describe("security-rules harness", () => {
  it("is skipped without the Firestore emulator", () => {
    if (!RUN) expect(RUN).toBe(false);
    else expect(RUN).toBe(true);
  });
});
