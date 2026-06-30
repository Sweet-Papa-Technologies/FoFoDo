import { defineConfig } from "vitest/config";

/**
 * Default test run excludes the Firestore Security Rules suite: it needs the
 * Firestore emulator (and the @firebase/rules-unit-testing + firebase deps) and
 * would otherwise fail to load. Run it explicitly with the emulator:
 *
 *   firebase emulators:exec --only firestore \
 *     "npx vitest run src/security-rules.test.ts"
 *
 * (The suite itself is also guarded by describe.skipIf(!FIRESTORE_EMULATOR_HOST).)
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/lib/**", "src/security-rules.test.ts"],
  },
});
