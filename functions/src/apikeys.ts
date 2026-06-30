/**
 * API key lifecycle (REQ-API-03): create / list / revoke.
 * Keys are shown ONCE at creation and stored only as a SHA-256 hash. The hash
 * lives under users/{uid}/apiKeys which Security Rules make entirely
 * server-only, so the client can never read it (G-5).
 */
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { apiKeysRef, db, FieldValue } from "./firebase";

const PREFIX = "fofodo";

export function hashKey(fullKey: string): string {
  return createHash("sha256").update(fullKey).digest("hex");
}

export interface NewKey {
  id: string;
  name: string;
  prefix: string;
  plaintext: string; // returned exactly once
  createdAt: number;
}

export async function createApiKey(uid: string, name: string): Promise<NewKey> {
  const pub = randomBytes(6).toString("hex"); // 12-char public prefix
  const secret = randomBytes(24).toString("hex");
  const plaintext = `${PREFIX}_${pub}_${secret}`;
  const ref = apiKeysRef(uid).doc();
  const now = Date.now();
  await ref.set({
    name: name || "API key",
    hash: hashKey(plaintext),
    prefix: `${PREFIX}_${pub}`,
    ownerUid: uid,
    createdAt: now,
    lastUsedAt: null,
    revoked: false,
  });
  return { id: ref.id, name, prefix: `${PREFIX}_${pub}`, plaintext, createdAt: now };
}

export async function listApiKeys(uid: string) {
  const snap = await apiKeysRef(uid).orderBy("createdAt", "desc").get();
  // Never return the hash.
  return snap.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id, name: x.name, prefix: x.prefix,
      createdAt: x.createdAt, lastUsedAt: x.lastUsedAt, revoked: x.revoked,
    };
  });
}

export async function revokeApiKey(uid: string, keyId: string): Promise<boolean> {
  const ref = apiKeysRef(uid).doc(keyId);
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.update({ revoked: true });
  return true;
}

/**
 * Resolve a presented API key to its owner uid, or null. Uses a collection-group
 * lookup by hash so we never need the uid up front. Revoked keys are rejected
 * immediately (REQ-API-03 AC). Updates lastUsedAt opportunistically.
 */
export async function resolveApiKey(fullKey: string): Promise<{ uid: string; keyId: string } | null> {
  if (!fullKey || !fullKey.startsWith(`${PREFIX}_`)) return null;
  const h = hashKey(fullKey);
  const snap = await db.collectionGroup("apiKeys").where("hash", "==", h).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data();
  if (data.revoked) return null;
  // Constant-time compare as defence in depth against hash truncation bugs.
  const ok = safeEqualHex(h, data.hash);
  if (!ok) return null;
  doc.ref.update({ lastUsedAt: Date.now() }).catch(() => undefined);
  return { uid: data.ownerUid, keyId: doc.id };
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    return ab.length === bb.length && timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/** Touch a non-blocking marker; used by quota module. */
export const apiKeyTouch = () => FieldValue.serverTimestamp();
