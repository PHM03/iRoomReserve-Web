import {
  averageSentimentScores,
  getSentimentLabel,
  type SentimentLabel,
} from "../ai/sentiment";
import {
  FEEDBACK_ASPECT_KEYS,
  FEEDBACK_ASPECT_LABELS,
  SENTIMENT_DISTRIBUTION_ORDER,
  normalizeDetectedAspects,
  type DetectedFeedbackAspects,
  type FeedbackAspectKey,
} from "./feedback-analytics";
import {
  normalizeUserGender,
  USER_GENDER_LABELS,
  USER_GENDER_VALUES,
  type UserGender,
} from "../auth/profile-types";

export const FEEDBACK_GENDER_GROUP_ORDER: FeedbackGenderGroup[] = [
  ...USER_GENDER_VALUES,
  "not_specified",
];

export type FeedbackGenderGroup = UserGender | "not_specified";

export interface FeedbackGenderSentimentSummary {
  group: FeedbackGenderGroup;
  label: string;
  total: number;
  suppressed: boolean;
  summary: FeedbackSentimentSummary | null;
}

export interface FeedbackSentimentFields {
  compoundScore?: number | null;
  vaderCompoundScore?: number | null;
  vader_compound_score?: number | null;
  positiveScore?: number | null;
  neutralScore?: number | null;
  negativeScore?: number | null;
  sentimentLabel?: SentimentLabel | string | null;
  sentimentClassification?: SentimentLabel | string | null;
  sentiment_classification?: SentimentLabel | string | null;
  detectedAspects?: DetectedFeedbackAspects | null;
  detected_aspects?: DetectedFeedbackAspects | null;
}

export interface FeedbackSentimentDistributionItem {
  count: number;
  label: SentimentLabel;
  percentage: number;
}

export interface FeedbackAspectMentionSummary {
  aspect: FeedbackAspectKey;
  label: string;
  negativeCount: number;
  neutralCount: number;
  positiveCount: number;
  total: number;
}

export interface FeedbackAspectRanking {
  aspect: FeedbackAspectKey;
  count: number;
  label: string;
}

export interface FeedbackSentimentSummary {
  aspectMentions: FeedbackAspectMentionSummary[];
  averageCompoundScore: number;
  mostMentionedIssues: FeedbackAspectRanking[];
  mostPraisedAspects: FeedbackAspectRanking[];
  negativeCount: number;
  negativePercentage: number;
  neutralCount: number;
  neutralPercentage: number;
  positiveCount: number;
  positivePercentage: number;
  sentimentDistribution: FeedbackSentimentDistributionItem[];
  total: number;
  veryNegativeCount: number;
  veryNegativePercentage: number;
  veryPositiveCount: number;
  veryPositivePercentage: number;
  genderBreakdown?: FeedbackGenderSentimentSummary[];
}

export interface FeedbackRoomSentimentSummary {
  roomId: string;
  roomName: string;
  total: number;
  summary: FeedbackSentimentSummary | null;
}

function isSentimentLabel(value: unknown): value is SentimentLabel {
  return SENTIMENT_DISTRIBUTION_ORDER.includes(value as SentimentLabel);
}

function normalizeSentimentLabel(value: unknown): SentimentLabel | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");

  return isSentimentLabel(normalized) ? normalized : null;
}

function toPercentage(count: number, total: number) {
  if (total === 0) {
    return 0;
  }

  return Number(((count / total) * 100).toFixed(1));
}

function getCompoundScore(feedback: FeedbackSentimentFields) {
  if (typeof feedback.vaderCompoundScore === "number") {
    return feedback.vaderCompoundScore;
  }

  if (typeof feedback.vader_compound_score === "number") {
    return feedback.vader_compound_score;
  }

  return typeof feedback.compoundScore === "number"
    ? feedback.compoundScore
    : null;
}

function getStoredSentimentLabel(feedback: FeedbackSentimentFields) {
  return (
    normalizeSentimentLabel(feedback.sentimentClassification) ??
    normalizeSentimentLabel(feedback.sentiment_classification) ??
    normalizeSentimentLabel(feedback.sentimentLabel)
  );
}

function createAspectMentionSummary(): FeedbackAspectMentionSummary[] {
  return FEEDBACK_ASPECT_KEYS.map((aspect) => ({
    aspect,
    label: FEEDBACK_ASPECT_LABELS[aspect],
    negativeCount: 0,
    neutralCount: 0,
    positiveCount: 0,
    total: 0,
  }));
}

function updateAspectMentionSummary(
  aspectMentions: FeedbackAspectMentionSummary[],
  detectedAspects: DetectedFeedbackAspects
) {
  Object.entries(detectedAspects).forEach(([aspect, sentiment]) => {
    const mention = aspectMentions.find((item) => item.aspect === aspect);

    if (!mention) {
      return;
    }

    mention.total += 1;

    if (sentiment === "positive") {
      mention.positiveCount += 1;
      return;
    }

    if (sentiment === "negative") {
      mention.negativeCount += 1;
      return;
    }

    mention.neutralCount += 1;
  });
}

function rankAspects(
  aspectMentions: FeedbackAspectMentionSummary[],
  field: "negativeCount" | "positiveCount"
): FeedbackAspectRanking[] {
  return aspectMentions
    .filter((mention) => mention[field] > 0)
    .map((mention) => ({
      aspect: mention.aspect,
      count: mention[field],
      label: mention.label,
    }))
    .sort(
      (left, right) =>
        right.count - left.count || left.label.localeCompare(right.label)
    );
}

export function resolveFeedbackSentimentLabel(
  feedback: FeedbackSentimentFields
): SentimentLabel {
  const compoundScore = getCompoundScore(feedback);

  if (typeof compoundScore === "number") {
    return getSentimentLabel(compoundScore);
  }

  return getStoredSentimentLabel(feedback) ?? "neutral";
}

export function summarizeFeedbackSentiment(
  feedbackItems: FeedbackSentimentFields[]
): FeedbackSentimentSummary {
  const aspectMentions = createAspectMentionSummary();
  const distributionCounts = SENTIMENT_DISTRIBUTION_ORDER.reduce(
    (counts, label) => {
      counts[label] = 0;
      return counts;
    },
    {} as Record<SentimentLabel, number>
  );

  feedbackItems.forEach((feedback) => {
    const sentimentLabel = resolveFeedbackSentimentLabel(feedback);
    distributionCounts[sentimentLabel] += 1;
    updateAspectMentionSummary(
      aspectMentions,
      normalizeDetectedAspects(feedback.detectedAspects ?? feedback.detected_aspects)
    );
  });

  const total = feedbackItems.length;
  const summary = {
    aspectMentions,
    averageCompoundScore: Number(
      averageSentimentScores(
        feedbackItems.map((feedback) => getCompoundScore(feedback))
      ).toFixed(3)
    ),
    mostMentionedIssues: rankAspects(aspectMentions, "negativeCount"),
    mostPraisedAspects: rankAspects(aspectMentions, "positiveCount"),
    negativeCount: distributionCounts.negative,
    negativePercentage: toPercentage(distributionCounts.negative, total),
    neutralCount: distributionCounts.neutral,
    neutralPercentage: toPercentage(distributionCounts.neutral, total),
    positiveCount: distributionCounts.positive,
    positivePercentage: toPercentage(distributionCounts.positive, total),
    sentimentDistribution: SENTIMENT_DISTRIBUTION_ORDER.map((label) => ({
      count: distributionCounts[label],
      label,
      percentage: toPercentage(distributionCounts[label], total),
    })),
    total,
    veryNegativeCount: distributionCounts.very_negative,
    veryNegativePercentage: toPercentage(distributionCounts.very_negative, total),
    veryPositiveCount: distributionCounts.very_positive,
    veryPositivePercentage: toPercentage(distributionCounts.very_positive, total),
  };

  return summary;
}

export function summarizeFeedbackSentimentByRoom(
  rooms: Array<{ id: string; name: string }>,
  feedbackItems: Array<FeedbackSentimentFields & { roomId?: string }>
): FeedbackRoomSentimentSummary[] {
  const feedbackByRoom = new Map<string, Array<FeedbackSentimentFields>>();

  feedbackItems.forEach((feedback) => {
    if (!feedback.roomId) {
      return;
    }

    const roomFeedback = feedbackByRoom.get(feedback.roomId) ?? [];
    roomFeedback.push(feedback);
    feedbackByRoom.set(feedback.roomId, roomFeedback);
  });

  return rooms.map((room) => {
    const roomFeedback = feedbackByRoom.get(room.id) ?? [];

    return {
      roomId: room.id,
      roomName: room.name,
      total: roomFeedback.length,
      summary: roomFeedback.length > 0 ? summarizeFeedbackSentiment(roomFeedback) : null,
    };
  });
}

export function getFeedbackGenderGroup(value: unknown): FeedbackGenderGroup {
  return normalizeUserGender(value) ?? "not_specified";
}

export function getFeedbackGenderLabel(group: FeedbackGenderGroup) {
  return group === "not_specified" ? "Not specified" : USER_GENDER_LABELS[group];
}

/**
 * Gender is resolved from the user's current profile at read time. It is not
 * copied into feedback documents, so historical feedback follows the current
 * profile value rather than a gender snapshot from submission time.
 */
export function summarizeFeedbackSentimentByGender(
  feedbackItems: Array<FeedbackSentimentFields & { gender?: unknown }>,
  minimumSampleSize = 5
): FeedbackGenderSentimentSummary[] {
  const groups = new Map<FeedbackGenderGroup, Array<FeedbackSentimentFields>>();

  feedbackItems.forEach((feedback) => {
    const group = getFeedbackGenderGroup(feedback.gender);
    const groupItems = groups.get(group) ?? [];
    groupItems.push(feedback);
    groups.set(group, groupItems);
  });

  return FEEDBACK_GENDER_GROUP_ORDER.filter((group) => groups.has(group)).map((group) => {
    const groupItems = groups.get(group) ?? [];
    const suppressed = groupItems.length < minimumSampleSize;

    return {
      group,
      label: getFeedbackGenderLabel(group),
      total: groupItems.length,
      suppressed,
      summary: suppressed ? null : summarizeFeedbackSentiment(groupItems),
    };
  });
}
