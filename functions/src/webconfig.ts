/** Public Firebase web config (safe to expose — these are public identifiers).
 * Used by the OAuth consent screen to sign the user in with Firebase Auth. */
export const firebaseWebConfig = {
  apiKey: process.env.FOFODO_WEB_API_KEY || "AIzaSyBgQzrghBw9gjHsF7AbKIyzRjkJdLgJFt0",
  authDomain: "fofoapps-934be.firebaseapp.com",
  projectId: "fofoapps-934be",
  storageBucket: "fofoapps-934be.firebasestorage.app",
  messagingSenderId: "851869525836",
  appId: "1:851869525836:web:ae8ea8e42680ef829bd1e9",
};
