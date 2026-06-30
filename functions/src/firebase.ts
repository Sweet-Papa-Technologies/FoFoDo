import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { CONFIG } from "./config";

if (getApps().length === 0) {
  initializeApp();
}

/**
 * All FoFoDo data lives in the NAMED "fofodo" database, never the shared
 * (default) database that sibling FoFoApps share. The Admin SDK bypasses
 * Security Rules, which is exactly how the WIP-3 server gate works.
 */
export const db = getFirestore(CONFIG.databaseId);
db.settings({ ignoreUndefinedProperties: true });

export { FieldValue };

export const userRef = (uid: string) => db.collection("users").doc(uid);
export const tasksRef = (uid: string) => userRef(uid).collection("tasks");
export const projectsRef = (uid: string) => userRef(uid).collection("projects");
export const hatsRef = (uid: string) => userRef(uid).collection("hats");
export const remindersRef = (uid: string) => userRef(uid).collection("reminders");
export const apiKeysRef = (uid: string) => userRef(uid).collection("apiKeys");
export const eventsRef = (uid: string) => userRef(uid).collection("events");
