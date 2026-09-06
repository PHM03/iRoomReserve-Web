import {
  analyzeSentiment,
  getSentimentLabel,
  isInsufficientContextResponse,
} from "./sentiment.js";

const CONTEXT_NEGATIVE_EVIDENCE_THRESHOLD = 0.25;
const CONTEXT_POSITIVE_EVIDENCE_THRESHOLD = 0.05;

const CONTRAST_WORD_PATTERN = /\b(?:but|however|although|though|except|yet)\b/i;
const LEADING_RESPONSE_PATTERN = /^(yes|no)\b\s*(?:[,;:]\s*|\s+)(.+)$/i;
const EXPECTATION_PATTERN = /\b(?:i\s+expected\s+(?:(?:much|far|a\s+lot)\s+)?(?:better|more)|i\s+thought\s+it\s+would\s+be\s+better|could\s+have\s+been\s+better)\b/i;
const NOT_BAD_PATTERN = /^(?:(?:that|it|the\s+room|room)\s+)?(?:(?:is|was|were|are|be)\s+)?(?:not|isn't|wasn't|weren't|aren't|don't|doesn't|didn't)\s+(?:too\s+)?bad(?:\s+at\s+all)?[.!?\s]*$/i;
const NEGATION_SCOPE_PATTERN = /(?:\b(?:not|isn't|wasn't|aren't|weren't|don't|doesn't|didn't)\b|\bno\s+longer\b)(?:\s+(?:very|really|extremely|slightly|too|actually|quite|a\s+little)\s*)?\s*$/i;

const POSITIVE_CONTEXT_TERMS = new Set([
  "available",
  "bright",
  "clean",
  "comfortable",
  "excellent",
  "fine",
  "good",
  "quiet",
  "reliable",
  "spacious",
  "stable",
  "working",
]);
const NEGATIVE_CONTEXT_TERMS = new Set([
  "awful",
  "bad",
  "broken",
  "cramped",
  "dark",
  "dirty",
  "disconnected",
  "missing",
  "noisy",
  "poor",
  "slow",
  "terrible",
  "uncomfortable",
  "weak",
]);

function normalizeContextText(text) {
  return typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phrasePattern(phrase) {
  return new RegExp(
    `(^|[^a-z0-9])${escapeRegExp(phrase).replace(/\s+/g, "\\s+")}(?=$|[^a-z0-9])`,
    "i",
  );
}

function isNegatedCue(text, cue) {
  const match = phrasePattern(cue).exec(text);
  if (!match) {
    return false;
  }

  const cueStart = match.index + match[1].length;
  const precedingText = text.slice(0, cueStart);
  return NEGATION_SCOPE_PATTERN.test(precedingText);
}

function tokenizeCueWords(text) {
  return normalizeContextText(text)
    .toLowerCase()
    .match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
}

function getNegationEvidence(text, positiveTerms = POSITIVE_CONTEXT_TERMS, negativeTerms = NEGATIVE_CONTEXT_TERMS) {
  const normalizedText = normalizeContextText(text);
  const words = tokenizeCueWords(normalizedText);
  const evidence = new Set();

  for (let index = 0; index < words.length; index += 1) {
    const current = words[index];
    const next = words[index + 1];
    const isNoLonger = current === "no" && next === "longer";
    const isNegation = current === "not" || /(?:n't)$/.test(current);

    if (!isNoLonger && !isNegation) {
      continue;
    }

    const targetIndex = isNoLonger ? index + 2 : index + 1;
    const target = words[targetIndex];
    if (!target) {
      continue;
    }

    if (negativeTerms.has(target)) {
      evidence.add("positive");
    }
    if (positiveTerms.has(target)) {
      evidence.add("negative");
    }
  }

  if (evidence.size === 1) {
    return [...evidence][0];
  }

  return null;
}

export function getNegatedCuePolarity(text, positiveCues = [], negativeCues = []) {
  const positiveCueNegated = positiveCues.some((cue) => isNegatedCue(text, cue));
  const negativeCueNegated = negativeCues.some((cue) => isNegatedCue(text, cue));

  if (negativeCueNegated && !positiveCueNegated) {
    return "positive";
  }

  if (positiveCueNegated && !negativeCueNegated) {
    return "negative";
  }

  return null;
}

function splitContextSegments(text) {
  const prepared = text
    .replace(/[.!?;]/g, "$&|")
    .split(/\||\s+(?:but|however|although|though|while|except|yet)\s+/i)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return prepared.length > 0 ? prepared : [text];
}

function createInterpretation(label, rawLabel, reason = null) {
  // Context may refine the displayed label, but raw VADER values remain untouched for diagnostics and numeric analytics.
  return {
    sentimentLabel: label,
    contextualOverride: label !== rawLabel,
    contextualOverrideReason: label !== rawLabel ? reason : null,
  };
}

function hasSameSentimentPolarity(left, right) {
  const positiveLabels = new Set(["positive", "very_positive"]);
  const negativeLabels = new Set(["negative", "very_negative"]);

  return (
    (positiveLabels.has(left) && positiveLabels.has(right)) ||
    (negativeLabels.has(left) && negativeLabels.has(right)) ||
    (left === "neutral" && right === "neutral")
  );
}

function interpretLeadingResponse(text, rawLabel) {
  const match = LEADING_RESPONSE_PATTERN.exec(text);
  if (!match) {
    return null;
  }

  const contentSentiment = analyzeSentiment(match[2]);
  const contentLabel = getSentimentLabel(contentSentiment.compound);
  const contentIsMeaningful =
    contentSentiment.compound >= CONTEXT_POSITIVE_EVIDENCE_THRESHOLD ||
    contentSentiment.compound <= -CONTEXT_NEGATIVE_EVIDENCE_THRESHOLD;

  if (!contentIsMeaningful || hasSameSentimentPolarity(contentLabel, rawLabel)) {
    return null;
  }

  return createInterpretation(contentLabel, rawLabel, "contextual_response");
}

function interpretClauseEvidence(text, rawLabel) {
  const segments = splitContextSegments(text);
  if (segments.length < 2) {
    return null;
  }

  const segmentScores = segments.map((segment) => analyzeSentiment(segment).compound);
  const strongestNegative = Math.min(...segmentScores);
  const strongestPositive = Math.max(...segmentScores);

  if (
    rawLabel !== "negative" &&
    rawLabel !== "very_negative" &&
    strongestNegative <= -CONTEXT_NEGATIVE_EVIDENCE_THRESHOLD
  ) {
    return createInterpretation("negative", rawLabel, "mixed_feedback");
  }

  if (
    /\bexcept\b/i.test(text) &&
    (rawLabel === "positive" || rawLabel === "very_positive") &&
    strongestPositive >= CONTEXT_POSITIVE_EVIDENCE_THRESHOLD &&
    strongestNegative === 0
  ) {
    return createInterpretation("neutral", rawLabel, "contrast_exception");
  }

  return null;
}

export function interpretSentimentContext(text, rawSentiment) {
  const normalizedText = normalizeContextText(text);
  const rawLabel = getSentimentLabel(rawSentiment?.compound ?? 0);

  if (isInsufficientContextResponse(normalizedText)) {
    return createInterpretation("insufficient_context", rawLabel, "bare_yes_no");
  }

  if (!normalizedText) {
    return createInterpretation(rawLabel, rawLabel);
  }

  if (EXPECTATION_PATTERN.test(normalizedText) && rawLabel !== "negative" && rawLabel !== "very_negative") {
    return createInterpretation("negative", rawLabel, "expectation_language");
  }

  if (NOT_BAD_PATTERN.test(normalizedText) && (rawLabel === "negative" || rawLabel === "very_negative")) {
    return createInterpretation("neutral", rawLabel, "not_bad_idiom");
  }

  const leadingResponseInterpretation = interpretLeadingResponse(normalizedText, rawLabel);
  if (leadingResponseInterpretation) {
    return leadingResponseInterpretation;
  }

  const negationEvidence = getNegationEvidence(normalizedText);
  if (negationEvidence && !CONTRAST_WORD_PATTERN.test(normalizedText)) {
    if (
      negationEvidence === "positive" &&
      (rawLabel === "negative" || rawLabel === "very_negative")
    ) {
      return createInterpretation("positive", rawLabel, "negation_context");
    }

    if (
      negationEvidence === "negative" &&
      (rawLabel === "positive" || rawLabel === "very_positive")
    ) {
      return createInterpretation("negative", rawLabel, "negation_context");
    }
  }

  return interpretClauseEvidence(normalizedText, rawLabel) ?? createInterpretation(rawLabel, rawLabel);
}
