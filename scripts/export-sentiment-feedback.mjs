import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldPath, getFirestore } from "firebase-admin/firestore";

import firebaseAdminConfig from "../lib/server/firebase-admin-config.js";

const {
  clearInvalidProxyEnv,
  getFirebaseAdminCredentialConfig,
  hasFirebaseAdminConfig,
} = firebaseAdminConfig;

const DEFAULT_OUTPUT_PATH = "data/sentiment-evaluation.csv";
const DEFAULT_PII_REVIEW_PATH = "reports/sentiment-evaluation-pii-review.json";
const SCRIPT_FILE_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIRECTORY = path.dirname(SCRIPT_FILE_PATH);
const TEXT_FIELD_PRIORITY = Object.freeze([
  "feedback_text",
  "feedbackText",
  "text",
  "message",
]);

function loadLocalEnvFile() {
  const envPath = path.resolve(SCRIPT_DIRECTORY, "../.env.local");
  let envContent;

  try {
    envContent = readFileSync(envPath, "utf-8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return;
    }

    throw error;
  }

  const env = Object.fromEntries(
    envContent
      .split("\n")
      .filter((line) => line.includes("=") && !line.startsWith("#"))
      .map((line) => {
        const eqIdx = line.indexOf("=");
        const key = line.slice(0, eqIdx).trim();
        let value = line.slice(eqIdx + 1).trim();
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        return [key, value];
      })
  );

  Object.entries(env).forEach(([key, value]) => {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

loadLocalEnvFile();

const PII_PATTERNS = Object.freeze([
  {
    type: "email",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  },
  {
    type: "phone",
    pattern: /(?:\+?\d[\s().-]*){10,}/,
  },
  {
    type: "student_number",
    pattern: /\b(?:student\s*(?:no\.?|number|id)?\s*[:#-]?\s*)?\d{2,4}[-\s]?\d{3,6}[-\s]?\d{0,4}\b/i,
  },
  {
    type: "class_or_section",
    pattern: /\b(?:section|sec\.?|class|grade|yr\.?|year)\s+[-A-Z0-9]{1,12}\b/i,
  },
  {
    type: "possible_person_name",
    pattern: /\b(?:sir|ma'?am|ms\.?|mrs\.?|mr\.?|prof\.?|teacher|student)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/,
  },
]);

function printUsage() {
  console.log(`Usage:
  npm run export:sentiment-feedback -- [--out data/sentiment-evaluation.csv] [--pii-report reports/sentiment-evaluation-pii-review.json] [--fixture local-feedback.json] [--dry-run]

This local/admin-only utility reads Firestore collection "feedback" and writes only:
  text,humanLabel

It never writes to Firestore and never generates human labels.

Use --fixture with --dry-run for local verification that must not contact Firestore.`);
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    dryRun: false,
    outputPath: DEFAULT_OUTPUT_PATH,
    piiReviewPath: DEFAULT_PII_REVIEW_PATH,
    fixturePath: null,
  };

  while (args.length > 0) {
    const arg = args.shift();

    if (arg === "--help" || arg === "-h") {
      return { ...options, help: true };
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--out") {
      options.outputPath = args.shift() ?? "";
      continue;
    }

    if (arg === "--pii-report") {
      options.piiReviewPath = args.shift() ?? "";
      continue;
    }

    if (arg === "--fixture") {
      options.fixturePath = args.shift() ?? "";
      continue;
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  if (!options.outputPath) {
    throw new Error("--out requires a path.");
  }

  if (!options.piiReviewPath) {
    throw new Error("--pii-report requires a path.");
  }

  if (options.fixturePath === "") {
    throw new Error("--fixture requires a path.");
  }

  return options;
}

function getAdminApp() {
  if (!hasFirebaseAdminConfig()) {
    throw new Error(
      "Firebase Admin SDK is not configured. Set the existing FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY environment variables before running this local exporter."
    );
  }

  clearInvalidProxyEnv();

  const existing = getApps().find((app) => app.name === "sentiment-exporter");
  if (existing) {
    return existing;
  }

  return initializeApp(
    {
      credential: cert(getFirebaseAdminCredentialConfig()),
    },
    "sentiment-exporter"
  );
}

function getFeedbackText(data) {
  for (const field of TEXT_FIELD_PRIORITY) {
    const value = data[field];

    if (typeof value === "string") {
      const text = value.replace(/\s+/g, " ").trim();

      if (text) {
        return text;
      }
    }
  }

  return "";
}

function detectPiiFlags(text) {
  return PII_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ type }) => type
  );
}

function escapeCsvValue(value) {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildCsvRows(texts) {
  return [
    "text,humanLabel",
    ...texts.map((text) => `${escapeCsvValue(text)},`),
  ].join("\n");
}

function getParentDirectory(filePath) {
  return path.dirname(path.resolve(filePath));
}

async function ensureParentDirectory(filePath) {
  await mkdir(getParentDirectory(filePath), { recursive: true });
}

async function writeJson(filePath, value) {
  await ensureParentDirectory(filePath);
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function buildExportArtifactsFromDocuments(documents, options) {
  const rows = [];
  const seenTexts = new Set();
  let skippedEmptyOrNonStringFeedback = 0;
  let duplicateFeedbackTextsSkipped = 0;

  documents.forEach((documentData) => {
    const text = getFeedbackText(documentData);

    if (!text) {
      skippedEmptyOrNonStringFeedback += 1;
      return;
    }

    if (seenTexts.has(text)) {
      duplicateFeedbackTextsSkipped += 1;
      return;
    }

    seenTexts.add(text);
    rows.push({
      rowNumber: rows.length + 2,
      text,
      piiFlags: detectPiiFlags(text),
    });
  });

  const flaggedRows = rows
    .filter((row) => row.piiFlags.length > 0)
    .map((row) => ({
      rowNumber: row.rowNumber,
      flags: row.piiFlags,
    }));

  const summary = {
    firestoreDocumentsInspected: documents.length,
    nonEmptyFeedbackTextsExported: rows.length,
    skippedEmptyOrNonStringFeedback,
    duplicateFeedbackTextsSkipped,
    skipped: skippedEmptyOrNonStringFeedback + duplicateFeedbackTextsSkipped,
    flaggedForManualPiiReview: flaggedRows.length,
    outputPath: options.outputPath,
    piiReviewPath: options.piiReviewPath,
    dryRun: options.dryRun,
    fixturePath: options.fixturePath,
    humanLabelsGenerated: false,
    firestoreDocumentsModified: false,
  };

  return {
    csv: `${buildCsvRows(rows.map((row) => row.text))}\n`,
    piiReview: {
      ...summary,
      flaggedRows,
      note: "Flagged rows include row numbers and flag types only. Review the CSV locally before human labeling.",
    },
    summary,
  };
}

async function loadFixtureDocuments(fixturePath) {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));

  if (Array.isArray(fixture)) {
    return fixture;
  }

  if (fixture && typeof fixture === "object" && Array.isArray(fixture.docs)) {
    return fixture.docs;
  }

  throw new Error("Fixture must be a JSON array or an object with a docs array.");
}

async function loadFirestoreDocuments() {
  const db = getFirestore(getAdminApp());
  const snapshot = await db
    .collection("feedback")
    .orderBy(FieldPath.documentId())
    .get();

  return snapshot.docs.map((documentSnapshot) => documentSnapshot.data());
}

async function exportFeedback(options) {
  const documents = options.fixturePath
    ? await loadFixtureDocuments(options.fixturePath)
    : await loadFirestoreDocuments();
  const artifacts = buildExportArtifactsFromDocuments(documents, options);

  if (!options.dryRun) {
    await ensureParentDirectory(options.outputPath);
    await writeFile(options.outputPath, artifacts.csv);
    await writeJson(options.piiReviewPath, artifacts.piiReview);
  }

  return artifacts.summary;
}

function redactKnownCredentialValues(message) {
  const credentialEnvKeys = [
    "FIREBASE_ADMIN_PROJECT_ID",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_ADMIN_CLIENT_EMAIL",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_ADMIN_PRIVATE_KEY",
    "FIREBASE_PRIVATE_KEY",
  ];
  const withoutPrivateKeyBlock = message.replace(
    /-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g,
    "[redacted-private-key]"
  );

  return credentialEnvKeys.reduce((redactedMessage, key) => {
    const value = process.env[key];

    if (!value || value.length < 4) {
      return redactedMessage;
    }

    return redactedMessage.split(value).join("[redacted]");
  }, withoutPrivateKeyBlock);
}

function getSafeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error);

  return redactKnownCredentialValues(message);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  const summary = await exportFeedback(options);

  console.log("Firestore feedback export summary:");
  console.log(`Documents inspected: ${summary.firestoreDocumentsInspected}`);
  console.log(
    `Non-empty feedback texts exported: ${summary.nonEmptyFeedbackTextsExported}`
  );
  console.log(
    `Skipped empty/non-string feedback: ${summary.skippedEmptyOrNonStringFeedback}`
  );
  console.log(
    `Skipped duplicate feedback text: ${summary.duplicateFeedbackTextsSkipped}`
  );
  console.log(
    `Flagged for manual PII review: ${summary.flaggedForManualPiiReview}`
  );
  console.log(`Output path: ${summary.outputPath}`);
  console.log(`PII review report: ${summary.piiReviewPath}`);
  console.log("Human labels generated: no");
  console.log("Firestore documents modified: no");

  if (summary.dryRun) {
    console.log("Dry run only: no CSV or PII report was written.");
  }

  if (summary.fixturePath) {
    console.log("Fixture mode: Firestore was not contacted.");
  }
}

if (process.argv[1] && SCRIPT_FILE_PATH === process.argv[1]) {
  main().catch((error) => {
    console.error(getSafeErrorMessage(error));
    process.exitCode = 1;
  });
}

export {
  buildCsvRows,
  buildExportArtifactsFromDocuments,
  detectPiiFlags,
  exportFeedback,
  getFeedbackText,
  parseArgs,
};
