import {
  analyzeSentiment,
  getSentimentLabel,
  type SentimentAnalysis,
  type SentimentLabel,
} from "../ai/sentiment";

export const FEEDBACK_CATEGORY_KEYS = [
  "cleanliness",
  "comfort",
  "air_conditioning",
  "equipment_projector",
  "internet_connectivity",
] as const;

export const FEEDBACK_CATEGORY_LABELS: Record<
  FeedbackCategoryRatingKey,
  string
> = {
  cleanliness: "Cleanliness",
  comfort: "Comfort",
  air_conditioning: "Air Conditioning",
  equipment_projector: "Equipment/Projector",
  internet_connectivity: "Internet Connectivity",
};

export type FeedbackCategoryRatingKey =
  (typeof FEEDBACK_CATEGORY_KEYS)[number];
export type FeedbackCategoryRatings = Record<FeedbackCategoryRatingKey, number>;

export const FEEDBACK_ASPECT_KEYS = [
  "cleanliness",
  "comfort",
  "air_conditioning",
  "equipment",
  "internet",
  "seating",
  "lighting",
] as const;

export const FEEDBACK_ASPECT_LABELS: Record<FeedbackAspectKey, string> = {
  cleanliness: "Cleanliness",
  comfort: "Comfort",
  air_conditioning: "Air Conditioning",
  equipment: "Equipment",
  internet: "Internet",
  seating: "Seating",
  lighting: "Lighting",
};

export const SENTIMENT_DISTRIBUTION_ORDER: SentimentLabel[] = [
  "very_positive",
  "positive",
  "neutral",
  "negative",
  "very_negative",
];

export type FeedbackAspectKey = (typeof FEEDBACK_ASPECT_KEYS)[number];
export type AspectSentiment = "positive" | "neutral" | "negative";
export type DetectedFeedbackAspects = Partial<
  Record<FeedbackAspectKey, AspectSentiment>
>;

export interface FeedbackTextAnalytics {
  detectedAspects: DetectedFeedbackAspects;
  extractedKeywords: string[];
  sentiment: SentimentAnalysis;
  sentimentClassification: SentimentLabel;
}

const ASPECT_KEYWORDS: Record<FeedbackAspectKey, string[]> = {
  cleanliness: [
    "clean",
    "cleaned",
    "cleanliness",
    "dirty",
    "dust",
    "dusty",
    "trash",
    "garbage",
    "messy",
    "stain",
    "stained",
    "smelly",
    "odor",
    "odour",
  ],
  comfort: [
    "comfortable",
    "comfort",
    "uncomfortable",
    "cozy",
    "spacious",
    "cramped",
    "quiet",
    "noisy",
    "warm",
    "hot",
  ],
  air_conditioning: [
    "aircon",
    "air con",
    "air conditioning",
    "ac",
    "a/c",
    "conditioner",
    "cold",
    "cool",
    "cooling",
    "hot",
    "warm",
    "humid",
    "ventilation",
    "fan",
    "temperature",
  ],
  equipment: [
    "equipment",
    "projector",
    "tv",
    "television",
    "screen",
    "monitor",
    "speaker",
    "microphone",
    "mic",
    "whiteboard",
    "marker",
    "cable",
    "outlet",
    "extension",
    "remote",
    "computer",
  ],
  internet: [
    "internet",
    "wifi",
    "wi-fi",
    "connection",
    "connectivity",
    "network",
    "online",
    "signal",
    "router",
    "bandwidth",
  ],
  seating: [
    "seat",
    "seats",
    "seating",
    "chair",
    "chairs",
    "desk",
    "desks",
    "table",
    "tables",
  ],
  lighting: [
    "light",
    "lights",
    "lighting",
    "bright",
    "dark",
    "dim",
    "bulb",
    "lamp",
    "flicker",
    "flickering",
  ],
};

const ASPECT_SENTIMENT_CUES: Record<
  FeedbackAspectKey,
  { positive: string[]; negative: string[] }
> = {
  cleanliness: {
    positive: ["clean", "cleaned", "tidy", "spotless", "fresh"],
    negative: [
      "dirty",
      "dust",
      "dusty",
      "trash",
      "garbage",
      "messy",
      "stain",
      "stained",
      "smelly",
      "odor",
      "odour",
    ],
  },
  comfort: {
    positive: ["comfortable", "comfort", "cozy", "spacious", "quiet"],
    negative: ["uncomfortable", "cramped", "noisy", "hot", "warm", "hard"],
  },
  air_conditioning: {
    positive: [
      "cold",
      "cool",
      "cooling",
      "working",
      "comfortable temperature",
      "well ventilated",
    ],
    negative: [
      "not cold",
      "not cool",
      "not cooling",
      "no aircon",
      "no ac",
      "not working",
      "broken",
      "hot",
      "warm",
      "humid",
      "weak",
    ],
  },
  equipment: {
    positive: ["working", "available", "ready", "clear", "complete"],
    negative: [
      "not working",
      "broken",
      "missing",
      "damaged",
      "blurry",
      "no projector",
      "no cable",
      "no remote",
    ],
  },
  internet: {
    positive: ["fast", "stable", "strong", "reliable", "working"],
    negative: [
      "slow",
      "weak",
      "unstable",
      "disconnected",
      "not working",
      "no internet",
      "no wifi",
      "no wi-fi",
      "poor signal",
    ],
  },
  seating: {
    positive: ["comfortable", "enough", "available", "spacious"],
    negative: ["broken", "uncomfortable", "not enough", "missing", "cramped"],
  },
  lighting: {
    positive: ["bright", "well lit", "working", "clear"],
    negative: ["dark", "dim", "flicker", "flickering", "broken", "not working"],
  },
};

const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "although",
  "and",
  "any",
  "are",
  "because",
  "been",
  "but",
  "can",
  "could",
  "did",
  "does",
  "for",
  "from",
  "had",
  "has",
  "have",
  "into",
  "just",
  "not",
  "our",
  "out",
  "really",
  "room",
  "rooms",
  "still",
  "that",
  "the",
  "their",
  "there",
  "this",
  "too",
  "very",
  "was",
  "were",
  "with",
  "would",
]);

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phraseRegex(phrase: string) {
  return new RegExp(
    `(^|[^a-z0-9])${escapeRegExp(phrase).replace(/\s+/g, "\\s+")}([^a-z0-9]|$)`,
    "i"
  );
}

function containsPhrase(text: string, phrase: string) {
  return phraseRegex(phrase).test(text);
}

function normalizeText(text: string | null | undefined) {
  return typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
}

function splitFeedbackSegments(text: string) {
  const prepared = text
    .replace(/[.!?;]/g, "$&|")
    .split(/\||\s+(?:but|however|although|though|while|except|yet)\s+/i)
    .map((segment) => segment.trim())
    .filter(Boolean);

  return prepared.length > 0 ? prepared : [text];
}

function sentimentFromScore(score: number): AspectSentiment {
  if (score >= 0.05) {
    return "positive";
  }

  if (score <= -0.05) {
    return "negative";
  }

  return "neutral";
}

function countCueMatches(text: string, cues: string[]) {
  return cues.reduce(
    (count, cue) => count + (containsPhrase(text, cue) ? 1 : 0),
    0
  );
}

function classifyAspectSegment(
  aspect: FeedbackAspectKey,
  segment: string
): AspectSentiment {
  const cues = ASPECT_SENTIMENT_CUES[aspect];
  const positiveCueCount = countCueMatches(segment, cues.positive);
  const negativeCueCount = countCueMatches(segment, cues.negative);
  const compound = analyzeSentiment(segment).compound;

  if (negativeCueCount > 0 && negativeCueCount >= positiveCueCount) {
    return "negative";
  }

  if (positiveCueCount > negativeCueCount && compound > -0.4) {
    return "positive";
  }

  return sentimentFromScore(compound);
}

function hasAspectKeyword(segment: string, aspect: FeedbackAspectKey) {
  return ASPECT_KEYWORDS[aspect].some((keyword) =>
    containsPhrase(segment, keyword)
  );
}

function chooseAspectSentiment(results: AspectSentiment[]) {
  const positiveCount = results.filter((result) => result === "positive").length;
  const negativeCount = results.filter((result) => result === "negative").length;

  if (negativeCount > 0 && negativeCount >= positiveCount) {
    return "negative";
  }

  if (positiveCount > 0) {
    return "positive";
  }

  return "neutral";
}

function normalizeAspectKey(value: string): FeedbackAspectKey | null {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s/-]+/g, "_");

  if (normalized === "aircon" || normalized === "ac") {
    return "air_conditioning";
  }

  if (normalized === "equipment_projector") {
    return "equipment";
  }

  return FEEDBACK_ASPECT_KEYS.includes(normalized as FeedbackAspectKey)
    ? (normalized as FeedbackAspectKey)
    : null;
}

function normalizeAspectSentiment(value: unknown): AspectSentiment | null {
  return value === "positive" || value === "neutral" || value === "negative"
    ? value
    : null;
}

function addKeyword(keywords: string[], keyword: string) {
  const normalized = keyword.toLowerCase().replace(/\s+/g, " ").trim();

  if (!normalized || keywords.includes(normalized)) {
    return;
  }

  keywords.push(normalized);
}

function extractWords(text: string) {
  return (
    text
      .toLowerCase()
      .match(/[a-z0-9][a-z0-9/-]*/g)
      ?.filter((word) => word.length >= 3 || word === "ac")
      .filter((word) => !STOP_WORDS.has(word)) ?? []
  );
}

export function detectFeedbackAspects(
  text: string | null | undefined
): DetectedFeedbackAspects {
  const normalizedText = normalizeText(text);

  if (!normalizedText) {
    return {};
  }

  const segments = splitFeedbackSegments(normalizedText);
  const detectedAspects: DetectedFeedbackAspects = {};

  FEEDBACK_ASPECT_KEYS.forEach((aspect) => {
    const matchingSegments = segments.filter((segment) =>
      hasAspectKeyword(segment, aspect)
    );

    if (matchingSegments.length === 0) {
      return;
    }

    detectedAspects[aspect] = chooseAspectSentiment(
      matchingSegments.map((segment) => classifyAspectSegment(aspect, segment))
    );
  });

  return detectedAspects;
}

export function extractFeedbackKeywords(
  text: string | null | undefined,
  detectedAspects: DetectedFeedbackAspects = detectFeedbackAspects(text)
) {
  const normalizedText = normalizeText(text);
  const keywords: string[] = [];

  if (!normalizedText) {
    return keywords;
  }

  FEEDBACK_ASPECT_KEYS.forEach((aspect) => {
    if (detectedAspects[aspect]) {
      addKeyword(keywords, FEEDBACK_ASPECT_LABELS[aspect].toLowerCase());
    }

    ASPECT_KEYWORDS[aspect].forEach((keyword) => {
      if (containsPhrase(normalizedText, keyword)) {
        addKeyword(keywords, keyword);
      }
    });
  });

  extractWords(normalizedText).forEach((word) => addKeyword(keywords, word));

  return keywords.slice(0, 12);
}

export function analyzeFeedbackText(
  text: string | null | undefined
): FeedbackTextAnalytics {
  const sentiment = analyzeSentiment(text);
  const detectedAspects = detectFeedbackAspects(text);

  return {
    detectedAspects,
    extractedKeywords: extractFeedbackKeywords(text, detectedAspects),
    sentiment,
    sentimentClassification: getSentimentLabel(sentiment.compound),
  };
}

export function normalizeDetectedAspects(
  value: unknown
): DetectedFeedbackAspects {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce(
    (aspects, [rawKey, rawValue]) => {
      const key = normalizeAspectKey(rawKey);
      const sentiment = normalizeAspectSentiment(rawValue);

      if (key && sentiment) {
        aspects[key] = sentiment;
      }

      return aspects;
    },
    {} as DetectedFeedbackAspects
  );
}

export function normalizeFeedbackKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((keyword): keyword is string => typeof keyword === "string")
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean)
    .filter((keyword, index, keywords) => keywords.indexOf(keyword) === index);
}

export function normalizeCategoryRatings(
  value: unknown
): Partial<FeedbackCategoryRatings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return FEEDBACK_CATEGORY_KEYS.reduce((ratings, key) => {
    const rawValue = (value as Record<string, unknown>)[key];

    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      ratings[key] = Math.max(1, Math.min(5, Math.round(rawValue)));
    }

    return ratings;
  }, {} as Partial<FeedbackCategoryRatings>);
}
