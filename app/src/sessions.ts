/**
 * Multi-account session switching (like Google / YouTube profile switching).
 *
 * Firebase Auth keeps a single `currentUser` per *app instance*, but each NAMED
 * Firebase app persists its own signed-in user independently (persistence is
 * keyed by apiKey + app name). We exploit that: every account gets its own
 * "slot" = a Firebase app name with its own persisted session. Only the ACTIVE
 * slot's app is initialized per page load (see firebase.ts), so switching simply
 * changes which slot is active and reloads — the target slot's persisted session
 * restores with NO re-login required.
 *
 * The first/primary account keeps using the Firebase DEFAULT app (appName = null)
 * so existing single-account users are completely unaffected.
 */
import { reactive } from "vue";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import { auth, firebaseConfig } from "./firebase";

export interface Account {
  id: string;            // stable slot id; also the Firebase app name for non-primary
  appName: string | null; // null → Firebase default app (primary, backward compatible)
  uid: string | null;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  addedAt: number;
}

const ACCOUNTS_KEY = "fofo.accounts";
const ACTIVE_KEY = "fofo.activeAccountId";
export const PRIMARY_ID = "primary";

function readAccounts(): Account[] {
  try {
    const s = localStorage.getItem(ACCOUNTS_KEY);
    const parsed = s ? JSON.parse(s) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function readActiveId(): string {
  try {
    return localStorage.getItem(ACTIVE_KEY) || PRIMARY_ID;
  } catch {
    return PRIMARY_ID;
  }
}

// Reactive mirror for the UI; the localStorage copy is the source of truth read
// by getActiveAppName() at init time (before Vue is mounted).
export const sessions = reactive({
  accounts: readAccounts() as Account[],
  activeId: readActiveId(),
});

function persist() {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(sessions.accounts));
    localStorage.setItem(ACTIVE_KEY, sessions.activeId);
  } catch { /* ignore quota / private-mode errors */ }
}

/**
 * Which Firebase app name the active account maps to. Called by firebase.ts at
 * module-init to bind auth/db/storage to the right slot. Reads localStorage
 * directly so it works before the Vue app mounts. undefined → default app.
 */
export function getActiveAppName(): string | undefined {
  const id = readActiveId();
  if (id === PRIMARY_ID) return undefined;
  const acc = readAccounts().find((a) => a.id === id);
  return acc?.appName || undefined;
}

/** True when more than one account is (or is being) tracked on this device. */
export function hasMultipleAccounts(): boolean {
  return sessions.accounts.length > 1;
}

export function activeAccount(): Account | null {
  return sessions.accounts.find((a) => a.id === sessions.activeId) || null;
}

/**
 * Record the currently signed-in user against the active slot. Called from the
 * auth-state watcher whenever a user is present. Creates the slot entry if it
 * doesn't exist yet (e.g. first sign-in for a fresh slot, or the very first
 * sign-in of a pre-existing single-account user → becomes "primary").
 */
export function recordActiveUser(user: {
  uid: string; email: string | null; displayName: string | null; photoURL: string | null;
}): void {
  const id = sessions.activeId;
  const appName = id === PRIMARY_ID ? null : id;
  // Dedupe: if another slot already holds this uid, drop it so the same account
  // never appears twice in the switcher.
  sessions.accounts = sessions.accounts.filter((a) => a.id === id || a.uid !== user.uid);
  const existing = sessions.accounts.find((a) => a.id === id);
  const next: Account = {
    id, appName,
    uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL,
    addedAt: existing?.addedAt || Date.now(),
  };
  if (existing) Object.assign(existing, next);
  else sessions.accounts.push(next);
  persist();
}

/** Start adding another account: create a fresh slot, make it active, reload.
 * The new slot has no persisted session, so the app lands on the Login screen. */
export function addAccount(): void {
  const id = `acct-${Date.now().toString(36)}`;
  sessions.accounts.push({ id, appName: id, uid: null, email: null, displayName: null, photoURL: null, addedAt: Date.now() });
  sessions.activeId = id;
  persist();
  location.reload();
}

/** Switch to an already-signed-in account with no re-authentication. */
export function switchAccount(id: string): void {
  if (id === sessions.activeId) return;
  if (!sessions.accounts.some((a) => a.id === id)) return;
  sessions.activeId = id;
  persist();
  location.reload();
}

/** Sign out the ACTIVE account, drop it from the device, and switch to another
 * remembered account if one exists (else fall back to the primary/login). */
export async function signOutActive(): Promise<void> {
  const id = sessions.activeId;
  await signOut(auth).catch(() => undefined); // clears this slot's persisted session
  sessions.accounts = sessions.accounts.filter((a) => a.id !== id);
  const next = sessions.accounts[0];
  sessions.activeId = next ? next.id : PRIMARY_ID;
  persist();
  location.reload();
}

/** Remove a NON-active remembered account from this device, clearing its
 * persisted Firebase session too. No reload (the active account is untouched). */
export async function removeAccount(id: string): Promise<void> {
  if (id === sessions.activeId) return signOutActive();
  const acc = sessions.accounts.find((a) => a.id === id);
  if (acc?.appName) {
    try {
      const tmp = initializeApp(firebaseConfig, acc.appName);
      const tmpAuth = getAuth(tmp);
      // Wait for the persisted user to restore, then sign out to clear storage.
      await new Promise<void>((resolve) => {
        const unsub = onAuthStateChanged(tmpAuth, () => { unsub(); resolve(); });
      });
      await signOut(tmpAuth).catch(() => undefined);
      await deleteApp(tmp).catch(() => undefined);
    } catch { /* best-effort cleanup */ }
  }
  sessions.accounts = sessions.accounts.filter((a) => a.id !== id);
  persist();
}
