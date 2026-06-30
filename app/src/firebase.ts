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

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

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
