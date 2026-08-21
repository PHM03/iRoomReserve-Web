const FIREBASE_ADMIN_ENV_ALIASES = Object.freeze({
  projectId: ["FIREBASE_ADMIN_PROJECT_ID", "FIREBASE_PROJECT_ID"],
  clientEmail: ["FIREBASE_ADMIN_CLIENT_EMAIL", "FIREBASE_CLIENT_EMAIL"],
  privateKey: ["FIREBASE_ADMIN_PRIVATE_KEY", "FIREBASE_PRIVATE_KEY"],
});

function clearInvalidProxyEnv() {
  [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
  ].forEach((key) => {
    const value = process.env[key]?.trim();

    if (
      value === "http://127.0.0.1:9" ||
      value === "https://127.0.0.1:9"
    ) {
      delete process.env[key];
    }
  });
}

function getFirebaseAdminEnvValue(key) {
  const matchedKey = FIREBASE_ADMIN_ENV_ALIASES[key]?.find((envKey) =>
    process.env[envKey]?.trim()
  );

  return matchedKey ? process.env[matchedKey]?.trim() : undefined;
}

function getFirebaseAdminPrivateKey() {
  const rawValue = getFirebaseAdminEnvValue("privateKey");

  if (!rawValue) {
    return undefined;
  }

  const unwrappedValue =
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
      ? rawValue.slice(1, -1)
      : rawValue;

  return unwrappedValue.replace(/\\n/g, "\n");
}

function hasFirebaseAdminConfig() {
  return Boolean(
    getFirebaseAdminEnvValue("projectId") &&
      getFirebaseAdminEnvValue("clientEmail") &&
      getFirebaseAdminPrivateKey()
  );
}

function getFirebaseAdminCredentialConfig() {
  if (!hasFirebaseAdminConfig()) {
    throw new Error(
      "Firebase Admin SDK is not configured. Set FIREBASE_ADMIN_PROJECT_ID/FIREBASE_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL/FIREBASE_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY/FIREBASE_PRIVATE_KEY."
    );
  }

  return {
    projectId: getFirebaseAdminEnvValue("projectId"),
    clientEmail: getFirebaseAdminEnvValue("clientEmail"),
    privateKey: getFirebaseAdminPrivateKey(),
  };
}

module.exports = {
  clearInvalidProxyEnv,
  getFirebaseAdminCredentialConfig,
  getFirebaseAdminEnvValue,
  getFirebaseAdminPrivateKey,
  hasFirebaseAdminConfig,
};
