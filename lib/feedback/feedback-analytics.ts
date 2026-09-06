import {
  analyzeSentiment,
  getSentimentLabel,
  type SentimentAnalysis,
  type SentimentLabel,
} from "../ai/sentiment";
import {
  getNegatedCuePolarity,
  interpretSentimentContext,
  type SentimentContextOverrideReason,
} from "../ai/sentiment-context";
import { normalizeRole } from "../auth/roles";

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
  "insufficient_context",
];

export type FeedbackAspectKey = (typeof FEEDBACK_ASPECT_KEYS)[number];
export type AspectSentiment = "positive" | "neutral" | "negative";
export type DetectedFeedbackAspects = Partial<
  Record<FeedbackAspectKey, AspectSentiment>
>;

export interface FeedbackTextAnalytics {
  contextualOverride: boolean;
  contextualOverrideReason: SentimentContextOverrideReason;
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
  const negatedCuePolarity = getNegatedCuePolarity(
    segment,
    cues.positive,
    cues.negative,
  );
  if (negatedCuePolarity) {
    return negatedCuePolarity;
  }

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
  const interpretation = interpretSentimentContext(text, sentiment);
  const detectedAspects = detectFeedbackAspects(text);

  return {
    contextualOverride: interpretation.contextualOverride,
    contextualOverrideReason: interpretation.contextualOverrideReason,
    detectedAspects,
    extractedKeywords: extractFeedbackKeywords(text, detectedAspects),
    sentiment,
    sentimentClassification: interpretation.sentimentLabel,
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

/** Minimum evidence required before an entity is included in comparative rankings. */
export const MINIMUM_FEEDBACK_SAMPLE_SIZE = 5;

export type FeedbackAnalyticsDirection =
  | "improving"
  | "worsening"
  | "stable"
  | "insufficient";

export interface FeedbackAnalyticsRecord {
  buildingId?: string;
  buildingName?: string;
  categoryRatings?: unknown;
  category_ratings?: unknown;
  contextualOverride?: unknown;
  contextualOverrideReason?: unknown;
  compoundScore?: unknown;
  detectedAspects?: unknown;
  detected_aspects?: unknown;
  gender?: unknown;
  id?: string;
  message?: string;
  overallRating?: unknown;
  overall_rating?: unknown;
  rating?: unknown;
  role?: unknown;
  roomId?: string;
  roomName?: string;
  sentimentClassification?: unknown;
  sentimentLabel?: unknown;
  sentiment_classification?: unknown;
  userRole?: unknown;
  vaderCompoundScore?: unknown;
  vader_compound_score?: unknown;
}

export interface FeedbackAnalyticsMetrics {
  totalReviews: number;
  averageRating: number | null;
  averageCompound: number | null;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  insufficientContextCount: number;
  positiveRate: number;
  neutralRate: number;
  negativeRate: number;
  insufficientContextRate: number;
  categoryRatings: Partial<Record<FeedbackCategoryRatingKey, CategoryPerformance>>;
  aspectMentions: Partial<Record<FeedbackAspectKey, AspectPerformance>>;
}

export interface AspectPerformance {
  total: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
}

export interface CategoryPerformance {
  category: FeedbackCategoryRatingKey;
  label: string;
  averageRating: number | null;
  ratingCount: number;
  lowRatingCount: number;
  lowRatingRate: number;
  negativeMentionCount: number;
  previousAverageRating: number | null;
  previousLowRatingRate: number | null;
  averageChange: number | null;
  lowRatingRateChangePoints: number | null;
  direction: FeedbackAnalyticsDirection;
  reliable: boolean;
}

export interface LocationPerformance extends FeedbackAnalyticsMetrics {
  id: string;
  name: string;
  buildingId: string;
  floor: string | null;
  reliable: boolean;
  trendDirection: FeedbackAnalyticsDirection;
  relevantFacilityConcerns: string[];
}

export interface FeedbackLocationAnalytics {
  buildings: LocationPerformance[];
  floors: LocationPerformance[];
  rooms: LocationPerformance[];
}

export type FeedbackLocationScope = "building" | "floor" | "room";

export function filterFeedbackLocationAnalytics(
  analytics: FeedbackLocationAnalytics,
  scope: FeedbackLocationScope,
  buildingId: string,
  floor: string,
  roomId: string,
  buildingIds: readonly string[] = [buildingId],
): FeedbackLocationAnalytics {
  const scopedBuildingIds = new Set(
    (buildingIds.length ? buildingIds : [buildingId]).filter(Boolean),
  );
  const buildings = analytics.buildings.filter((building) => scopedBuildingIds.has(building.id));

  if (scope === "building") {
    return { ...analytics, buildings };
  }

  if (scope === "floor") {
    return {
      ...analytics,
      buildings,
      floors: analytics.floors.filter((item) => scopedBuildingIds.has(item.buildingId) && item.floor === floor),
      rooms: analytics.rooms.filter((item) => scopedBuildingIds.has(item.buildingId) && item.floor === floor),
    };
  }

  const selectedRoom = analytics.rooms.find((item) => scopedBuildingIds.has(item.buildingId) && item.id === roomId);
  return {
    ...analytics,
    buildings,
    floors: selectedRoom
      ? analytics.floors.filter((item) => item.buildingId === selectedRoom.buildingId && item.floor === selectedRoom.floor)
      : [],
    rooms: selectedRoom ? [selectedRoom] : [],
  };
}

export interface DemographicPerformance extends FeedbackAnalyticsMetrics {
  group: string;
  label: string;
  reliable: boolean;
}

function safePercentage(count: number, total: number) {
  return total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0;
}

function safeAverage(values: number[]) {
  return values.length > 0
    ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
    : null;
}

export function getFeedbackCompoundScore(feedback: FeedbackAnalyticsRecord) {
  const candidates = [
    feedback.vaderCompoundScore,
    feedback.vader_compound_score,
    feedback.compoundScore,
  ];
  const score = candidates.find(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  return score ?? null;
}

function getFeedbackRating(feedback: FeedbackAnalyticsRecord) {
  const candidates = [feedback.overallRating, feedback.overall_rating, feedback.rating];
  const rating = candidates.find(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 1 && value <= 5,
  );
  return rating ?? null;
}

function getAnalyticsSentimentLabel(feedback: FeedbackAnalyticsRecord): SentimentLabel {
  const rawValue = feedback.sentimentClassification ?? feedback.sentiment_classification ?? feedback.sentimentLabel;
  const normalized = typeof rawValue === "string"
    ? rawValue.trim().toLowerCase().replace(/[\s-]+/g, "_")
    : "";
  if (feedback.contextualOverride === true && SENTIMENT_DISTRIBUTION_ORDER.includes(normalized as SentimentLabel)) {
    return normalized as SentimentLabel;
  }

  if (normalized === "insufficient_context") {
    return "insufficient_context";
  }

  const score = getFeedbackCompoundScore(feedback);
  if (score !== null) {
    return getSentimentLabel(score);
  }

  return SENTIMENT_DISTRIBUTION_ORDER.includes(normalized as SentimentLabel)
    ? normalized as SentimentLabel
    : "neutral";
}

function emptyAspectPerformance(): AspectPerformance {
  return { total: 0, positiveCount: 0, neutralCount: 0, negativeCount: 0 };
}

function calculateAspectMentions(items: FeedbackAnalyticsRecord[]) {
  const aspects = Object.fromEntries(
    FEEDBACK_ASPECT_KEYS.map((key) => [key, emptyAspectPerformance()]),
  ) as Record<FeedbackAspectKey, AspectPerformance>;

  items.forEach((feedback) => {
    const detected = normalizeDetectedAspects(
      feedback.detectedAspects ?? feedback.detected_aspects,
    );
    Object.entries(detected).forEach(([key, sentiment]) => {
      const aspect = aspects[key as FeedbackAspectKey];
      if (!aspect || !sentiment) return;
      aspect.total += 1;
      aspect[`${sentiment}Count`] += 1;
    });
  });

  return aspects;
}

export function summarizeFeedbackAnalytics(
  items: FeedbackAnalyticsRecord[],
): FeedbackAnalyticsMetrics {
  const sentimentCounts = {
    positive: 0,
    neutral: 0,
    negative: 0,
    insufficient_context: 0,
  };
  const ratings: number[] = [];
  const compounds: number[] = [];

  items.forEach((feedback) => {
    const label = getAnalyticsSentimentLabel(feedback);
    if (label === "positive" || label === "very_positive") sentimentCounts.positive += 1;
    else if (label === "negative" || label === "very_negative") sentimentCounts.negative += 1;
    else if (label === "insufficient_context") sentimentCounts.insufficient_context += 1;
    else sentimentCounts.neutral += 1;

    const rating = getFeedbackRating(feedback);
    if (rating !== null) ratings.push(rating);
    const compound = getFeedbackCompoundScore(feedback);
    if (compound !== null && label !== "insufficient_context") compounds.push(compound);
  });

  const evaluableReviews = items.length - sentimentCounts.insufficient_context;

  const aspectMentions = calculateAspectMentions(items);
  const categoryRatings: Partial<Record<FeedbackCategoryRatingKey, CategoryPerformance>> = {};

  FEEDBACK_CATEGORY_KEYS.forEach((category) => {
    const values = items
      .map((feedback) => normalizeCategoryRatings(feedback.categoryRatings ?? feedback.category_ratings)[category])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const lowRatingCount = values.filter((value) => value <= 2).length;
    const supportingAspect = category === "equipment_projector" ? "equipment" : category === "internet_connectivity" ? "internet" : category;
    categoryRatings[category] = {
      category,
      label: FEEDBACK_CATEGORY_LABELS[category],
      averageRating: safeAverage(values),
      ratingCount: values.length,
      lowRatingCount,
      lowRatingRate: safePercentage(lowRatingCount, values.length),
      negativeMentionCount: aspectMentions[supportingAspect as FeedbackAspectKey]?.negativeCount ?? 0,
      previousAverageRating: null,
      previousLowRatingRate: null,
      averageChange: null,
      lowRatingRateChangePoints: null,
      direction: "insufficient",
      reliable: values.length >= MINIMUM_FEEDBACK_SAMPLE_SIZE,
    };
  });

  return {
    totalReviews: items.length,
    averageRating: safeAverage(ratings),
    averageCompound: safeAverage(compounds),
    positiveCount: sentimentCounts.positive,
    neutralCount: sentimentCounts.neutral,
    negativeCount: sentimentCounts.negative,
    insufficientContextCount: sentimentCounts.insufficient_context,
    positiveRate: safePercentage(sentimentCounts.positive, evaluableReviews),
    neutralRate: safePercentage(sentimentCounts.neutral, evaluableReviews),
    negativeRate: safePercentage(sentimentCounts.negative, evaluableReviews),
    insufficientContextRate: safePercentage(sentimentCounts.insufficient_context, items.length),
    categoryRatings,
    aspectMentions,
  };
}

function directionFromDifference(difference: number | null, threshold = 0.1): FeedbackAnalyticsDirection {
  if (difference === null) return "insufficient";
  if (difference >= threshold) return "improving";
  if (difference <= -threshold) return "worsening";
  return "stable";
}

export function compareCategoryPerformance(
  currentItems: FeedbackAnalyticsRecord[],
  previousItems: FeedbackAnalyticsRecord[],
  comparable: boolean,
) {
  const current = summarizeFeedbackAnalytics(currentItems);
  const previous = summarizeFeedbackAnalytics(previousItems);

  FEEDBACK_CATEGORY_KEYS.forEach((category) => {
    const item = current.categoryRatings[category];
    const previousItem = previous.categoryRatings[category];
    if (!item) return;
    item.previousAverageRating = previousItem?.averageRating ?? null;
    item.previousLowRatingRate = previousItem?.lowRatingRate ?? null;
    item.averageChange = previousItem && item.averageRating !== null && previousItem.averageRating !== null
      ? Number((item.averageRating - previousItem.averageRating).toFixed(2))
      : null;
    item.lowRatingRateChangePoints = previousItem && item.ratingCount > 0 && previousItem.ratingCount > 0
      ? Number((item.lowRatingRate - previousItem.lowRatingRate).toFixed(1))
      : null;
    item.direction = item.reliable && comparable && (previousItem?.reliable ?? false)
      ? directionFromDifference(item.averageChange, 0.1)
      : "insufficient";
    if (item.direction === "stable" && item.lowRatingRateChangePoints !== null) {
      if (item.lowRatingRateChangePoints >= 5) item.direction = "worsening";
      if (item.lowRatingRateChangePoints <= -5) item.direction = "improving";
    }
  });

  return current.categoryRatings;
}

function getLocationMetrics(items: FeedbackAnalyticsRecord[], id: string, name: string, buildingId: string, floor: string | null, previousItems: FeedbackAnalyticsRecord[], comparable: boolean): LocationPerformance {
  const metrics = summarizeFeedbackAnalytics(items);
  const previousMetrics = summarizeFeedbackAnalytics(previousItems);
  const trendDirection = metrics.totalReviews >= MINIMUM_FEEDBACK_SAMPLE_SIZE && comparable && previousMetrics.totalReviews >= MINIMUM_FEEDBACK_SAMPLE_SIZE && metrics.averageCompound !== null && previousMetrics.averageCompound !== null
    ? directionFromDifference(metrics.averageCompound - previousMetrics.averageCompound)
    : "insufficient";
  const relevantFacilityConcerns = Object.entries(metrics.aspectMentions)
    .filter(([, aspect]) => aspect && aspect.negativeCount > 0)
    .sort(([, left], [, right]) => (right?.negativeCount ?? 0) - (left?.negativeCount ?? 0))
    .slice(0, 3)
    .map(([aspect]) => FEEDBACK_ASPECT_LABELS[aspect as FeedbackAspectKey]);

  return {
    ...metrics,
    id,
    name,
    buildingId,
    floor,
    reliable: metrics.totalReviews >= MINIMUM_FEEDBACK_SAMPLE_SIZE,
    trendDirection,
    relevantFacilityConcerns,
  };
}

export function buildFeedbackLocationAnalytics(
  currentItems: FeedbackAnalyticsRecord[],
  previousItems: FeedbackAnalyticsRecord[],
  rooms: Array<{ id: string; name: string; buildingId: string; buildingName?: string; floor: string }>,
  comparable = false,
): FeedbackLocationAnalytics {
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const buildingGroups = new Map<string, FeedbackAnalyticsRecord[]>();
  const floorGroups = new Map<string, FeedbackAnalyticsRecord[]>();
  const roomGroups = new Map<string, FeedbackAnalyticsRecord[]>();

  currentItems.forEach((feedback) => {
    const room = feedback.roomId ? roomById.get(feedback.roomId) : undefined;
    const buildingId = room?.buildingId ?? feedback.buildingId ?? "unknown";
    const floor = room?.floor ?? null;
    const building = buildingGroups.get(buildingId) ?? [];
    building.push(feedback);
    buildingGroups.set(buildingId, building);
    if (floor !== null) {
      const key = `${buildingId}::${floor}`;
      const group = floorGroups.get(key) ?? [];
      group.push(feedback);
      floorGroups.set(key, group);
    }
    if (feedback.roomId) {
      const group = roomGroups.get(feedback.roomId) ?? [];
      group.push(feedback);
      roomGroups.set(feedback.roomId, group);
    }
  });

  rooms.forEach((room) => {
    if (!buildingGroups.has(room.buildingId)) buildingGroups.set(room.buildingId, []);
    const floorKey = `${room.buildingId}::${room.floor}`;
    if (!floorGroups.has(floorKey)) floorGroups.set(floorKey, []);
    if (!roomGroups.has(room.id)) roomGroups.set(room.id, []);
  });

  const previousFor = (items: FeedbackAnalyticsRecord[], predicate: (feedback: FeedbackAnalyticsRecord) => boolean) => items.filter(predicate);
  const buildings = [...buildingGroups.entries()].map(([id, items]) => getLocationMetrics(
    items,
    id,
    items[0]?.buildingName ?? id,
    id,
    null,
    previousFor(previousItems, (feedback) => (feedback.buildingId ?? "unknown") === id),
    comparable,
  ));
  const floors = [...floorGroups.entries()].map(([key, items]) => {
    const [buildingId, floor] = key.split("::");
    return getLocationMetrics(
      items,
      key,
      floor,
      buildingId,
      floor,
      previousFor(previousItems, (feedback) => {
        const room = feedback.roomId ? roomById.get(feedback.roomId) : undefined;
        return room?.buildingId === buildingId && room.floor === floor;
      }),
      comparable,
    );
  });
  const roomsAnalytics = [...roomGroups.entries()].map(([id, items]) => {
    const room = roomById.get(id);
    return getLocationMetrics(
      items,
      id,
      room?.name ?? items[0]?.roomName ?? id,
      room?.buildingId ?? items[0]?.buildingId ?? "unknown",
      room?.floor ?? null,
      previousFor(previousItems, (feedback) => feedback.roomId === id),
      comparable,
    );
  });

  return { buildings, floors, rooms: roomsAnalytics };
}

const DEMOGRAPHIC_GROUPS = [
  { group: "Student", label: "Students", get: (feedback: FeedbackAnalyticsRecord) => feedback.role ?? feedback.userRole },
  { group: "Faculty Professor", label: "Faculty", get: (feedback: FeedbackAnalyticsRecord) => feedback.role ?? feedback.userRole },
  { group: "Utility Staff", label: "Utility Staff", get: (feedback: FeedbackAnalyticsRecord) => feedback.role ?? feedback.userRole },
  { group: "Administrator", label: "Administrators", get: (feedback: FeedbackAnalyticsRecord) => feedback.role ?? feedback.userRole },
  { group: "gender:male", label: "Male", get: (feedback: FeedbackAnalyticsRecord) => feedback.gender },
  { group: "gender:female", label: "Female", get: (feedback: FeedbackAnalyticsRecord) => feedback.gender },
  { group: "gender:non_binary", label: "Non-binary", get: (feedback: FeedbackAnalyticsRecord) => feedback.gender },
  { group: "gender:prefer_not_to_say", label: "Prefer not to say", get: (feedback: FeedbackAnalyticsRecord) => feedback.gender },
] as const;

export function buildFeedbackDemographicAnalytics(
  items: FeedbackAnalyticsRecord[],
  minimumSampleSize = MINIMUM_FEEDBACK_SAMPLE_SIZE,
): DemographicPerformance[] {
  return DEMOGRAPHIC_GROUPS.map(({ group, label, get }) => {
    const groupItems = items.filter((feedback) => {
      const value = get(feedback);
      if (group.startsWith("gender:")) return value === group.slice("gender:".length);
      return normalizeRole(typeof value === "string" ? value : null) === group;
    });
    const metrics = summarizeFeedbackAnalytics(groupItems);
    return {
      ...metrics,
      group,
      label,
      reliable: groupItems.length >= minimumSampleSize,
    };
  }).filter((group) => group.totalReviews > 0);
}
