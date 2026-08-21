import { afterEach, describe, expect, it } from "vitest";

import firebaseAdminConfig from "../lib/server/firebase-admin-config.js";

const {
  clearInvalidProxyEnv,
  getFirebaseAdminCredentialConfig,
  getFirebaseAdminEnvValue,
  getFirebaseAdminPrivateKey,
  hasFirebaseAdminConfig,
} = firebaseAdminConfig;

const ENV_KEYS = [
  "FIREBASE_ADMIN_PROJECT_ID",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_ADMIN_CLIENT_EMAIL",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_ADMIN_PRIVATE_KEY",
  "FIREBASE_PRIVATE_KEY",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy",
];

const originalEnv = Object.fromEntries(
  ENV_KEYS.map((key) => [key, process.env[key]])
);

function restoreEnv() {
  ENV_KEYS.forEach((key) => {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
      return;
    }

    process.env[key] = originalEnv[key];
  });
}

function clearFirebaseAdminEnv() {
  ENV_KEYS.forEach((key) => {
    delete process.env[key];
  });
}

describe("shared Firebase Admin config", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("keeps the existing environment variable names and fallback order", () => {
    clearFirebaseAdminEnv();
    process.env.FIREBASE_ADMIN_PROJECT_ID = "admin-project";
    process.env.FIREBASE_PROJECT_ID = "fallback-project";
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL = "admin@example.test";
    process.env.FIREBASE_CLIENT_EMAIL = "fallback@example.test";
    process.env.FIREBASE_ADMIN_PRIVATE_KEY = '"admin\\nkey"';
    process.env.FIREBASE_PRIVATE_KEY = "fallback\\nkey";

    expect(getFirebaseAdminEnvValue("projectId")).toBe("admin-project");
    expect(getFirebaseAdminEnvValue("clientEmail")).toBe("admin@example.test");
    expect(getFirebaseAdminPrivateKey()).toBe("admin\nkey");
    expect(hasFirebaseAdminConfig()).toBe(true);
    expect(getFirebaseAdminCredentialConfig()).toEqual({
      projectId: "admin-project",
      clientEmail: "admin@example.test",
      privateKey: "admin\nkey",
    });
  });

  it("keeps fallback credentials compatible when admin-prefixed names are absent", () => {
    clearFirebaseAdminEnv();
    process.env.FIREBASE_PROJECT_ID = "fallback-project";
    process.env.FIREBASE_CLIENT_EMAIL = "fallback@example.test";
    process.env.FIREBASE_PRIVATE_KEY = "'fallback\\nkey'";

    expect(getFirebaseAdminCredentialConfig()).toEqual({
      projectId: "fallback-project",
      clientEmail: "fallback@example.test",
      privateKey: "fallback\nkey",
    });
  });

  it("keeps optional admin config false when any required credential is missing", () => {
    clearFirebaseAdminEnv();
    process.env.FIREBASE_ADMIN_PROJECT_ID = "admin-project";
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL = "admin@example.test";

    expect(hasFirebaseAdminConfig()).toBe(false);
    expect(() => getFirebaseAdminCredentialConfig()).toThrow(
      "Firebase Admin SDK is not configured."
    );
  });

  it("keeps the existing invalid proxy cleanup behavior", () => {
    clearFirebaseAdminEnv();
    process.env.HTTP_PROXY = "http://127.0.0.1:9";
    process.env.HTTPS_PROXY = "https://127.0.0.1:9";
    process.env.ALL_PROXY = "http://proxy.example.test:8080";

    clearInvalidProxyEnv();

    expect(process.env.HTTP_PROXY).toBeUndefined();
    expect(process.env.HTTPS_PROXY).toBeUndefined();
    expect(process.env.ALL_PROXY).toBe("http://proxy.example.test:8080");
  });
});
