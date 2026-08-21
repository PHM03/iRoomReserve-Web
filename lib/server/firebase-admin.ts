import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import firebaseAdminConfig from "@/lib/server/firebase-admin-config";

const {
  clearInvalidProxyEnv,
  getFirebaseAdminCredentialConfig,
  hasFirebaseAdminConfig,
} = firebaseAdminConfig;

export { hasFirebaseAdminConfig };

function getAdminApp() {
  if (!hasFirebaseAdminConfig()) {
    throw new Error(
      "Firebase Admin SDK is not configured. Set FIREBASE_ADMIN_PROJECT_ID/FIREBASE_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL/FIREBASE_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY/FIREBASE_PRIVATE_KEY."
    );
  }

  clearInvalidProxyEnv();

  const existing = getApps().find((app) => app.name === "firebase-admin-server");
  if (existing) {
    return existing;
  }

  return initializeApp(
    {
      credential: cert(getFirebaseAdminCredentialConfig()),
    },
    "firebase-admin-server"
  );
}

export function getOptionalAdminAuth() {
  if (!hasFirebaseAdminConfig()) {
    return null;
  }

  return getAuth(getAdminApp());
}

export function getOptionalAdminDb() {
  if (!hasFirebaseAdminConfig()) {
    return null;
  }

  return getFirestore(getAdminApp());
}
