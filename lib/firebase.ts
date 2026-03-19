// lib/firebase.ts
import { initializeApp, getApps } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

// Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
};

// Initialize Firebase (prevent duplicate initialization on hot reload)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

// Firebase services
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app);

// Analytics (only runs in the browser, not during server-side rendering)
const analytics =
  typeof window !== "undefined"
    ? isSupported().then((yes) => (yes ? getAnalytics(app) : null))
    : null;

export { app, auth, db, rtdb, analytics };
