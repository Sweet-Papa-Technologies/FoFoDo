/**
 * Request auth (REQ-API-02): two modes that resolve to the SAME per-user
 * authorization —
 *   1. Firebase ID token  (Authorization: Bearer <token>) — first-party app
 *   2. API key            (X-API-Key or Authorization: Bearer fofodo_...) — API/MCP/FOREMAN
 *
 * Plus optional hosted quota enforcement (REQ-API-04 / REQ-HOST-02).
 */
import type { Request } from "express";
import { getAuth } from "firebase-admin/auth";
import { db, FieldValue } from "./firebase";
import { resolveApiKey } from "./apikeys";
import { CONFIG } from "./config";
import { dayKey, minuteKey, overLimit, secondsUntilUtcMidnight } from "./quota-logic";

export interface Principal {
  uid: string;
  via: "idToken" | "apiKey";
  keyId?: string;
}

export class AuthError extends Error {
  constructor(public status: number, message: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

export function extractBearer(req: Request): string | null {
  const h = req.header("authorization") || req.header("Authorization");
  if (h && h.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return null;
}

export function extractApiKey(req: Request): string | null {
  const x = req.header("x-api-key") || req.header("X-API-Key");
  if (x) return x.trim();
  const bearer = extractBearer(req);
  if (bearer && bearer.startsWith("fofodo_")) return bearer;
  return null;
}

export async function authenticate(req: Request): Promise<Principal> {
  // API key path (also covers Bearer fofodo_...).
  const apiKey = extractApiKey(req);
  if (apiKey) {
    const r = await resolveApiKey(apiKey);
    if (!r) throw new AuthError(401, "Invalid or revoked API key.");
    await enforceQuota(r.uid, r.keyId);
    return { uid: r.uid, via: "apiKey", keyId: r.keyId };
  }
  // Firebase ID token path.
  const bearer = extractBearer(req);
  if (bearer) {
    try {
      const decoded = await getAuth().verifyIdToken(bearer);
      return { uid: decoded.uid, via: "idToken" };
    } catch {
      throw new AuthError(401, "Invalid Firebase ID token.");
    }
  }
  throw new AuthError(401, "Missing credentials. Provide a Firebase ID token or an API key.");
}

/**
 * Hosted quota: per-key per-minute + per-day caps tracked in Firestore
 * (usage/{uid}/keys/{keyId}/...). OSS build (QUOTAS_ENABLED=false) is unlimited.
 * Over-limit → 429 with reset info (REQ-API-04 AC).
 */
async function enforceQuota(uid: string, keyId: string): Promise<void> {
  if (!CONFIG.QUOTAS_ENABLED) return;
  const now = new Date();
  const day = dayKey(now);
  const minute = minuteKey(now);
  const dayRef = db.doc(`usage/${uid}/keys/${keyId}/${day}`);
  const minRef = db.doc(`usage/${uid}/keys/${keyId}/min_${minute}`);

  const [dayCount, minCount] = await db.runTransaction(async (t) => {
    const [d, m] = await Promise.all([t.get(dayRef), t.get(minRef)]);
    const dc = (d.exists ? (d.data()!.count as number) : 0) + 1;
    const mc = (m.exists ? (m.data()!.count as number) : 0) + 1;
    t.set(dayRef, { count: dc, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    t.set(minRef, { count: mc, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return [dc, mc];
  });

  if (overLimit(minCount, CONFIG.QUOTA_PER_MINUTE)) {
    throw new AuthError(429, "Per-minute rate limit exceeded.", {
      limit: CONFIG.QUOTA_PER_MINUTE, scope: "minute", resetSeconds: 60 - now.getUTCSeconds(),
    });
  }
  if (overLimit(dayCount, CONFIG.QUOTA_PER_DAY)) {
    throw new AuthError(429, "Daily quota exceeded.", {
      limit: CONFIG.QUOTA_PER_DAY, scope: "day", resetSeconds: secondsUntilUtcMidnight(now),
    });
  }
}
