/**
 * Firebase client init. Points at the ISOLATED named "fofodo" Firestore database
 * (never the shared default DB). Offline persistence enabled for offline-first
 * capture/edit/view (NFR-1). These config values are public identifiers (safe in
 * the bundle, G-5: no secrets client-side).
 */
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getActiveAppName } from "./sessions";

export const firebaseConfig = {
  apiKey: "AIzaSyBgQzrghBw9gjHsF7AbKIyzRjkJdLgJFt0",
  authDomain: "fofoapps-934be.firebaseapp.com",
  projectId: "fofoapps-934be",
  storageBucket: "fofoapps-934be.firebasestorage.app",
  messagingSenderId: "851869525836",
  appId: "1:851869525836:web:ae8ea8e42680ef829bd1e9",
  measurementId: "G-4VEB6F7SRZ",
};

export const DATABASE_ID = "fofodo";
/** Dedicated, isolated bucket for comment attachments (see terraform). */
export const UPLOADS_BUCKET = "fofoapps-934be-fofodo-uploads";

// Multi-account: bind to the active account's "slot". The primary account uses
// the default app (undefined name → backward compatible); extra accounts each
// get their own named app with independent persisted auth + Firestore cache.
const ACTIVE_APP_NAME = getActiveAppName();
export const app = ACTIVE_APP_NAME
  ? initializeApp(firebaseConfig, ACTIVE_APP_NAME)
  : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const storage = getStorage(app, `gs://${UPLOADS_BUCKET}`);

// Named database + offline persistence (multi-tab safe).
export const db = initializeFirestore(
  app,
  { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) },
  DATABASE_ID
);

// Feature flags (REQ-OSS-03) — default OFF; hosted build sets VITE_* at build time.
export const FLAGS = {
  HOSTED: import.meta.env.VITE_HOSTED === "1",
  ADS_ENABLED: import.meta.env.VITE_ADS_ENABLED === "1",
  FFN_AUTH_ENABLED: import.meta.env.VITE_FFN_AUTH_ENABLED === "1",
};
