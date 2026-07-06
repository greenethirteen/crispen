// Client-side Firebase init for /lab. These values are public by design —
// they identify the project; security comes from server-side ID-token
// verification (lib/auth.ts).

import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

export const FIREBASE_PROJECT_ID = "crispen-pro";

const config = {
  apiKey: "AIzaSyCJteP-_rN_x4f0lDdFazsT3m7uMRn76R8",
  authDomain: "crispen-pro.firebaseapp.com",
  projectId: FIREBASE_PROJECT_ID,
  storageBucket: "crispen-pro.firebasestorage.app",
  messagingSenderId: "609710846208",
  appId: "1:609710846208:web:9f84d6ac675e11d64283e5",
};

export function firebaseAuth() {
  const app = getApps()[0] ?? initializeApp(config);
  return getAuth(app);
}
