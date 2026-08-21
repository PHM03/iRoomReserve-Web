import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const VALID_LABELS = Object.freeze(["positive", "neutral", "negative"]);
const THREE_CLASS_LABEL_BY_FIVE_CLASS_LABEL = Object.freeze({
  very_positive: "positive",
  positive: "positive",
  neutral: "neutral",
  negative: "negative",
  very_negative: "negative",
});

function printUsage() {
  console.log(`Usage:
  npm run evaluate:sentiment -- <dataset.csv|dataset.json> [--out report.json]

Dataset columns/fields:
  text,humanLabel

Allowed humanLabel values:
  positive, neutral, negative

5-class to 3-class evaluation mapping:
  very_positive -> positive
  positive      -> positive
  neutral       -> neutral
  negative      -> negative
  very_negative -> negative`);
}

function parseArgs(argv) {
  const args = [...argv];
  let datasetPath = null;
  let outputPath = null;

  while (args.length > 0) {
    const arg = args.shift();

    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }

    if (arg === "--out") {
      outputPath = args.shift() ?? null;
      continue;
    }

    if (!datasetPath) {
      datasetPath = arg;
      continue;
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  return { datasetPath, outputPath };
}

function parseCsvLine(line) {
  const values = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      currentValue += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(currentValue);
      currentValue = "";
      continue;
    }

    currentValue += char;
  }

  values.push(currentValue);
  return values.map((value) => value.trim());
}

function parseCsv(content) {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const record = {};

    headers.forEach((header, headerIndex) => {
      record[header] = values[headerIndex] ?? "";
    });

    return { ...record, rowNumber: index + 2 };
  });
}

async function loadDataset(datasetPath) {
  const content = await readFile(datasetPath, "utf8");
  const extension = path.extname(datasetPath).toLowerCase();

  if (extension === ".json") {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error("JSON datasets must be an array of records.");
    }

    return parsed.map((record, index) => ({ ...record, rowNumber: index + 1 }));
  }

  if (extension === ".csv") {
    return parseCsv(content);
  }

  throw new Error("Unsupported dataset format. Use .csv or .json.");
}

function normalizeHumanLabel(value, rowNumber) {
  const label = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (!VALID_LABELS.includes(label)) {
    throw new Error(
      `Invalid humanLabel at row ${rowNumber}: ${JSON.stringify(value)}`
    );
  }

  return label;
}

function normalizeText(value, rowNumber) {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    throw new Error(`Missing text at row ${rowNumber}.`);
  }

  return text;
}

function createEmptyConfusionMatrix() {
  return Object.fromEntries(
    VALID_LABELS.map((actualLabel) => [
      actualLabel,
      Object.fromEntries(VALID_LABELS.map((predictedLabel) => [predictedLabel, 0])),
    ])
  );
}

function safeDivide(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}

function round(value, places = 4) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

async function evaluate(records) {
  const { analyzeSentiment, getSentimentLabel } = await import(
    "../lib/ai/sentiment.js"
  );
  const confusionMatrix = createEmptyConfusionMatrix();

  const results = records.map((record) => {
    const text = normalizeText(record.text, record.rowNumber);
    const humanLabel = normalizeHumanLabel(record.humanLabel, record.rowNumber);
    const sentiment = analyzeSentiment(text);
    const systemFiveClassLabel = getSentimentLabel(sentiment.compound);
    const prediction = THREE_CLASS_LABEL_BY_FIVE_CLASS_LABEL[systemFiveClassLabel];
    const correct = prediction === humanLabel;

    confusionMatrix[humanLabel][prediction] += 1;

    return {
      rowNumber: record.rowNumber,
      text,
      humanLabel,
      compoundScore: sentiment.compound,
      systemFiveClassLabel,
      prediction,
      correct,
    };
  });

  const correctPredictions = results.filter((result) => result.correct).length;
  const totalSamples = results.length;
  const accuracy = safeDivide(correctPredictions, totalSamples);

  const perClassMetrics = Object.fromEntries(
    VALID_LABELS.map((label) => {
      const truePositive = confusionMatrix[label][label];
      const falsePositive = VALID_LABELS.reduce(
        (sum, actualLabel) =>
          actualLabel === label ? sum : sum + confusionMatrix[actualLabel][label],
        0
      );
      const falseNegative = VALID_LABELS.reduce(
        (sum, predictedLabel) =>
          predictedLabel === label
            ? sum
            : sum + confusionMatrix[label][predictedLabel],
        0
      );
      const precision = safeDivide(truePositive, truePositive + falsePositive);
      const recall = safeDivide(truePositive, truePositive + falseNegative);
      const f1 = safeDivide(2 * precision * recall, precision + recall);

      return [
        label,
        {
          precision: round(precision),
          recall: round(recall),
          f1: round(f1),
          support: VALID_LABELS.reduce(
            (sum, predictedLabel) => sum + confusionMatrix[label][predictedLabel],
            0
          ),
        },
      ];
    })
  );

  return {
    totalSamples,
    correctPredictions,
    incorrectPredictions: totalSamples - correctPredictions,
    accuracy: round(accuracy),
    accuracyPercentage: round(accuracy * 100, 2),
    targetAccuracyPercentage: 85,
    targetAchieved: accuracy >= 0.85,
    labelMapping: THREE_CLASS_LABEL_BY_FIVE_CLASS_LABEL,
    confusionMatrix,
    perClassMetrics,
    misclassifiedExamples: results.filter((result) => !result.correct),
    results,
  };
}

function printConfusionMatrix(confusionMatrix) {
  console.log("\nConfusion matrix (rows = human label, columns = prediction):");
  console.log("human\\predicted,positive,neutral,negative");
  VALID_LABELS.forEach((label) => {
    console.log(
      [
        label,
        confusionMatrix[label].positive,
        confusionMatrix[label].neutral,
        confusionMatrix[label].negative,
      ].join(",")
    );
  });
}

function printMetrics(report) {
  console.log("\nPer-class metrics:");
  VALID_LABELS.forEach((label) => {
    const metrics = report.perClassMetrics[label];
    console.log(
      `${label}: precision=${metrics.precision}, recall=${metrics.recall}, f1=${metrics.f1}, support=${metrics.support}`
    );
  });
}

function printMisclassifications(report) {
  console.log("\nMisclassified examples:");

  if (report.misclassifiedExamples.length === 0) {
    console.log("None.");
    return;
  }

  report.misclassifiedExamples.forEach((example) => {
    console.log(
      `Row ${example.rowNumber}: human=${example.humanLabel}, predicted=${example.prediction}, fiveClass=${example.systemFiveClassLabel}, compound=${example.compoundScore}`
    );
    console.log(`  ${example.text}`);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  if (!args.datasetPath) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const records = await loadDataset(args.datasetPath);

  if (records.length === 0) {
    console.error(
      "No labeled samples found. Add real feedback rows with text and humanLabel before calculating accuracy."
    );
    process.exitCode = 1;
    return;
  }

  const report = await evaluate(records);

  console.log(`Dataset: ${args.datasetPath}`);
  console.log(`Total samples: ${report.totalSamples}`);
  console.log(`Correct predictions: ${report.correctPredictions}`);
  console.log(`Incorrect predictions: ${report.incorrectPredictions}`);
  console.log(`Accuracy: ${report.accuracyPercentage}%`);
  console.log(
    `>=85% target achieved: ${report.targetAchieved ? "yes" : "no"}`
  );
  printConfusionMatrix(report.confusionMatrix);
  printMetrics(report);
  printMisclassifications(report);

  if (args.outputPath) {
    await mkdir(path.dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`\nWrote report: ${args.outputPath}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
