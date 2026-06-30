/**
 * Reminder dispatch engine (REQ-REM-03). Runs every 5 minutes (OPEN-QUESTIONS
 * Q6). Finds due, un-fired reminders across all users via a collection-group
 * query, then for each:
 *   • claims a short lease so overlapping runs never double-fire,
 *   • dispatches push (FCM) and/or webhook channels,
 *   • marks fired on success; on failure bumps attempts and retries next tick
 *     until REMINDER_MAX_ATTEMPTS, then gives up and logs to events.
 * Idempotent: a missed window simply fires on the next run (REQ-REM-01/03).
 */
import { createHmac } from "crypto";
import { getMessaging } from "firebase-admin/messaging";
import { db, FieldValue } from "./firebase";
import { CONFIG } from "./config";
import { canClaim, afterFailure } from "./reminders-logic";

const LEASE_MS = 4 * 60 * 1000;

export async function runReminderTick(now = Date.now()): Promise<{ scanned: number; fired: number; failed: number }> {
  const dueSnap = await db
    .collectionGroup("reminders")
    .where("fired", "==", false)
    .where("fireAt", "<=", now)
    .limit(200)
    .get();

  let fired = 0;
  let failed = 0;

  for (const doc of dueSnap.docs) {
    const ref = doc.ref;
    // Claim with a lease (transaction) so a concurrent run can't grab the same one.
    const claimed = await db.runTransaction(async (t) => {
      const fresh = await t.get(ref);
      if (!fresh.exists) return false;
      const d = fresh.data()!;
      if (!canClaim({ fired: d.fired, processingAt: d.processingAt }, now, LEASE_MS)) return false;
      t.update(ref, { processingAt: now });
      return true;
    });
    if (!claimed) continue;

    const data = doc.data();
    const uid = data.ownerUid || ref.parent.parent?.id;
    const taskSnap = uid ? await db.doc(`users/${uid}/tasks/${data.taskId}`).get() : null;
    const task = taskSnap?.exists ? taskSnap.data() : null;
    const payload = {
      reminderId: doc.id,
      taskId: data.taskId,
      title: task?.title || "(task)",
      due: task?.due ?? null,
      firedAt: now,
    };

    try {
      await dispatchChannels(uid, data, payload);
      await ref.update({ fired: true, firedAt: now, processingAt: null });
      fired++;
    } catch (e) {
      const { giveUp, nextAttempts: attempts } = afterFailure(data.attempts || 0, CONFIG.REMINDER_MAX_ATTEMPTS);
      if (giveUp) {
        await ref.update({ fired: true, firedAt: now, processingAt: null, attempts, failed: true });
        if (uid) {
          await db.collection(`users/${uid}/events`).doc().set({
            type: "reminder_failed", taskId: data.taskId, ts: now, error: String((e as Error).message).slice(0, 300),
          });
        }
      } else {
        await ref.update({ attempts, processingAt: null });
      }
      failed++;
    }
  }
  return { scanned: dueSnap.size, fired, failed };
}

async function dispatchChannels(
  uid: string | undefined,
  reminder: FirebaseFirestore.DocumentData,
  payload: Record<string, unknown>
): Promise<void> {
  const channels: string[] = reminder.channels || ["push"];
  const errors: string[] = [];

  if (channels.includes("webhook") && reminder.webhookUrl) {
    try {
      await dispatchWebhook(reminder.webhookUrl, reminder.webhookSecret || null, payload);
    } catch (e) {
      errors.push(`webhook: ${(e as Error).message}`);
    }
  }
  if (channels.includes("push") && uid) {
    try {
      await dispatchPush(uid, payload);
    } catch (e) {
      errors.push(`push: ${(e as Error).message}`);
    }
  }
  if (errors.length) throw new Error(errors.join("; "));
}

async function dispatchWebhook(url: string, secret: string | null, payload: Record<string, unknown>): Promise<void> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "FoFoDo-Reminders/1.0" };
  if (secret) {
    // Signed payload (REQ-REM-02 / NFR-4): HMAC-SHA256 over the raw body.
    headers["x-fofodo-signature"] = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { method: "POST", headers, body, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Best-effort web push to the user's registered FCM tokens. No tokens / denied
 * permission → graceful no-op (REQ-REM-01 AC). */
async function dispatchPush(uid: string, payload: Record<string, unknown>): Promise<void> {
  const userSnap = await db.doc(`users/${uid}`).get();
  const tokens: string[] = userSnap.data()?.fcmTokens || [];
  if (!tokens.length) return; // nothing to deliver to — not an error
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title: "FoFoDo reminder", body: String(payload.title || "Task due") },
    data: { taskId: String(payload.taskId), reminderId: String(payload.reminderId) },
    webpush: { fcmOptions: { link: "/" } },
  });
  // Prune dead tokens so they don't accumulate.
  const dead: string[] = [];
  res.responses.forEach((r, i) => { if (!r.success) dead.push(tokens[i]); });
  if (dead.length) {
    await db.doc(`users/${uid}`).update({ fcmTokens: FieldValue.arrayRemove(...dead) }).catch(() => undefined);
  }
}
