import vader from "vader-sentiment";

export const DEFAULT_SENTIMENT_ANALYSIS = Object.freeze({
  compound: 0,
  positive: 0,
  neutral: 1,
  negative: 0,
});

const POSITIVE_THRESHOLD = 0.05;
const NEGATIVE_THRESHOLD = -0.05;

function normalizeText(text) {
  return typeof text === "string" ? text.trim() : "";
}

function clampScore(score, min = 0, max = 1) {
  if (!Number.isFinite(score)) {
    return min;
  }

  return Math.max(min, Math.min(max, score));
}

/**
 * VADER is a pure JavaScript library, so this helper is safe to reuse
 * from Next.js client components, server routes, and Firebase helpers.
 */
export function analyzeSentiment(text) {
  const normalizedText = normalizeText(text);

  if (!normalizedText) {
    return {
      ...DEFAULT_SENTIMENT_ANALYSIS
    };
  }

  const scores =
    vader.SentimentIntensityAnalyzer.polarity_scores(normalizedText);

  return {
    compound: clampScore(scores.compound, -1, 1),
    positive: clampScore(scores.pos),
    neutral: clampScore(scores.neu),
    negative: clampScore(scores.neg),
  };
}

export function averageSentimentScores(scores) {
  const validScores = Array.isArray(scores)
    ? scores.filter((score) => Number.isFinite(score))
    : [];

  if (validScores.length === 0) {
    return 0;
  }

  const total = validScores.reduce(
    (sum, score) => sum + clampScore(score, -1, 1),
    0
  );

  return total / validScores.length;
}

export function getSentimentLabel(score) {
  if (!Number.isFinite(score)) {
    return "neutral";
  }

  if (score >= POSITIVE_THRESHOLD) {
    return "positive";
  }

  if (score <= NEGATIVE_THRESHOLD) {
    return "negative";
  }

  return "neutral";
}
